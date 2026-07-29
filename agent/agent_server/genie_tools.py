"""Genie Agent MCP helpers — ask + poll until completed."""

import json
import logging
import time

from agents import function_tool
from databricks.sdk import WorkspaceClient

from agent_server.genie_mcp import genie_mcp_path, genie_tool_names, is_space_mode

logger = logging.getLogger(__name__)

MAX_POLLS = 45
POLL_INTERVAL_SEC = 2.0

# Genie message states, which are NOT the workspace-wide tool's lowercase enum
# (in_progress/completed/failed/...). Both vocabularies reach _normalize below.
_SPACE_TERMINAL_OK = ("COMPLETED",)
_SPACE_TERMINAL_BAD = ("FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED")


def _app_workspace_client() -> WorkspaceClient:
    return WorkspaceClient()


def _mcp_tool_call(name: str, arguments: dict) -> dict:
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    }
    # Resolved per call from GENIE_MCP_MODE, not a module constant. The constant that
    # used to live here hardcoded workspace-wide Genie, so a space-scoped deployment
    # answered from the wrong backend while every config probe still said mode=space.
    raw = _app_workspace_client().api_client.do(
        "POST", genie_mcp_path(), body=body
    )
    if not isinstance(raw, dict):
        return {"error": f"non-dict MCP response: {str(raw)[:300]}"}
    # A JSON-RPC error carries `error` and no `result`. Dropping it on the floor and
    # returning {} is what surfaced a precise server message -- "BAD_REQUEST: Tool
    # genie_ask does not exist" -- to the user as the uninformative "Genie ask
    # failed: {}", with nothing anywhere naming the tool or the endpoint.
    if raw.get("error") is not None:
        err = raw["error"]
        message = err.get("message") if isinstance(err, dict) else str(err)
        logger.error("Genie MCP tool %s failed: %s", name, message)
        return {"error": message or json.dumps(err)[:500]}
    result = raw.get("result") or {}
    structured = result.get("structuredContent")
    if structured:
        return structured
    content = result.get("content") or []
    if content and isinstance(content[0], dict) and content[0].get("text"):
        try:
            return json.loads(content[0]["text"])
        except json.JSONDecodeError:
            return {"text": content[0]["text"]}
    return result


def _render_space_answer(content: dict) -> str:
    """Markdown from a space-scoped response's `content`.

    Space mode has no `final_answer`; the answer lives in textAttachments plus
    queryAttachments (description, SQL, and an inline statement_response).
    """
    parts: list[str] = []
    for text in content.get("textAttachments") or []:
        if text:
            parts.append(str(text))

    for attachment in content.get("queryAttachments") or []:
        if not isinstance(attachment, dict):
            continue
        if attachment.get("description"):
            parts.append(str(attachment["description"]))
        if attachment.get("query"):
            parts.append(f"```sql\n{attachment['query']}\n```")
        table = _render_statement(attachment.get("statement_response"))
        if table:
            parts.append(table)

    return "\n\n".join(parts).strip()


def _render_statement(statement: object) -> str:
    """A markdown table from a Genie statement_response, or "" if there is none."""
    if not isinstance(statement, dict):
        return ""
    columns = [
        col.get("name", "")
        for col in (
            ((statement.get("manifest") or {}).get("schema") or {}).get("columns") or []
        )
    ]
    rows = ((statement.get("result") or {}).get("data_array")) or []
    if not columns or not rows:
        return ""

    def cells(row: object) -> list[str]:
        # JSON_ARRAY comes back as {"values": [{"string_value": "x"}]}, but plain
        # lists of scalars also occur; render both rather than picking one and
        # emitting an empty table for the other.
        if isinstance(row, dict):
            values = row.get("values") or []
            return [
                str(v.get("string_value", "")) if isinstance(v, dict) else str(v)
                for v in values
            ]
        if isinstance(row, list):
            return ["" if v is None else str(v) for v in row]
        return [str(row)]

    lines = [
        "| " + " | ".join(columns) + " |",
        "| " + " | ".join("---" for _ in columns) + " |",
    ]
    for row in rows[:100]:
        lines.append("| " + " | ".join(cells(row)) + " |")
    if len(rows) > 100:
        lines.append(f"\n_({len(rows)} rows; first 100 shown.)_")
    return "\n".join(lines)


def _normalize(payload: dict) -> dict:
    """One shape for both backends: conversation_id, response_id, status, final_answer.

    Space mode returns camelCase ids, uppercase Genie message states, and the answer
    inside `content`. Normalizing at the boundary keeps ask/poll single-path instead
    of branching on the mode at every field access.
    """
    if payload.get("error"):
        return {"status": "failed", "error": payload["error"]}

    if "conversationId" not in payload and "messageId" not in payload:
        return payload  # already the workspace-wide shape

    raw_status = str(payload.get("status") or "").upper()
    if raw_status in _SPACE_TERMINAL_OK:
        status = "completed"
    elif raw_status in _SPACE_TERMINAL_BAD:
        status = "failed"
    else:
        status = "in_progress"

    normalized = {
        "conversation_id": payload.get("conversationId"),
        "response_id": payload.get("messageId"),
        "status": status,
        "genie_status": raw_status,
    }
    answer = _render_space_answer(payload.get("content") or {})
    if answer:
        normalized["final_answer"] = answer
    return normalized


def _poll_genie(conversation_id: str, response_id: str) -> dict:
    _, poll_tool = genie_tool_names()
    # The space-scoped tool names its second argument message_id; the workspace-wide
    # one calls it response_id. Same value, and passing the wrong key fails as an
    # invalid-argument error rather than anything mentioning Genie.
    id_key = "message_id" if is_space_mode() else "response_id"
    for _ in range(MAX_POLLS):
        payload = _normalize(
            _mcp_tool_call(
                poll_tool,
                {"conversation_id": conversation_id, id_key: response_id},
            )
        )
        status = payload.get("status")
        if status == "completed":
            return payload
        if status == "failed":
            return payload
        time.sleep(POLL_INTERVAL_SEC)
    return {"status": "timeout", "message": "Genie poll timed out"}


_BROAD_DATA_PROMPTS = (
    "tell me about my data",
    "what is my data",
    "what's my data",
    "describe my data",
    "my data",
)

_TABLE_DETAIL_SUFFIX = (
    " List the catalogs, schemas, and tables available. For each table, give its "
    "purpose, key columns, and approximate row count. Prioritize concrete tables "
    "and their columns over dashboards or Genie spaces."
)


def _augment_broad_question(question: str) -> str:
    normalized = question.strip().lower().rstrip("?.! ")
    if normalized in _BROAD_DATA_PROMPTS:
        return question.strip() + _TABLE_DETAIL_SUFFIX
    return question


@function_tool
def ask_genie(question: str) -> str:
    """Query Genie Agent over workspace data. Use for any question about tables, catalogs, dashboards, or 'my data'. For broad questions, it automatically requests table- and column-level detail. Polls until Genie completes."""
    question = _augment_broad_question(question)
    ask_tool, _ = genie_tool_names()
    # Space mode calls the question `query`; workspace-wide calls it `question`.
    arg = "query" if is_space_mode() else "question"
    ask = _normalize(_mcp_tool_call(ask_tool, {arg: question}))
    if ask.get("status") == "completed" and ask.get("final_answer"):
        return ask["final_answer"]
    conversation_id = ask.get("conversation_id")
    response_id = ask.get("response_id")
    if not conversation_id or not response_id:
        # Name the endpoint and tool. Without them this read "Genie ask failed: {}",
        # which says nothing about which backend was asked or what it objected to.
        detail = ask.get("error") or json.dumps(ask)[:2000]
        return (
            f"Genie ask failed via tool '{ask_tool}' at {genie_mcp_path()}: {detail}"
        )
    result = _poll_genie(conversation_id, response_id)
    if result.get("status") == "completed":
        return result.get("final_answer") or json.dumps(result)[:8000]
    return json.dumps(result)[:2000]


GENIE_TOOLS = [ask_genie]

# Composed onto MEMORY_INSTRUCTIONS in agent.py so utils_memory.py stays a pristine,
# regenerable copy of the managed-memory skill (this is the local Genie deviation).
GENIE_INSTRUCTIONS = """For any question about workspace data, tables, catalogs, dashboards, metrics, or phrases like "my data", you MUST call ask_genie first with the user's question — do not ask the user to clarify catalog/schema first. When the user's question is broad (e.g. "tell me about my data"), phrase the ask_genie question to request concrete data assets: the catalogs, schemas, and tables available, plus each table's purpose, key columns, and row counts where possible (for example: "What catalogs, schemas, and tables do I have? For each table, give its purpose, key columns, and approximate row count."). If the first Genie answer stays high-level (only dashboards or Genie spaces, no tables/columns), call ask_genie again asking specifically for the tables and their columns in the catalogs that were returned. Use get_current_time for the current date and time.

After ask_genie or memory tools return, answer in clear markdown prose (headings, bullets, tables). When Genie returns dashboard or asset links, include them as markdown links. Prefer surfacing concrete tables and their key columns over a list of dashboards. Never paste raw tool JSON in the final reply."""

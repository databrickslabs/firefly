"""Genie Agent MCP helpers — ask + poll until completed."""

import json
import logging
import time

from agents import function_tool
from databricks.sdk import WorkspaceClient

from agent_server.genie_mcp import genie_mcp_path

logger = logging.getLogger(__name__)

MAX_POLLS = 45
POLL_INTERVAL_SEC = 2.0


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
        return {}
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


def _poll_genie(conversation_id: str, response_id: str) -> dict:
    for _ in range(MAX_POLLS):
        payload = _mcp_tool_call(
            "genie_poll_response",
            {
                "conversation_id": conversation_id,
                "response_id": response_id,
            },
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
    ask = _mcp_tool_call("genie_ask", {"question": question})
    if ask.get("status") == "completed" and ask.get("final_answer"):
        return ask["final_answer"]
    conversation_id = ask.get("conversation_id")
    response_id = ask.get("response_id")
    if not conversation_id or not response_id:
        return f"Genie ask failed: {json.dumps(ask)[:2000]}"
    result = _poll_genie(conversation_id, response_id)
    if result.get("status") == "completed":
        return result.get("final_answer") or json.dumps(result)[:8000]
    return json.dumps(result)[:2000]


GENIE_TOOLS = [ask_genie]

# Composed onto MEMORY_INSTRUCTIONS in agent.py so utils_memory.py stays a pristine,
# regenerable copy of the managed-memory skill (this is the local Genie deviation).
GENIE_INSTRUCTIONS = """For any question about workspace data, tables, catalogs, dashboards, metrics, or phrases like "my data", you MUST call ask_genie first with the user's question — do not ask the user to clarify catalog/schema first. When the user's question is broad (e.g. "tell me about my data"), phrase the ask_genie question to request concrete data assets: the catalogs, schemas, and tables available, plus each table's purpose, key columns, and row counts where possible (for example: "What catalogs, schemas, and tables do I have? For each table, give its purpose, key columns, and approximate row count."). If the first Genie answer stays high-level (only dashboards or Genie spaces, no tables/columns), call ask_genie again asking specifically for the tables and their columns in the catalogs that were returned. Use get_current_time for the current date and time.

After ask_genie or memory tools return, answer in clear markdown prose (headings, bullets, tables). When Genie returns dashboard or asset links, include them as markdown links. Prefer surfacing concrete tables and their key columns over a list of dashboards. Never paste raw tool JSON in the final reply."""

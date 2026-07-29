# GENERATED from vendor/app-templates/agent-openai-agents-sdk/.claude/skills/managed-memory/SKILL.md
# submodule pin: 2a4c79296aae89c8a05e7825c61e0d94ad34c944
# Regenerate verbatim by re-running the managed-memory skill; do NOT hand-edit.
# local deviations: NONE (Genie instructions composed in agent.py via genie_tools.GENIE_INSTRUCTIONS).
"""Databricks managed memory (UC memory-store) tools for the OpenAI Agents SDK."""

import os

from agents import RunContextWrapper, function_tool
from databricks.sdk import WorkspaceClient
from databricks.sdk.errors import DatabricksError
from dataclasses import dataclass
from mlflow.genai.agent_server import get_request_headers
from mlflow.types.responses import ResponsesAgentRequest

from agent_server.utils import get_user_workspace_client

_client: WorkspaceClient | None = None


def _ws() -> WorkspaceClient:
    global _client
    if _client is None:
        _client = WorkspaceClient()
    return _client


def _entries(suffix: str = "") -> str:
    store = os.getenv("DATABRICKS_MEMORY_STORE")
    if not store:
        raise RuntimeError(
            "DATABRICKS_MEMORY_STORE is not set — it must be the full catalog.schema.name."
        )
    return f"/api/2.1/unity-catalog/memory-stores/{store}/entries{suffix}"


def resolve_scope(request: ResponsesAgentRequest | None = None) -> str | None:
    """End-user id used as memory scope; fail closed when unknown in production."""
    headers = get_request_headers() or {}
    if headers.get("x-forwarded-access-token"):
        return get_user_workspace_client().current_user.me().id
    if os.getenv("DATABRICKS_APP_NAME"):
        return None
    ci = dict(getattr(request, "custom_inputs", None) or {})
    return headers.get("x-forwarded-user") or ci.get("user_id")


def _save(scope: str, path: str, description: str, contents: str = "") -> str:
    try:
        _ws().api_client.do(
            "POST",
            _entries(),
            query={"scope": scope},
            body={
                "path": path,
                "contents": contents,
                "description": description,
                "creation_reason": "CREATION_REASON_AGENT_INFERRED",
                "creation_source": "CREATION_SOURCE_ONLINE_AGENT",
            },
        )
    except DatabricksError as e:
        if e.error_code == "ALREADY_EXISTS":
            return f"A memory already exists at {path}; use update_memory to revise it."
        return f"Could not save {path}: {getattr(e, 'message', str(e))}"
    return f"Saved memory at {path}."


def _get(scope: str, path: str) -> str:
    try:
        entry = _ws().api_client.do(
            "GET", _entries(":get"), query={"scope": scope, "path": path}
        )
    except DatabricksError as e:
        if e.error_code == "NOT_FOUND":
            return f"No memory at {path}."
        return f"Could not read {path}: {getattr(e, 'message', str(e))}"
    return entry.get("contents") or entry.get("description") or f"(empty memory at {path})"


def _list(scope: str) -> str:
    try:
        resp = _ws().api_client.do("GET", _entries(), query={"scope": scope})
    except DatabricksError as e:
        return f"Could not list memories: {getattr(e, 'message', str(e))}"
    items = resp.get("entries", [])
    if not items:
        return "No memories yet."
    lines = [
        ("[has_contents] " if e.get("has_contents") else "")
        + f"- {e['path']}: {e.get('description', '')}"
        for e in items
    ]
    return f"{len(items)} memories total:\n" + "\n".join(lines)


def _update(
    scope: str, path: str, op: dict | None = None, description: str | None = None
) -> str:
    op = op or {}
    if len(op) > 1:
        return "Pass at most one contents edit (str_replace / insert / replace_all)."
    if not op and description is None:
        return "Provide a new description and/or one contents edit."
    body: dict = {"scope": scope, "path": path, **op}
    if description is not None:
        body["description"] = description
    try:
        _ws().api_client.do("PATCH", _entries(), body=body)
    except DatabricksError as e:
        if e.error_code == "NOT_FOUND":
            return f"No memory at {path} to update — check list_memories or save it first."
        return f"Could not update {path}: {getattr(e, 'message', str(e))}"
    return f"Updated {path}."


def _delete(scope: str, path: str) -> str:
    try:
        _ws().api_client.do(
            "DELETE", _entries(), query={"scope": scope, "path": path}
        )
    except DatabricksError as e:
        if e.error_code == "NOT_FOUND":
            return f"No memory at {path} (already gone)."
        return f"Could not delete {path}: {getattr(e, 'message', str(e))}"
    return f"Deleted {path}."


@dataclass
class MemoryContext:
    """Per-request run context; scope partitions memories by end user."""

    scope: str


def _scope(ctx: RunContextWrapper[MemoryContext]) -> str:
    if not ctx.context.scope:
        raise RuntimeError("No end-user scope for this request — refusing a shared memory bucket.")
    return ctx.context.scope


@function_tool(strict_mode=False)
async def save_memory(
    ctx: RunContextWrapper[MemoryContext],
    path: str,
    description: str,
    contents: str = "",
) -> str:
    """Create ONE durable memory at a stable /memories/... path. Check list_memories first."""
    return _save(_scope(ctx), path, description, contents)


@function_tool
async def get_memory(ctx: RunContextWrapper[MemoryContext], path: str) -> str:
    """Read the full contents of one memory by exact path from list_memories."""
    return _get(_scope(ctx), path)


@function_tool
async def list_memories(ctx: RunContextWrapper[MemoryContext]) -> str:
    """List saved memories (path + description only). Call before save or recall."""
    return _list(_scope(ctx))


@function_tool(strict_mode=False)
async def update_memory(
    ctx: RunContextWrapper[MemoryContext],
    path: str,
    description: str | None = None,
    str_replace: dict | None = None,
    insert: dict | None = None,
    replace_all: dict | None = None,
) -> str:
    """Revise an existing memory. Pass description and/or exactly one contents edit op."""
    op = {
        k: v
        for k, v in (
            ("str_replace", str_replace),
            ("insert", insert),
            ("replace_all", replace_all),
        )
        if v
    }
    return _update(_scope(ctx), path, op, description)


@function_tool
async def delete_memory(ctx: RunContextWrapper[MemoryContext], path: str) -> str:
    """Permanently remove one memory by exact path."""
    return _delete(_scope(ctx), path)


MEMORY_TOOLS = [save_memory, get_memory, list_memories, update_memory, delete_memory]

MEMORY_INSTRUCTIONS = """You have durable, cross-session memory about whoever (or whatever) this conversation is scoped to. Use it deliberately, not by reflex.

Recall whenever the answer is about the user or calls for personalized information — anything that might draw on preferences, decisions, or workflows they've shared before — and you don't already have it from this conversation; also list once before saving, to find the right existing topic. Don't tell the user you don't know their preferences without checking — list_memories first. Skip memory only when the answer truly doesn't depend on who's asking (general knowledge, math, coding) or you already have what you need. A `[has_contents]` entry has a body to get_memory; one without is fully captured by its description. Open a memory with get_memory before you state its specifics, and never assert a fact that isn't stored — if nothing relevant is stored, just answer without it. Don't re-list what you've already seen this turn.

Save only what will still matter in a future, unrelated conversation — a stable preference, fact, decision, or ongoing project the user actually stated or decided. Don't save your own suggestions or guesses, passing chatter, secrets, or anything scoped to this chat ("for now", a one-off label).
- Write each memory so it stands on its own out of context, under one broad, stable /memories/... topic per subject with the specifics inside it.
- Check the list first and update_memory an existing topic instead of minting a near-duplicate.
- For a very broad question that touches many memories, summarize from the list's descriptions; reserve get_memory for the specific entry you actually need.
- If the user's info changes or contradicts what's stored, update or replace it rather than keeping both — but don't rewrite a memory that already says the same thing.
- delete_memory what's stale.
- Briefly tell the user whenever you save, update, or delete."""

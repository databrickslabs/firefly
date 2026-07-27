import logging
import os
from contextlib import AsyncExitStack
from datetime import datetime
from typing import AsyncGenerator

import mlflow
from agents import Agent, Runner, function_tool, set_default_openai_api, set_default_openai_client
from agents.tracing import set_trace_processors
from databricks.sdk import WorkspaceClient
from databricks_openai import AsyncDatabricksOpenAI
from databricks_openai.agents import McpServer
from fastapi import HTTPException
from mlflow.genai.agent_server import invoke, stream
from mlflow.types.responses import (
    ResponsesAgentRequest,
    ResponsesAgentResponse,
    ResponsesAgentStreamEvent,
)

from agent_server.utils import (
    build_mcp_url,
    get_session_id,
    process_agent_stream_events,
)
from agent_server.genie_tools import GENIE_INSTRUCTIONS, GENIE_TOOLS
from agent_server.utils_memory import (
    MEMORY_INSTRUCTIONS,
    MEMORY_TOOLS,
    MemoryContext,
    resolve_scope,
)

# Skill-first: utils_memory.py stays a verbatim copy of the managed-memory skill;
# the Genie deviation is composed here at wire time.
INSTRUCTIONS = MEMORY_INSTRUCTIONS + "\n\n" + GENIE_INSTRUCTIONS

logger = logging.getLogger(__name__)

set_default_openai_client(AsyncDatabricksOpenAI())
set_default_openai_api("chat_completions")
set_trace_processors([])
mlflow.openai.autolog()
logging.getLogger("mlflow.utils.autologging_utils").setLevel(logging.ERROR)


@function_tool
def get_current_time() -> str:
    """Get the current date and time."""
    return datetime.now().isoformat()


def _app_workspace_client() -> WorkspaceClient:
    """App service principal (Databricks Apps OAuth M2M), not the proxy caller token."""
    return WorkspaceClient()


GENIE_ONE_MCP_PATH = "/api/2.0/mcp/genie"


def _genie_mcp_path() -> str:
    mode = os.environ.get("GENIE_MCP_MODE", "one").strip().lower()
    explicit = os.environ.get("GENIE_MCP_URL", "").strip()

    if mode == "space":
        space_id = os.environ.get("GENIE_SPACE_ID", "").strip()
        # "none" is the bundle's unset sentinel, not an id. An EMPTY default
        # cannot be used: the bundle renders `{"name": "GENIE_SPACE_ID"}` with no
        # `value`, and the Apps API rejects the whole deploy with "Must specify
        # environment variable source using either value or valueFrom". So the
        # variable ships a non-empty placeholder and the emptiness check lives
        # here instead.
        if space_id.lower() in ("", "none", "null"):
            raise ValueError("GENIE_MCP_MODE=space requires GENIE_SPACE_ID")
        return f"/api/2.0/mcp/genie/{space_id}"

    if explicit and not explicit.rstrip("/").endswith("/api/2.0/mcp/genie"):
        return explicit if explicit.startswith("/") else f"/{explicit}"
    return GENIE_ONE_MCP_PATH


def _genie_mcp_url(app_wc: WorkspaceClient) -> str:
    """Genie One managed MCP when GENIE_MCP_MODE=one (default)."""
    path_or_url = _genie_mcp_path()
    if path_or_url.startswith("http"):
        return path_or_url.rstrip("/")
    if not path_or_url.startswith("/"):
        path_or_url = f"/{path_or_url}"
    return build_mcp_url(path_or_url.rstrip("/"), workspace_client=app_wc)


async def init_genie_mcp_server() -> McpServer:
    app_wc = _app_workspace_client()
    url = _genie_mcp_url(app_wc)
    logger.info("Genie MCP mode=%s url=%s", os.environ.get("GENIE_MCP_MODE", "one"), url)
    return McpServer(
        url=url,
        name="Genie",
        workspace_client=app_wc,
        timeout=60.0,
    )


async def connect_healthy_mcp_servers(
    stack: AsyncExitStack, servers: list[McpServer]
) -> tuple[list[McpServer], list[str]]:
    healthy: list[McpServer] = []
    unavailable: list[str] = []
    for server in servers:
        name = getattr(server, "name", "MCP server")
        try:
            connected = await stack.enter_async_context(server)
            await connected.list_tools()
            healthy.append(connected)
        except Exception:
            logger.warning("MCP server %r unavailable; continuing without it.", name, exc_info=True)
            unavailable.append(name)
    return healthy, unavailable


def create_agent(mcp_servers: list[McpServer] | None = None) -> Agent:
    return Agent(
        name="Agent",
        instructions=INSTRUCTIONS,
        model="databricks-gpt-5-2",
        tools=[get_current_time, *GENIE_TOOLS, *MEMORY_TOOLS],
        mcp_servers=mcp_servers or [],
    )


def _require_scope(request: ResponsesAgentRequest) -> str:
    scope = resolve_scope(request)
    if not scope:
        raise HTTPException(
            status_code=401,
            detail="No end-user identity — refusing a shared memory scope.",
        )
    return scope


async def _mcp_servers_for_request(stack: AsyncExitStack) -> list[McpServer]:
    servers, _ = await connect_healthy_mcp_servers(stack, [await init_genie_mcp_server()])
    return servers


@invoke()
async def invoke_handler(request: ResponsesAgentRequest) -> ResponsesAgentResponse:
    if session_id := get_session_id(request):
        mlflow.update_current_trace(metadata={"mlflow.trace.session": session_id})
    scope = _require_scope(request)
    async with AsyncExitStack() as stack:
        agent = create_agent(mcp_servers=await _mcp_servers_for_request(stack))
        messages = [i.model_dump() for i in request.input]
        result = await Runner.run(agent, messages, context=MemoryContext(scope=scope))
        return ResponsesAgentResponse(
            output=[item.to_input_item() for item in result.new_items]
        )


@stream()
async def stream_handler(
    request: ResponsesAgentRequest,
) -> AsyncGenerator[ResponsesAgentStreamEvent, None]:
    if session_id := get_session_id(request):
        mlflow.update_current_trace(metadata={"mlflow.trace.session": session_id})
    scope = _require_scope(request)
    async with AsyncExitStack() as stack:
        agent = create_agent(mcp_servers=await _mcp_servers_for_request(stack))
        messages = [i.model_dump() for i in request.input]
        result = Runner.run_streamed(
            agent, input=messages, context=MemoryContext(scope=scope)
        )
        async for event in process_agent_stream_events(result.stream_events()):
            yield event

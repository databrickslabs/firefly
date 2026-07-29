"""Which Genie backend this deployment talks to — resolved in exactly one place.

There were two answers to that question. agent.py resolved the mode properly and pointed
the MCP server at `/api/2.0/mcp/genie/<space_id>`, while genie_tools.py held its own
module-level constant `GENIE_MCP_PATH = "/api/2.0/mcp/genie"` and POSTed straight to it.
Both were attached to the same Agent, and GENIE_INSTRUCTIONS told the model it "MUST call
ask_genie first" -- so a deployment configured for a curated space answered from
workspace-wide Genie anyway, silently, with the space-scoped server connected and unused.

That is worse than a wrong answer. Choosing a space is how you scope answers to curated
tables and joins, and it is the only object a guest can be granted CAN_RUN on. Guests have
no workspace access at all, so answering them from workspace-wide Genie cannot work --
while every configuration probe still reports mode=space, because the deploy really did
pass that variable. Nothing observed the endpoint a question actually reached.

The Genie Agent IS the space. Workspace-wide is a deliberate opt-out for someone who wants
it as their MCP, or the fallback where no space can exist (no tables to build one over).
"""

import logging
import os

logger = logging.getLogger(__name__)

# Workspace-wide unified Genie: discovers whatever the calling SP can read, scoped to
# nothing. Reachable only by principals with workspace access, which excludes guests.
GENIE_WORKSPACE_MCP_PATH = "/api/2.0/mcp/genie"

# `space` is canonical. `agent` is accepted as a forward-looking alias only: the product
# name is Genie Agent, so the value will likely be renamed, but renaming it NOW would
# propagate through the bundle, the runbook, the harness probes and the regression matrix
# for no reader benefit -- and every in-flight `--var genie_mcp_mode=space` would break.
# Accepting both costs one tuple entry and makes that rename a later, safe change.
_SPACE_MODES = ("space", "agent")

_logged_once = False


def genie_mcp_path() -> str:
    """The Genie MCP path this deployment must use. Same answer for every caller.

    Raises when the mode asks for a space and no id was supplied, rather than quietly
    falling back to workspace-wide: a silent fallback is what made this defect invisible.
    """
    global _logged_once

    mode = os.environ.get("GENIE_MCP_MODE", "space").strip().lower()
    explicit = os.environ.get("GENIE_MCP_URL", "").strip()

    if mode in _SPACE_MODES:
        space_id = os.environ.get("GENIE_SPACE_ID", "").strip()
        # "none" is the bundle's unset sentinel, not an id. An EMPTY default cannot be
        # used: the bundle renders {"name": "GENIE_SPACE_ID"} with no `value`, and the
        # Apps API rejects the deploy with "Must specify environment variable source
        # using either value or valueFrom". So the variable ships a placeholder and the
        # emptiness check lives here.
        if space_id.lower() in ("", "none", "null"):
            raise ValueError(
                f"GENIE_MCP_MODE={mode} needs GENIE_SPACE_ID. Set it to a Genie space id, "
                "or set GENIE_MCP_MODE=one to use workspace-wide Genie deliberately "
                "(note: guest users cannot query workspace-wide Genie)."
            )
        path = f"{GENIE_WORKSPACE_MCP_PATH}/{space_id}"
    elif explicit and not explicit.rstrip("/").endswith(GENIE_WORKSPACE_MCP_PATH):
        path = explicit if explicit.startswith("/") else f"/{explicit}"
    else:
        path = GENIE_WORKSPACE_MCP_PATH

    # Logged once, because "which backend answered" was previously unobservable: the
    # startup line recorded the configured mode, not the endpoint each tool called.
    if not _logged_once:
        logger.info("Genie MCP resolved: mode=%s path=%s", mode, path)
        _logged_once = True
    return path


def is_space_mode() -> bool:
    """True when this deployment is scoped to a Genie space (the default)."""
    return os.environ.get("GENIE_MCP_MODE", "space").strip().lower() in _SPACE_MODES

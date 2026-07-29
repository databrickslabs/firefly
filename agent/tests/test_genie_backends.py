"""The two Genie backends are not interchangeable, and nothing checked that.

A real bootstrap run deployed space-scoped Genie (the default), the agent POSTed the
workspace-wide tool name `genie_ask` to the space endpoint, and the server answered
`-32602 BAD_REQUEST: Tool genie_ask does not exist`. The user saw `Genie ask failed: {}`.

Nine consecutive end-to-end runs had passed before that. They asserted the *configuration*
-- mode=space, a real space id, CAN_RUN granted, tables seeded -- and never asked the agent
a question, so every probe was green while the one path a user exercises was broken. These
tests cover the seam those probes could not see:

    workspace-wide  ->  genie_ask(question=...),        genie_poll_response(response_id=...)
    space-scoped    ->  query_space_<id>(query=...),    poll_response_<id>(message_id=...)

Tool names, argument names, id casing, status vocabulary and answer location all differ.

Run: cd agent && python3 -m pytest tests/test_genie_backends.py -q
"""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# genie_tools imports `function_tool` from the OpenAI Agents SDK, which is a runtime
# dependency of the deployed app and not needed to test this logic. Stub it so the suite
# runs on a clean checkout: requiring the SDK here would mean these tests only run where
# the app already builds, which is precisely where they are least needed.
if "agents" not in sys.modules:
    _agents = type(sys)("agents")
    _agents.function_tool = lambda fn=None, **kw: (fn if fn is not None else (lambda f: f))
    sys.modules["agents"] = _agents

from agent_server import genie_mcp  # noqa: E402
from agent_server import genie_tools  # noqa: E402

SPACE_ID = "01f18b4e96a61645bbf63e14eb416cb5"


def env(**kw):
    """Env with the Genie vars cleared unless named, so a stray export cannot pass a test."""
    base = {k: v for k, v in os.environ.items()
            if k not in ("GENIE_MCP_MODE", "GENIE_SPACE_ID", "GENIE_MCP_URL")}
    base.update(kw)
    return mock.patch.dict(os.environ, base, clear=True)


def _fake_ws(response):
    """Patch the SDK client the tool calls through.

    The HTTP boundary is WorkspaceClient().api_client.do, reached via
    _app_workspace_client() -- patching a hand-invented `_mcp_post` made two tests error
    out on a name that never existed, which is its own small lesson about asserting
    against a real seam instead of an imagined one.
    """
    client = mock.MagicMock()
    client.api_client.do.return_value = response
    return mock.patch.object(genie_tools, "_app_workspace_client", return_value=client)


class ToolNames(unittest.TestCase):
    def test_space_mode_uses_space_scoped_tools(self):
        """The defect verbatim: space mode must NOT ask for genie_ask."""
        with env(GENIE_MCP_MODE="space", GENIE_SPACE_ID=SPACE_ID):
            ask, poll = genie_mcp.genie_tool_names()
        self.assertEqual(ask, f"query_space_{SPACE_ID}")
        self.assertEqual(poll, f"poll_response_{SPACE_ID}")
        self.assertNotIn("genie_ask", (ask, poll))

    def test_space_is_the_default(self):
        """No GENIE_MCP_MODE at all must still resolve to the space tools."""
        with env(GENIE_SPACE_ID=SPACE_ID):
            ask, _ = genie_mcp.genie_tool_names()
        self.assertEqual(ask, f"query_space_{SPACE_ID}")

    def test_agent_alias_behaves_as_space(self):
        with env(GENIE_MCP_MODE="agent", GENIE_SPACE_ID=SPACE_ID):
            ask, _ = genie_mcp.genie_tool_names()
        self.assertEqual(ask, f"query_space_{SPACE_ID}")

    def test_workspace_mode_uses_workspace_tools(self):
        with env(GENIE_MCP_MODE="one"):
            ask, poll = genie_mcp.genie_tool_names()
        self.assertEqual((ask, poll), ("genie_ask", "genie_poll_response"))

    def test_tool_names_and_path_agree_on_the_backend(self):
        """A path pointing at a space while the names say workspace-wide is the bug."""
        with env(GENIE_MCP_MODE="space", GENIE_SPACE_ID=SPACE_ID):
            path = genie_mcp.genie_mcp_path()
            ask, _ = genie_mcp.genie_tool_names()
        self.assertTrue(path.endswith(SPACE_ID), path)
        self.assertIn(SPACE_ID, ask)

    def test_space_mode_without_id_raises_rather_than_falling_back(self):
        for value in ("", "none", "NONE", "null"):
            with self.subTest(space_id=value), env(GENIE_MCP_MODE="space", GENIE_SPACE_ID=value):
                with self.assertRaises(ValueError):
                    genie_mcp.genie_tool_names()


class ArgumentNames(unittest.TestCase):
    """Right tool, wrong argument name still fails -- as an invalid-argument error that
    mentions nothing about Genie. Assert the wire call, not just the tool name."""

    def _capture(self, question="how many bookings?"):
        calls = []

        def fake(name, arguments):
            calls.append((name, arguments))
            return {"error": "stop here"}      # short-circuit; ask/poll shape is tested below

        with mock.patch.object(genie_tools, "_mcp_tool_call", side_effect=fake):
            genie_tools.ask_genie(question)
        return calls[0]

    def test_space_mode_sends_query(self):
        with env(GENIE_MCP_MODE="space", GENIE_SPACE_ID=SPACE_ID):
            name, args = self._capture()
        self.assertEqual(name, f"query_space_{SPACE_ID}")
        self.assertIn("query", args)
        self.assertNotIn("question", args)

    def test_workspace_mode_sends_question(self):
        with env(GENIE_MCP_MODE="one"):
            name, args = self._capture()
        self.assertEqual(name, "genie_ask")
        self.assertIn("question", args)
        self.assertNotIn("query", args)


class ErrorPropagation(unittest.TestCase):
    """`return {}` on a JSON-RPC error is what turned a precise server message into
    'Genie ask failed: {}' -- the same discarded-error pattern the runbook forbids."""

    def test_jsonrpc_error_message_survives(self):
        raw = {"error": {"code": -32602,
                         "message": "BAD_REQUEST: Tool genie_ask does not exist"}}
        with env(GENIE_MCP_MODE="space", GENIE_SPACE_ID=SPACE_ID), \
                _fake_ws(raw):
            out = genie_tools._mcp_tool_call("query_space_x", {"query": "q"})
        self.assertIn("error", out)
        self.assertIn("does not exist", out["error"])
        self.assertNotEqual(out, {})

    def test_user_visible_failure_names_the_cause(self):
        raw = {"error": {"code": -32602,
                         "message": "BAD_REQUEST: Tool genie_ask does not exist"}}
        with env(GENIE_MCP_MODE="space", GENIE_SPACE_ID=SPACE_ID), \
                _fake_ws(raw):
            answer = genie_tools.ask_genie("how many bookings?")
        self.assertNotIn("{}", answer)
        self.assertTrue(len(answer) > 20, f"uninformative failure text: {answer!r}")


class SpaceResponseShape(unittest.TestCase):
    """Space mode has no final_answer: the answer is in content, ids are camelCase, and
    statuses are uppercase. Reading it with the workspace-wide shape yields a silent blank."""

    COMPLETED = {
        "conversationId": "c-1",
        "messageId": "m-1",
        "status": "COMPLETED",
        "content": {
            "queryAttachments": [{
                "description": "Total bookings and users",
                "query": "SELECT count(*) FROM bookings",
                "statement_response": {
                    "manifest": {"schema": {"columns": [{"name": "bookings"},
                                                        {"name": "users"}]}},
                    "result": {"data_array": [["72247", "124509"]]},
                },
            }]
        },
    }

    def test_completed_space_response_yields_an_answer(self):
        out = genie_tools._normalize(self.COMPLETED)
        self.assertEqual(out["status"], "completed")
        self.assertEqual(out["conversation_id"], "c-1")
        self.assertEqual(out["response_id"], "m-1")
        self.assertIn("72247", out["final_answer"])
        self.assertIn("SELECT", out["final_answer"])

    def test_json_array_row_shape_also_renders(self):
        payload = dict(self.COMPLETED)
        payload["content"] = {"queryAttachments": [{
            "query": "SELECT 1",
            "statement_response": {
                "manifest": {"schema": {"columns": [{"name": "n"}]}},
                "result": {"data_array": [{"values": [{"string_value": "7"}]}]},
            },
        }]}
        self.assertIn("7", genie_tools._normalize(payload)["final_answer"])

    def test_uppercase_states_map_correctly(self):
        for raw, want in (("COMPLETED", "completed"), ("FAILED", "failed"),
                          ("CANCELLED", "failed"), ("QUERY_RESULT_EXPIRED", "failed"),
                          ("IN_PROGRESS", "in_progress"), ("EXECUTING_QUERY", "in_progress")):
            with self.subTest(state=raw):
                out = genie_tools._normalize({"conversationId": "c", "messageId": "m",
                                              "status": raw})
                self.assertEqual(out["status"], want)

    def test_workspace_shape_passes_through_untouched(self):
        ws = {"conversation_id": "c", "response_id": "r", "status": "completed",
              "final_answer": "42"}
        self.assertEqual(genie_tools._normalize(ws), ws)


if __name__ == "__main__":
    unittest.main(verbosity=2)

#!/usr/bin/env bash
# One-command agent deploy: create -> run -> enable memory.
#
# What actually needs an ordering here (proven end-to-end on a fresh workspace):
#
#   * Frontend Drizzle migrations DO run at the first container build, but they do
#     NOT need a manual grant. The bundle binds the Postgres/Lakebase resource with
#     CAN_CONNECT_AND_CREATE (agent/databricks.yml), which is applied at `bundle
#     deploy` and auto-provisions the app SP's Postgres login role. The migrations
#     connect as that SP, CREATE their schema/tables (SP becomes OWNER -> full DML),
#     and succeed. A no-grant deploy comes up RUNNING with ai_chatbot.{Chat,Message,
#     Vote} present. (This is why the old "grant Lakebase before build" step is gone.)
#
#   * The durable, cross-session MEMORY feature is a Unity Catalog *memory store*,
#     not Lakebase. It must (a) EXIST as a UC securable and (b) grant the app SP
#     READ/WRITE — neither of which quickstart or the bundle does. Without it the
#     agent silently no-ops ("memory store not found" -> "does not have READ/WRITE
#     MEMORY STORE"). scripts/setup_memory_store.py does both; it needs the SP, which
#     exists only after the app is created, so it runs after deploy.
#
# Idempotent — safe to re-run.
#
# Usage (from agent-build/, after assemble_agent.sh + quickstart):
#   bash scripts/deploy_agent.sh <cli-profile> [extra bundle args, e.g. --var catalog=main]
set -euo pipefail
cd "$(dirname "$0")/.."                        # agent-build root

PROFILE="${1:?usage: deploy_agent.sh <cli-profile> [--var ...]}"; shift || true
EXTRA=("$@")                                    # forwarded to bundle deploy/run (e.g. --var catalog=main)
# ${EXTRA[@]+"${EXTRA[@]}"} safely expands a possibly-empty array under `set -u`
# (bare "${EXTRA[@]}" errors "unbound variable" on macOS/older bash when empty).
APP_KEY="agent_openai_agents_sdk"

APP="$(databricks bundle summary -o json -p "$PROFILE" ${EXTRA[@]+"${EXTRA[@]}"} | jq -r ".resources.apps.${APP_KEY}.name")"
[ -n "$APP" ] && [ "$APP" != "null" ] || { echo "ERROR: could not resolve app name from bundle summary"; exit 1; }
echo "==> App: $APP (profile: $PROFILE)"

# 0) Ensure vendored wheels exist so the build installs offline (skip if already done).
if [ -z "$(ls -A vendor-wheels 2>/dev/null || true)" ]; then
  echo "==> vendor-wheels/ empty — vendoring build wheels"
  bash scripts/vendor_wheels.sh
fi

# 1) Create/update the app + upload source, then build + start.
echo "==> bundle deploy (creates app + SP, uploads source)"
databricks bundle deploy -p "$PROFILE" ${EXTRA[@]+"${EXTRA[@]}"}
echo "==> bundle run (build + start; frontend migrations succeed via the resource binding)"
databricks bundle run "$APP_KEY" -p "$PROFILE" ${EXTRA[@]+"${EXTRA[@]}"}

# 2) Resolve the app SP (exists after create).
SP="$(databricks apps get "$APP" -p "$PROFILE" --output json | jq -r '.service_principal_client_id // empty')"
[ -n "$SP" ] || { echo "ERROR: failed to obtain the app's service principal"; exit 1; }
echo "==> App service principal: $SP"

# 3) Enable managed memory: create the UC memory store + grant the SP READ/WRITE.
#    The store name is whatever the app runs with (DATABRICKS_MEMORY_STORE, built from
#    the bundle's catalog/schema vars). setup_memory_store.py reads it from the env,
#    so pass the same catalog/schema overrides you passed to bundle (if any).
STORE="$(databricks bundle summary -o json -p "$PROFILE" ${EXTRA[@]+"${EXTRA[@]}"} \
  | jq -r ".resources.apps.${APP_KEY}.config.env[]? | select(.name==\"DATABRICKS_MEMORY_STORE\") | .value")"
echo "==> Enabling managed memory on store: ${STORE:-<from env>}"
uv run --python 3.12 python scripts/setup_memory_store.py "$SP" \
  ${STORE:+--memory-store "$STORE"} --profile "$PROFILE"

# 4) Assert health from the LIVE app state (PAT-readable). NOTE: judge health from
#    app_status.state, NOT active_deployment.status.state — the latter goes green when
#    the container command starts, before the port binds (see start_app.py).
echo "==> Verifying live app state (PAT-readable)"
STATE="$(databricks apps get "$APP" -p "$PROFILE" --output json | jq -r '.app_status.state // "?"')"
echo "    app_status.state = $STATE"
case "$STATE" in
  RUNNING)
    echo "    ✓ healthy — point DATABRICKS_AGENT_APP_URL at the app URL." ;;
  *)
    echo "    ✗ not RUNNING yet. Confirm from the runtime logs (needs an OAuth profile):"
    echo "        databricks apps logs $APP -p <oauth-profile>   # wait for 'Both frontend and backend are ready!'"
    exit 1 ;;
esac

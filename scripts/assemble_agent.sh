#!/usr/bin/env bash
# Merge vendor/app-templates (submodule) + agent/ overlay -> agent-build/ (deploy source).
# The submodule is a pristine upstream pin; all Firefly deltas live in agent/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT/vendor/app-templates/agent-openai-agents-sdk"
CHAT="$ROOT/vendor/app-templates/e2e-chatbot-app-next"
OVERLAY="$ROOT/agent"
BUILD="$ROOT/agent-build"

[[ -d "$TEMPLATE" ]] || { echo "Missing $TEMPLATE — run: git submodule update --init"; exit 1; }
[[ -d "$CHAT" ]]     || { echo "Missing $CHAT — check sparse-checkout"; exit 1; }

rm -rf "$BUILD"
mkdir -p "$BUILD"

# 1) upstream agent template
cp -R "$TEMPLATE"/. "$BUILD"/
# 2) pre-vendor the chat UI so start_app.py doesn't clone at runtime
cp -R "$CHAT" "$BUILD"/e2e-chatbot-app-next
# 3) overlay: our agent_server deltas (agent.py, utils.py, start_server.py, genie_tools.py, utils_memory.py)
cp -R "$OVERLAY"/agent_server/. "$BUILD"/agent_server/
# 4) overlay: bundle config + startup/build scripts (start_app.py, vendor_wheels.sh, ...)
[[ -f "$OVERLAY/databricks.yml" ]] && cp "$OVERLAY/databricks.yml" "$BUILD"/
[[ -d "$OVERLAY/scripts" ]] && cp -R "$OVERLAY"/scripts/. "$BUILD"/scripts/
# 5) overlay: chat UI patches (Genie attribution, proxy-friendly tweaks)
if [[ -d "$OVERLAY/patches/e2e-chatbot-app-next" ]]; then
  cp -R "$OVERLAY/patches/e2e-chatbot-app-next/." "$BUILD"/e2e-chatbot-app-next/
fi

# 6) Give agent-build its own git boundary. The parent repo gitignores
# agent-build/, and `databricks bundle deploy` respects the enclosing repo's
# ignore rules — without this, sync finds zero files ("no files to sync") and
# ships an empty app. A local-only git init (never committed) scopes the bundle
# to agent-build so its files sync correctly.
if [[ ! -d "$BUILD/.git" ]]; then
  git init -q "$BUILD"
fi

echo "Assembled agent at $BUILD"

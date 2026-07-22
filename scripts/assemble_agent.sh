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

# 5b) Pin the transitive `greenlet` to the vendored Linux wheel (3.5.3). The upstream
# template re-resolves deps at runtime (uv.lock is excluded from sync — GAP-15), so
# `uv run` can pick a macOS-only newest greenlet (e.g. 3.5.4) from the index that has no
# Linux wheel → the app crashes on the Linux Apps host. This override lives HERE (our
# assembly), not in the submodule template, so it re-applies on every template re-copy.
# Idempotent; handles a pre-existing [tool.uv] section.
python3 - "$BUILD/pyproject.toml" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
PIN = "greenlet==3.5.3"
if PIN in s:
    sys.exit(0)  # already pinned — no-op
if re.search(r'^\[tool\.uv\]', s, re.M):
    if re.search(r'^\s*override-dependencies\s*=\s*\[', s, re.M):
        s = re.sub(r'(override-dependencies\s*=\s*\[)', r'\1"%s", ' % PIN, s, count=1)
    else:
        s = re.sub(r'(^\[tool\.uv\][^\n]*\n)', r'\1override-dependencies = ["%s"]\n' % PIN, s, count=1, flags=re.M)
else:
    s = s.rstrip() + '\n\n[tool.uv]\noverride-dependencies = ["%s"]\n' % PIN
open(p, "w").write(s)
print("assemble: pinned %s in agent-build/pyproject.toml" % PIN)
PY

# 5c) Deterministic dependency pins for the whole graph (#64). The Apps build runs a plain
# `uv sync` (uv.lock is excluded from sync — GAP-15), so without version pins it can
# re-resolve a transitive dep to a newer release that lacks a Linux wheel (the greenlet
# 3.5.4 crash). Export the lock to a CONSTRAINTS file — this BOUNDS versions without the
# exact-match rigidity that made `uv sync --locked` fail (GAP-15) — and sync it; the app env
# sets UV_CONSTRAINT to it (see agent/databricks.yml). Exported from the universal lock with
# environment markers, which uv applies on the Linux/cp311 Apps host at install time.
# Supersedes the one-off greenlet override above once validated. Non-fatal: if export fails,
# warn and continue (the greenlet override still guards the known crash).
if [[ -f "$BUILD/uv.lock" ]] && command -v uv >/dev/null 2>&1; then
  if (cd "$BUILD" && uv export --frozen --no-hashes --no-emit-project \
        -o constraints.txt) 2>/dev/null && [[ -s "$BUILD/constraints.txt" ]]; then
    echo "assemble: wrote agent-build/constraints.txt ($(grep -c '==' "$BUILD/constraints.txt") pins) → UV_CONSTRAINT (#64)"
  else
    rm -f "$BUILD/constraints.txt"
    echo "assemble: WARN — 'uv export' failed; relying on the greenlet override only (#63)." >&2
  fi
else
  echo "assemble: WARN — no uv.lock or uv unavailable; skipping constraints.txt (#63 override still applies)." >&2
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

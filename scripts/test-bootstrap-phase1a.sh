#!/usr/bin/env bash
# Hermetic regression test for bootstrap Phase 1a on a FRESH $HOME.
#
# Adapted from scripts/test-bootstrap-corepack.sh on branch fix/corepack-mkdir-home-bin
# (PR #67) — the sandbox/stub scaffolding and the fresh-HOME approach are that author's.
# Reframed from mechanism to OUTCOME so it stays valid regardless of how pnpm is installed:
#
#   #67 asserted  "corepack created a pnpm shim in $HOME/bin"   (mechanism)
#   this asserts  "$HOME/bin exists AND pnpm is on the pin"      (outcome)
#
# It therefore covers BOTH reported bugs at once:
#   #67  — the script assumed $HOME/bin existed and broke when it did not
#          (`corepack enable --install-directory` errors ENOENT and does NOT mkdir;
#          verified directly. $HOME/bin is on PATH from Phase 0 and is written to by the
#          gh/databricks/uv installers, so it must exist early regardless of pnpm's
#          install method).
#   #69  — corepack must not be used to fetch pnpm: it ignores the npm registry setting
#          and hits registry.npmjs.org, which fails wherever public npm is blocked.
#
# Scope: runs against stubbed network/auth commands on the local machine, so it covers
# fresh-HOME behaviour and the version pin. It does NOT cover the blocked-registry case —
# CI runners have unrestricted npm access. That path needs a corp-network VM.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/bootstrap.sh"
PIN="$(sed -nE 's/.*PNPM_VERSION:=([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' "$SCRIPT_DIR/lib/corp-network.sh" | head -1)"

[[ -x "$BOOTSTRAP" ]] || { echo "bootstrap.sh not executable: $BOOTSTRAP" >&2; exit 1; }
[[ -n "$PIN" ]] || { echo "could not read PNPM_VERSION from lib/corp-network.sh" >&2; exit 1; }

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT
TEST_HOME="$TEST_ROOT/home"
STUB_BIN="$TEST_ROOT/stubs"
NPM_PREFIX="$TEST_ROOT/npm-global"
CALLS="$TEST_ROOT/calls.log"
mkdir -p "$TEST_HOME" "$STUB_BIN"
: > "$CALLS"

write_stub() {
  local name="$1"; shift
  { echo '#!/usr/bin/env bash'; printf '%s\n' "$@"; } > "$STUB_BIN/$name"
  chmod +x "$STUB_BIN/$name"
}

# npm: records what bootstrap asked for, and on a global install actually materializes a
# pnpm binary reporting the pinned version — so the assertion below is a real outcome check
# rather than a spy on the command string.
write_stub npm '
echo "npm $*" >> "$CALLS"
case "$*" in
  "config get registry") echo "https://registry.npmjs.org/" ;;
  "config get prefix")   echo "$NPM_PREFIX" ;;
  view*)                 echo "'"$PIN"'" ;;                 # preflight resolve probe
  "install -g pnpm@'"$PIN"'")
    mkdir -p "$NPM_PREFIX/bin"
    printf "#!/usr/bin/env bash\necho '"$PIN"'\n" > "$NPM_PREFIX/bin/pnpm"
    chmod +x "$NPM_PREFIX/bin/pnpm"
    ;;
esac
exit 0'

# corepack: never delegated to the real binary. Any enable/prepare is an ENV-0 violation,
# so just record the invocation and let the assertions decide.
write_stub corepack '
echo "corepack $*" >> "$CALLS"
exit 0'

# Phase 0 probes: a successful curl means "no intercepting proxy", keeping the run offline.
write_stub curl 'exit 0'

# Phase 1 auth/tooling are deliberate no-ops — the target is bootstrap control flow, not
# external OAuth or service availability.
write_stub vercel '
case "${1:-}" in --version) echo "vercel-test" ;; whoami) echo "test-user" ;; esac
exit 0'
write_stub gh '
case "${1:-}" in --version) echo "gh version test" ;; auth) exit 0 ;; esac
exit 0'
write_stub neonctl '
case "${1:-}" in --version) echo "neonctl-test" ;; me) echo "test-user" ;; esac
exit 0'
write_stub databricks '
case "${1:-}" in --version) echo "Databricks CLI test" ;; auth|workspace) exit 0 ;; esac
exit 0'
write_stub uv '
[[ "${1:-}" == "--version" ]] && echo "uv-test"
exit 0'

[[ ! -e "$TEST_HOME/bin" ]] || {
  echo "test fixture invalid: $TEST_HOME/bin already exists" >&2; exit 1; }

# Phase 0 answers, in prompt order. An empty string accepts the prompt's default; the three
# non-empty entries are the prompts that have no default and re-ask until answered. Kept as
# an explicit array rather than a heredoc — blank lines are significant here, and a heredoc
# silently shifts every subsequent answer if one is lost to whitespace trimming.
ANSWERS=(
  "https://example.cloud.databricks.com"   # DATABRICKS_HOST       (required)
  ""                                       # DB_PROFILE
  ""                                       # UC_CATALOG
  ""                                       # UC_SCHEMA
  ""                                       # AGENT_APP_NAME
  ""                                       # LAKEBASE_NAME
  "00000000-0000-0000-0000-000000000000"   # DATABRICKS_ACCOUNT_ID (required)
  ""                                       # REPO_DIR
  "test-team"                              # VERCEL_TEAM           (required)
  ""                                       # NEON_PROJECT_NAME
  ""                                       # VERCEL_PROJECT
)

OUTPUT="$TEST_ROOT/bootstrap.out"
if ! printf '%s\n' "${ANSWERS[@]}" | env \
  HOME="$TEST_HOME" \
  PATH="$STUB_BIN:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" \
  NPM_PREFIX="$NPM_PREFIX" \
  CALLS="$CALLS" \
  bash "$BOOTSTRAP" --stop-after=1 >"$OUTPUT" 2>&1
then
  echo "FAIL: bootstrap exited before completing Phase 1" >&2
  echo "---- bootstrap output ----" >&2; cat "$OUTPUT" >&2
  exit 1
fi

PASS=0; FAIL=0
pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1" >&2; FAIL=$((FAIL + 1)); }
dump() { echo "---- bootstrap output ----" >&2; cat "$OUTPUT" >&2;
         echo "---- recorded calls ----" >&2; cat "$CALLS" >&2; }

# #67: the script must not assume $HOME/bin exists.
if [[ -d "$TEST_HOME/bin" ]]; then
  pass "fresh HOME: bootstrap created \$HOME/bin (#67)"
else
  fail "bootstrap did not create \$HOME/bin on a fresh HOME (#67)"
fi

# #69: pnpm must not be fetched through corepack.
if grep -qE '^corepack (enable|prepare)' "$CALLS"; then
  fail "bootstrap invoked 'corepack enable/prepare' — blocked on corporate networks (ENV-0, #69)"
  grep -E '^corepack' "$CALLS" | sed 's/^/      /' >&2
else
  pass "pnpm was not fetched via corepack (ENV-0, #69)"
fi

# Outcome: pnpm installed, at the pin, from the user's configured registry.
if grep -qF "npm install -g pnpm@$PIN" "$CALLS"; then
  pass "pnpm installed via npm at the pinned version ($PIN)"
else
  fail "expected 'npm install -g pnpm@$PIN'"
fi

if [[ -x "$NPM_PREFIX/bin/pnpm" ]] && [[ "$("$NPM_PREFIX/bin/pnpm" --version)" == "$PIN" ]]; then
  pass "resulting pnpm reports the pinned version ($PIN)"
else
  fail "pnpm binary missing or wrong version (expected $PIN)"
fi

if grep -q "Stopped after Phase 1" "$OUTPUT"; then
  pass "bootstrap completed Phase 1"
else
  fail "bootstrap did not complete Phase 1"
fi

echo
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || { dump; exit 1; }

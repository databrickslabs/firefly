#!/usr/bin/env bash
# Hermetic end-to-end tests for PyPI proxy config, bridge, and Phase 4 lock guards.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP="$ROOT/scripts/bootstrap.sh"
GUARD="$ROOT/scripts/lib/corp-network.sh"
DEAD="https://pypi-proxy.dev.databricks.com/simple"
CLOUD="https://pypi-proxy.cloud.databricks.com/simple"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

TESTS=0
FAILURES=0

pass() {
  TESTS=$((TESTS + 1))
  printf 'ok %d - %s\n' "$TESTS" "$1"
}

fail_test() {
  TESTS=$((TESTS + 1))
  FAILURES=$((FAILURES + 1))
  printf 'not ok %d - %s\n' "$TESTS" "$1" >&2
  [[ -s "$TMP/last.out" ]] && { printf '%s\n' '--- output ---' >&2; printf '%s\n' "$(cat "$TMP/last.out")" >&2; }
}

expect_pass() {
  local name="$1"; shift
  if "$@" >"$TMP/last.out" 2>&1; then pass "$name"; else fail_test "$name"; fi
}

expect_fail_with() {
  local name="$1" expected="$2"; shift 2
  if "$@" >"$TMP/last.out" 2>&1; then
    fail_test "$name (unexpected success)"
  elif grep -Fq "$expected" "$TMP/last.out"; then
    pass "$name"
  else
    fail_test "$name (missing: $expected)"
  fi
}

# Succeeds AND emits the expected text — for the non-fatal warning path, where asserting
# only the exit code would silently accept the warning being dropped.
expect_pass_with() {
  local name="$1" expected="$2"; shift 2
  if ! "$@" >"$TMP/last.out" 2>&1; then
    fail_test "$name (unexpected failure)"
  elif grep -Fq "$expected" "$TMP/last.out"; then
    pass "$name"
  else
    fail_test "$name (missing: $expected)"
  fi
}

make_fixture() {
  local name="$1"
  local dir="$TMP/$name"
  mkdir -p "$dir/home/.config/uv" "$dir/repo/agent-build" "$dir/repo/databricks-apps/guest-manager" "$dir/bin"
  printf 'source = { registry = "%s/" }\n' "$CLOUD" >"$dir/repo/agent-build/uv.lock"
  printf 'source = { registry = "%s/" }\n' "$CLOUD" >"$dir/repo/databricks-apps/guest-manager/uv.lock"
  cat >"$dir/bin/python3" <<'PY'
#!/usr/bin/env bash
if [[ "${FAKE_PIP_INDEX+x}" == "x" && -n "$FAKE_PIP_INDEX" ]]; then
  printf '%s\n' "$FAKE_PIP_INDEX"
  exit 0
fi
exit 1
PY
  chmod +x "$dir/bin/python3"
  printf '%s\n' "$dir"
}

bootstrap_check() {
  local fixture="$1"; shift
  env -u UV_DEFAULT_INDEX -u UV_INDEX_URL \
    HOME="$fixture/home" \
    PATH="$fixture/bin:$PATH" \
    PIP_CONFIG_FILE=/dev/null \
    REPO_DIR="$fixture/repo" \
    "$@" \
    bash "$BOOTSTRAP" --check-pypi-proxy
}

good="$(make_fixture good)"
expect_pass "safe config and both cloud locks pass through real bootstrap" bootstrap_check "$good"

bad_agent="$(make_fixture bad-agent)"
printf 'source = { registry = "%s/" }\n' "$DEAD" >"$bad_agent/repo/agent-build/uv.lock"
expect_fail_with "agent-build .dev lock fails before deploy" "agent-build/uv.lock stamps" bootstrap_check "$bad_agent"

bad_guest="$(make_fixture bad-guest)"
printf 'source = { registry = "%s/" }\n' "$DEAD" >"$bad_guest/repo/databricks-apps/guest-manager/uv.lock"
expect_fail_with "guest-manager .dev lock fails before deploy" "guest-manager/uv.lock stamps" bootstrap_check "$bad_guest"

# Live pip/uv CONFIG carrying .dev warns by default and only fails under
# FIREFLY_STRICT_PYPI_PROXY=1. Rationale in scripts/lib/corp-network.sh: .dev is
# unsanctioned and was implicated in the Apps install timeouts, but it is NOT a dead host
# (it resolves and serves full indexes), and nobody has yet checked reachability from the
# Apps runtime — which is the evidence that would justify failing closed. Checked-in
# lockfiles stay fatal either way; see the lock cases above.
STRICT=FIREFLY_STRICT_PYPI_PROXY=1

bad_default_env="$(make_fixture bad-default-env)"
expect_fail_with "UV_DEFAULT_INDEX .dev fails (strict)" "UV_DEFAULT_INDEX uses the unsanctioned index" \
  bootstrap_check "$bad_default_env" $STRICT UV_DEFAULT_INDEX="$DEAD"
expect_pass_with "UV_DEFAULT_INDEX .dev warns (default)" "not the sanctioned index" \
  bootstrap_check "$bad_default_env" UV_DEFAULT_INDEX="$DEAD"

bad_legacy_env="$(make_fixture bad-legacy-env)"
expect_fail_with "UV_INDEX_URL .dev fails (strict)" "UV_INDEX_URL uses the unsanctioned index" \
  bootstrap_check "$bad_legacy_env" $STRICT UV_INDEX_URL="$DEAD"

bad_pip="$(make_fixture bad-pip)"
expect_fail_with "pip index .dev fails (strict)" "pip index-url uses the unsanctioned index" \
  bootstrap_check "$bad_pip" $STRICT FAKE_PIP_INDEX="$DEAD"
expect_pass_with "pip index .dev warns (default)" "not the sanctioned index" \
  bootstrap_check "$bad_pip" FAKE_PIP_INDEX="$DEAD"

bad_uv_toml="$(make_fixture bad-uv-toml)"
printf '[[index]]\nurl = "%s/"\ndefault = true\n' "$DEAD" >"$bad_uv_toml/home/.config/uv/uv.toml"
expect_fail_with "uv.toml .dev fails (strict)" "uv.toml uses the unsanctioned index" \
  bootstrap_check "$bad_uv_toml" $STRICT

cloud_env="$(make_fixture cloud-env)"
expect_pass "explicit cloud UV_DEFAULT_INDEX passes" \
  bootstrap_check "$cloud_env" UV_DEFAULT_INDEX="$CLOUD"

bridge="$(make_fixture bridge)"
expect_pass "safe custom pip index is bridged unchanged" \
  env -u UV_DEFAULT_INDEX -u UV_INDEX_URL HOME="$bridge/home" PATH="$bridge/bin:$PATH" \
    PIP_CONFIG_FILE=/dev/null FAKE_PIP_INDEX="https://artifactory.example/simple" \
    bash -c 'source "$1"; bridge_pip_index_to_uv; [[ "$UV_DEFAULT_INDEX" == "https://artifactory.example/simple" ]]' _ "$GUARD"

public="$(make_fixture public)"
expect_pass "public PyPI is not unnecessarily bridged" \
  env -u UV_DEFAULT_INDEX -u UV_INDEX_URL HOME="$public/home" PATH="$public/bin:$PATH" \
    PIP_CONFIG_FILE=/dev/null FAKE_PIP_INDEX="https://pypi.org/simple" \
    bash -c 'source "$1"; bridge_pip_index_to_uv; [[ -z "${UV_DEFAULT_INDEX:-}" ]]' _ "$GUARD"

expect_pass "all tracked repository locks pass the recursive scanner" \
  bash "$ROOT/scripts/check-no-dev-pypi-proxy.sh"

printf '1..%d\n' "$TESTS"
if [[ "$FAILURES" -ne 0 ]]; then
  printf '%d test(s) failed\n' "$FAILURES" >&2
  exit 1
fi
printf 'All %d PyPI proxy guard tests passed.\n' "$TESTS"

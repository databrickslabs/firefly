#!/usr/bin/env bash
# Hermetic regression test for bootstrap Phase 1a.
# Runs the real bootstrap through Phase 1 with a fresh HOME, real Corepack
# `enable`, and local stubs for network/auth commands.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/bootstrap.sh"
REAL_COREPACK="$(command -v corepack || true)"

[[ -x "$BOOTSTRAP" ]] || { echo "bootstrap.sh not executable: $BOOTSTRAP" >&2; exit 1; }
[[ -n "$REAL_COREPACK" ]] || { echo "SKIP: corepack is not installed" >&2; exit 0; }

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT
TEST_HOME="$TEST_ROOT/home"
STUB_BIN="$TEST_ROOT/stubs"
mkdir -p "$TEST_HOME" "$STUB_BIN"

write_stub() {
  local name="$1"
  shift
  {
    echo '#!/usr/bin/env bash'
    printf '%s\n' "$@"
  } > "$STUB_BIN/$name"
  chmod +x "$STUB_BIN/$name"
}

# Phase 0 probes. Public npm + successful TLS mean no mirror/CA setup is needed.
write_stub npm '
if [[ "$*" == "config get registry" ]]; then
  echo "https://registry.npmjs.org/"
fi
exit 0'
write_stub curl 'exit 0'

# Phase 1 auth/tooling commands are deliberately local no-ops. The test targets
# the real bootstrap control flow and real Corepack filesystem behavior, not
# external OAuth or service availability.
write_stub vercel '
case "${1:-}" in
  --version) echo "vercel-test" ;;
  whoami) echo "test-user" ;;
esac
exit 0'
write_stub gh '
case "${1:-}" in
  --version) echo "gh version test" ;;
  auth) exit 0 ;;
esac
exit 0'
write_stub neonctl '
case "${1:-}" in
  --version) echo "neonctl-test" ;;
  me) echo "test-user" ;;
esac
exit 0'
write_stub databricks '
case "${1:-}" in
  --version) echo "Databricks CLI test" ;;
  auth|workspace) exit 0 ;;
esac
exit 0'
write_stub uv '
[[ "${1:-}" == "--version" ]] && echo "uv-test"
exit 0'

# Delegate `enable` to the real Corepack binary. Avoid the network-dependent
# `prepare` download: successful enable and shim creation are the regression
# boundary under test.
write_stub corepack '
if [[ "${1:-}" == "enable" ]]; then
  exec "$REAL_COREPACK" "$@"
fi
if [[ "${1:-}" == "prepare" ]]; then
  exit 0
fi
echo "unexpected corepack invocation: $*" >&2
exit 1'

[[ ! -e "$TEST_HOME/bin" ]] || {
  echo "test fixture invalid: $TEST_HOME/bin already exists" >&2
  exit 1
}

OUTPUT="$TEST_ROOT/bootstrap.out"
if ! env \
  HOME="$TEST_HOME" \
  PATH="$STUB_BIN:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" \
  REAL_COREPACK="$REAL_COREPACK" \
  COREPACK_HOME="$TEST_HOME/.cache/corepack" \
  bash "$BOOTSTRAP" --stop-after=1 >"$OUTPUT" 2>&1 <<EOF
https://example.cloud.databricks.com





00000000-0000-0000-0000-000000000000

test-team



EOF
then
  echo "FAIL: bootstrap exited before completing Phase 1" >&2
  printf '%s\n' "---- bootstrap output ----" >&2
  cat "$OUTPUT" >&2
  exit 1
fi

[[ -d "$TEST_HOME/bin" ]] || {
  echo "FAIL: bootstrap did not create $TEST_HOME/bin" >&2
  printf '%s\n' "---- bootstrap output ----" >&2
  cat "$OUTPUT" >&2
  exit 1
}

[[ -L "$TEST_HOME/bin/pnpm" || -x "$TEST_HOME/bin/pnpm" ]] || {
  echo "FAIL: corepack did not install the pnpm shim" >&2
  printf '%s\n' "---- bootstrap output ----" >&2
  cat "$OUTPUT" >&2
  exit 1
}

grep -q "Stopped after Phase 1" "$OUTPUT" || {
  echo "FAIL: bootstrap did not complete Phase 1" >&2
  cat "$OUTPUT" >&2
  exit 1
}

echo "PASS: fresh-HOME bootstrap created \$HOME/bin and enabled Corepack"

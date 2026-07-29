#!/usr/bin/env bash
# test-runbook-lib.sh — hermetic tests for scripts/lib/runbook.sh.
#
#   bash scripts/test-runbook-lib.sh
#
# No network, no cloud, no $HOME writes. Every case below is a defect observed on the
# 2026-07-25 fresh-install run; each assertion is the thing that would have caught it.
#
# The state helpers are exercised under BOTH bash and zsh on purpose. BOOTSTRAP.md tells
# the reader to source this library from their own shell, zsh is the macOS default, and
# the previous implementation used ${!key} — bash-only indirect expansion, which produced
# "(eval):1: bad substitution" on a real run and left DATABASE_URL empty.

set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LIB="scripts/lib/runbook.sh"
FAILED=0
pass() { echo "  ✓ $*"; }
bad()  { echo "  ✗ $*"; FAILED=1; }

echo "== scripts/lib/runbook.sh =="

# ── state.env round-trip, under every shell the runbook supports ─────────────
for sh in bash zsh; do
  command -v "$sh" >/dev/null 2>&1 || { pass "$sh not installed — skipped."; continue; }
  if out=$("$sh" -c '
      set -u
      source '"$LIB"'
      REPO_DIR=$(mktemp -d); export REPO_DIR
      # Same shell metacharacters a real connection string carries (: / @ ? & and a
      # space), without being shaped like one — secret scanners flag the real shape.
      secret="scheme://user:pw@host/path?flag=yes&opt=a b"
      store_secret DATABASE_URL "$secret" >/dev/null
      got=$(read_secret DATABASE_URL) || { echo "read failed"; exit 1; }
      [ "$got" = "$secret" ] || { echo "round-trip mismatch: [$got]"; exit 1; }
      read_secret ABSENT >/dev/null 2>&1 && { echo "absent key should fail"; exit 1; }
      require_secret OUT DATABASE_URL || { echo "require_secret failed"; exit 1; }
      [ "$OUT" = "$secret" ] || { echo "require_secret wrong value"; exit 1; }
      require_secret X ABSENT >/dev/null 2>&1 && { echo "require_secret should fail on absent"; exit 1; }
      [ "$(stat -f %Lp "$REPO_DIR/.firefly-bootstrap/state.env")" = "600" ] \
        || { echo "state.env not 0600"; exit 1; }
      rm -rf "$REPO_DIR"; echo ok
    ' 2>&1) && [[ "$out" == *ok* ]]; then
    pass "state.env round-trip under $sh (metachars, absent keys, 0600)."
  else
    bad "state.env round-trip failed under $sh: $out"
  fi
done

# shellcheck source=scripts/lib/runbook.sh
source "$LIB"

# ── parsers ──────────────────────────────────────────────────────────────────
# `neonctl projects create --output json` nests the id under "project". The runbook
# read a top-level 'id' for ten days after bootstrap.sh was fixed, because they were
# separate copies; the create then succeeded server-side while the parse failed,
# orphaning a project.
got=$(echo '{"project":{"id":"cold-flower-29604204","name":"firefly-genie"}}' | extract_neon_project_id)
[[ "$got" == "cold-flower-29604204" ]] \
  && pass "extract_neon_project_id reads the nested project.id." \
  || bad "extract_neon_project_id nested shape: got [$got]"

got=$(echo '{"id":"legacy-flat-123"}' | extract_neon_project_id)
[[ "$got" == "legacy-flat-123" ]] \
  && pass "extract_neon_project_id falls back to a flat id." \
  || bad "extract_neon_project_id flat shape: got [$got]"

got=$(printf 'Vercel CLI 56.3.1\nInspect: https://vercel.com/x/y\nProduction: https://firefly-genie-a1b2c3.vercel.app [2s]\n' \
      | extract_vercel_preview_url)
[[ "$got" == "https://firefly-genie-a1b2c3.vercel.app" ]] \
  && pass "extract_vercel_preview_url strips CLI chatter." \
  || bad "extract_vercel_preview_url: got [$got]"

# ── bundle assertions ────────────────────────────────────────────────────────
# The committed bundle carries the authoring workspace's experiment id. Deploying it
# unrewritten returns "Node ID <id> does not exist (404)" and names nothing useful.
if assert_bundle_quickstart_ran agent/databricks.yml >/dev/null 2>&1; then
  bad "assert_bundle_quickstart_ran passed on the committed placeholder — it must fail."
else
  pass "assert_bundle_quickstart_ran rejects the committed placeholder."
fi

TMP=$(mktemp -d)
sed "s/${FIREFLY_PLACEHOLDER_EXPERIMENT_ID}/987654321/" agent/databricks.yml > "$TMP/rewritten.yml"
if assert_bundle_quickstart_ran "$TMP/rewritten.yml" >/dev/null 2>&1; then
  pass "assert_bundle_quickstart_ran accepts a quickstart-rewritten bundle."
else
  bad "assert_bundle_quickstart_ran rejected a rewritten bundle."
fi

# ── sync.exclude rules ───────────────────────────────────────────────────────
# The exclude list opens with a comment mentioning pyproject.toml and vendor-wheels/.
# A bare grep therefore reports both as excluded (bootstrap.sh did, and failed a correct
# config); a naive '-\s' scan reads the list as empty and passes anything (an agent did).
if check_sync_exclude_rules agent/databricks.yml >/dev/null 2>&1; then
  pass "check_sync_exclude_rules accepts the correct committed config."
else
  bad "check_sync_exclude_rules rejected the correct committed config."
fi

sed 's|^    - uv.lock$|    - uv.lock\n    - pyproject.toml|' agent/databricks.yml > "$TMP/no-pyproject.yml"
sed '/^    - uv.lock$/d'                                      agent/databricks.yml > "$TMP/no-lock.yml"
sed 's|^    - uv.lock$|    - uv.lock\n    - vendor-wheels/**|' agent/databricks.yml > "$TMP/no-wheels.yml"
for case_ in no-pyproject:pyproject.toml no-lock:uv.lock no-wheels:vendor-wheels; do
  f="${case_%%:*}"; what="${case_##*:}"
  if check_sync_exclude_rules "$TMP/$f.yml" >/dev/null 2>&1; then
    bad "check_sync_exclude_rules passed a config that breaks $what."
  else
    pass "check_sync_exclude_rules catches a broken $what rule."
  fi
done
rm -rf "$TMP"

# ── index preflight ──────────────────────────────────────────────────────────
# Must resolve an index without contacting one; the reachability probe itself needs
# network and is exercised by the E2E harness, not here.
# shellcheck source=scripts/lib/corp-network.sh
source scripts/lib/corp-network.sh
got=$(UV_DEFAULT_INDEX="https://example.invalid/simple" firefly_effective_pypi_index)
[[ "$got" == "https://example.invalid/simple" ]] \
  && pass "firefly_effective_pypi_index prefers UV_DEFAULT_INDEX." \
  || bad "firefly_effective_pypi_index UV_DEFAULT_INDEX: got [$got]"

got=$(unset UV_DEFAULT_INDEX UV_INDEX_URL; HOME=/nonexistent firefly_effective_pypi_index)
[[ "$got" == "https://pypi.org/simple/" ]] \
  && pass "firefly_effective_pypi_index falls back to public PyPI when unconfigured." \
  || bad "firefly_effective_pypi_index default: got [$got]"

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "All runbook-lib tests pass."
else
  echo "One or more runbook-lib tests FAILED (see ✗ above)." >&2
fi
exit "$FAILED"

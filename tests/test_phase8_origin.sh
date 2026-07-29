#!/usr/bin/env bash
# Hermetic tests for Phase 8 app-origin resolution (issue #19).
#
# #19 has regressed twice, both times because the *test conditions* — not the code —
# let it through. Cycle 1 was validated with a unique project name, so the domain
# collision never occurred. Cycle 2 was validated with a fresh project per run, so the
# re-run path never ran. Each fix looked correct and passed its own suite.
#
# These checks encode the two invariants that survive both cycles:
#   - the serving origin is READ, never constructed from $VERCEL_PROJECT;
#   - it is not derived from `vercel deploy` stdout, whose meaning depends on whether
#     the project has deployed before.
#
# No network and no Vercel account: the resolver is extracted from bootstrap.sh and run
# against captured API shapes. The live counterpart (a real deploy, a globally colliding
# name, and a second Phase 8 run against the same project) needs a VM and credentials
# and runs out-of-band; see the PR for #19.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP="$ROOT/scripts/bootstrap.sh"

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
  [[ -n "${2:-}" ]] && printf '  # %s\n' "$2" >&2
  return 0
}

# ── extract the resolver from bootstrap.sh ───────────────────────────────────
# Testing the real block rather than a copy. If the heredoc moves or is renamed the
# extraction fails loudly, which is the correct outcome — a silent skip here is how a
# resolver test rots into always-passing.
RESOLVER="$TMP/resolve.py"
awk "/<<'PY'/{flag=1; next} /^PY\$/{flag=0} flag" "$BOOTSTRAP" > "$RESOLVER"
HAVE_RESOLVER=true
[[ -s "$RESOLVER" ]] || HAVE_RESOLVER=false

domains_doc() { printf '{"domains": [%s]}' "$1" > "$TMP/domains.json"; }
project_doc() { printf '%s' "$1" > "$TMP/project.json"; }
d_entry() {  # name [verified] [gitBranch] [redirect]
  printf '{"name":"%s","verified":%s,"gitBranch":%s,"redirect":%s}' \
    "$1" "${2:-true}" "${3:-null}" "${4:-null}"
}
resolve() { python3 "$RESOLVER" "$TMP/domains.json" "$TMP/project.json" 2>/dev/null || true; }

expect_origin() {  # description expected
  local got; got="$(resolve)"
  [[ "$got" == "$2" ]] && pass "$1" || fail_test "$1" "want '$2', got '${got:-<empty>}'"
}

expect_refusal() {  # description
  local got; got="$(resolve)"
  [[ -z "$got" ]] && pass "$1" || fail_test "$1" "expected no output, got '$got'"
}

# ── invariants over Phase 8 ──────────────────────────────────────────────────
# Comments may discuss the guessable form; a line that uses it must be marked fence-ok
# so each exception is deliberate and visible in review.
hits="$(grep -nE '\$\{?VERCEL_PROJECT\}?\.vercel\.app' "$BOOTSTRAP" \
        | grep -vE '^[0-9]+:[[:space:]]*#' | grep -v 'fence-ok' || true)"
[[ -z "$hits" ]] \
  && pass "no unmarked construction of a host from \$VERCEL_PROJECT" \
  || fail_test "no unmarked construction of a host from \$VERCEL_PROJECT" "$hits"

# Aliasing $VERCEL_PROJECT.vercel.app hard-fails when another account owns that name.
hits="$(grep -nE '^[^#]*vercel alias set' "$BOOTSTRAP" || true)"
[[ -z "$hits" ]] \
  && pass "Phase 8 does not pin an alias it may not own" \
  || fail_test "Phase 8 does not pin an alias it may not own" "$hits"

grep -qE '^[^#]*vercel deploy --prod' "$BOOTSTRAP" \
  && pass "Phase 8 deploys with an explicit --prod" \
  || fail_test "Phase 8 deploys with an explicit --prod" \
       "a bare deploy is production only on a project's FIRST deploy"

# The re-run regression in its exact shape: a bare deploy's URL is the production domain
# on run 1 and a per-deployment preview host on run 2.
PHASE8="$(awk '/^# ─── Phase 8/,/^stop_if_done "8"/' "$BOOTSTRAP")"
hits="$(printf '%s\n' "$PHASE8" | grep -nE '^[^#]*PREVIEW_URL=' | grep -v 'APP_ORIGIN' || true)"
[[ -z "$hits" ]] \
  && pass "every Phase 8 assignment of the entry URL comes from the resolved origin" \
  || fail_test "every Phase 8 assignment of the entry URL comes from the resolved origin" \
       "assigned from something else (a deploy-stdout URL is production only on the FIRST deploy): $hits"

grep -q 'PREVIEW_URL="\$APP_ORIGIN"' "$BOOTSTRAP" \
  && pass "Phase 9's entry URL is the resolved origin" \
  || fail_test "Phase 9's entry URL is the resolved origin" "expected PREVIEW_URL=\$APP_ORIGIN"

grep -qE "vercel env add BETTER_AUTH_URL .*\\\$APP_ORIGIN" "$BOOTSTRAP" \
  && pass "BETTER_AUTH_URL is set from the resolved origin" \
  || fail_test "BETTER_AUTH_URL is set from the resolved origin"

# ── resolver behaviour ───────────────────────────────────────────────────────
# Guarded: a Phase 8 that resolves nothing has no resolver to extract, and the
# invariants above already say so. Skipping here keeps that diagnosis readable.
if [[ "$HAVE_RESOLVER" == "true" ]]; then

# Once production has deployed, targets.production.alias is where it actually serves.
domains_doc "$(d_entry 'proj.vercel.app')"
project_doc '{"targets":{"production":{"alias":["proj.vercel.app","proj-team.vercel.app"]}}}'
expect_origin "deployed project resolves to production alias[0]" "https://proj.vercel.app"

# Observed on a real project: /domains lists a domain that production does NOT serve.
# The production alias has to win, or BETTER_AUTH_URL points somewhere inert.
domains_doc "$(d_entry 'proj.vercel.app')"
project_doc '{"targets":{"production":{"alias":["proj-team.vercel.app"]}}}'
expect_origin "production alias wins over a /domains entry that disagrees" \
  "https://proj-team.vercel.app"

# Pre-deploy: targets.production.alias is absent. The domain is allocated at project
# creation, so /domains already answers — which is what allows a single deploy.
domains_doc "$(d_entry 'proj.vercel.app')"
project_doc '{}'
expect_origin "free name resolves pre-deploy to the bare domain" "https://proj.vercel.app"

# A taken name gets a random suffix (`demo` -> demo-zeta-seven-61). Unguessable by
# construction; this is the case that broke guest login in #19.
domains_doc "$(d_entry 'proj-zeta-seven-61.vercel.app')"
project_doc '{}'
expect_origin "taken name resolves pre-deploy to the assigned suffix" \
  "https://proj-zeta-seven-61.vercel.app"

domains_doc "$(d_entry 'feat-x.vercel.app' true '"feat/x"'), $(d_entry 'old.vercel.app' true null '"proj.vercel.app"'), $(d_entry 'proj-kappa-42.vercel.app')"
project_doc '{}'
expect_origin "branch-scoped and redirect domains are ignored" \
  "https://proj-kappa-42.vercel.app"

# Refusals. A guess that is usually right is the failure mode this issue keeps taking,
# so an unresolvable state must produce nothing and let the caller stop.
domains_doc ''
project_doc '{}'
expect_refusal "no domain resolves to nothing rather than a guess"

domains_doc "$(d_entry 'pending.vercel.app' false)"
project_doc '{}'
expect_refusal "an unverified domain resolves to nothing"

domains_doc "$(d_entry 'a-one.vercel.app'), $(d_entry 'a-two.vercel.app')"
project_doc '{}'
expect_refusal "two candidates with no tiebreak resolve to nothing"
else
  fail_test "an origin resolver is present in Phase 8" \
    "no <<'PY' resolver block in bootstrap.sh — the origin is not being read from the API"
fi

printf '\n1..%d\n' "$TESTS"
if [[ "$FAILURES" -gt 0 ]]; then
  printf '%d of %d checks failed\n' "$FAILURES" "$TESTS" >&2
  exit 1
fi
printf 'all %d checks passed\n' "$TESTS"

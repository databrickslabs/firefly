#!/usr/bin/env bash
# check-runbook-invariants.sh — guard the invariants that ENV-0 taught us.
#
# Run locally:  bash scripts/check-runbook-invariants.sh
# Run in CI:    .github/workflows/runbook-invariants.yml
#
# BACKGROUND
# ENV-0 (corporate networks block public npm, so corepack cannot fetch pnpm) was found on
# 2026-07-11 and fixed by installing pnpm via npm. Because it was classified
# "environment/not-repo" it was never filed as an issue, its BOOTSTRAP.md warning was later
# deleted, and the runbook was then changed back to requiring corepack — reintroducing the
# original failure for the next person on a locked-down network. These checks make that
# specific regression, and the doc/runner drift that hid it, fail loudly instead.

set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FAILED=0
pass() { echo "  ✓ $*"; }
bad()  { echo "  ✗ $*"; FAILED=1; }

echo "== ENV-0 / runbook-parity invariants =="

# ── 1. The runbook must not require corepack for pnpm (ENV-0). ────────────────
# corepack fetches its package manager from registry.npmjs.org and ignores the npm
# registry setting, so it hard-fails wherever public npm is blocked.
if rg -q '^[[:space:]]*corepack[[:space:]]+(enable|prepare)' BOOTSTRAP.md; then
  bad "BOOTSTRAP.md requires 'corepack enable/prepare' — blocked on corporate networks (ENV-0)."
  echo "      Use: npm install -g pnpm@<pinned-version>  (npm honors the user's registry)"
  rg -n '^[[:space:]]*corepack[[:space:]]+(enable|prepare)' BOOTSTRAP.md | sed 's/^/      /'
else
  pass "BOOTSTRAP.md does not require corepack for pnpm."
fi

if rg -q '^[[:space:]]*run "corepack[[:space:]]+(enable|prepare)' scripts/bootstrap.sh; then
  bad "bootstrap.sh runs 'corepack enable/prepare' — blocked on corporate networks (ENV-0)."
else
  pass "bootstrap.sh does not run corepack for pnpm."
fi

# ── 2. Corporate-network handling must be reachable from the runbook. ─────────
# The original defect was that Phase 0 of BOOTSTRAP.md had zero runnable commands while all
# the bridges lived in bootstrap.sh. Anyone following the doc (the "Open in Cursor" path)
# therefore ran installs with no bridge set.
LIB="scripts/lib/corp-network.sh"
if [[ ! -f "$LIB" ]]; then
  bad "$LIB is missing — the shared corporate-network library is the single source of truth."
else
  pass "$LIB exists."
  for consumer in BOOTSTRAP.md scripts/bootstrap.sh; do
    if rg -q 'lib/corp-network\.sh' "$consumer"; then
      pass "$consumer references $LIB (no drift)."
    else
      bad "$consumer does not reference $LIB — runbook and runner can drift again."
    fi
  done
  if rg -q 'firefly_bridge_corp_network' BOOTSTRAP.md; then
    pass "BOOTSTRAP.md Phase 0 invokes firefly_bridge_corp_network."
  else
    bad "BOOTSTRAP.md never invokes firefly_bridge_corp_network — Phase 0 would be prose-only again."
  fi
fi

# ── 3. Phase 0 of the runbook must contain at least one runnable command. ─────
# Phase 0 is everything before the '## Phase 1' heading.
PHASE0_FENCES=$(awk '/^## Phase 1/{exit} /^```bash/{n++} END{print n+0}' BOOTSTRAP.md)
if [[ "$PHASE0_FENCES" -gt 0 ]]; then
  pass "BOOTSTRAP.md Phase 0 has $PHASE0_FENCES runnable bash block(s)."
else
  bad "BOOTSTRAP.md Phase 0 has no runnable bash blocks — corporate-network setup is prose only."
fi

# ── 4. The pnpm pin must agree everywhere. ───────────────────────────────────
LIB_PIN=$(rg -o 'PNPM_VERSION:=([0-9]+\.[0-9]+\.[0-9]+)' -r '$1' "$LIB" 2>/dev/null | head -1)
PKG_PIN=$(python3 -c 'import json;print(json.load(open("package.json")).get("packageManager","").split("@")[-1])' 2>/dev/null)
DOC_PIN=$(rg -o 'npm install -g pnpm@([0-9]+\.[0-9]+\.[0-9]+)' -r '$1' BOOTSTRAP.md 2>/dev/null | head -1)
if [[ -n "$LIB_PIN" && "$LIB_PIN" == "$PKG_PIN" && "$LIB_PIN" == "$DOC_PIN" ]]; then
  pass "pnpm pin consistent across lib / package.json / BOOTSTRAP.md ($LIB_PIN)."
else
  bad "pnpm pin mismatch — lib='$LIB_PIN' package.json='$PKG_PIN' BOOTSTRAP.md='$DOC_PIN'."
  echo "      An unpinned pnpm resolves the 'latest' dist-tag, which has shipped a 12.x alpha"
  echo "      that ignores onlyBuiltDependencies (ERR_PNPM_IGNORED_BUILDS)."
fi

# ── 5. The agent-facing invariant must stay documented. ──────────────────────
# Actions is disabled on this repo, so AGENTS.md / CLAUDE.md are the only controls that
# reach an agent editing the runbook — and an agent (a docs-sync commit) is what caused the
# original regression. Deleting the written rule is precisely how ENV-0 was lost the first
# time, so treat its removal as a failure in its own right.
for doc in AGENTS.md CLAUDE.md; do
  if rg -q 'ENV-0' "$doc" && rg -qi 'corepack' "$doc"; then
    pass "$doc documents the ENV-0 / corepack invariant."
  else
    bad "$doc no longer documents the ENV-0 corepack invariant — restore it."
    echo "      Agents load these files automatically; the rule is the only live guard"
    echo "      while GitHub Actions is disabled on this repository."
  fi
done

# ── 6. README and the runbook must not contradict each other. ────────────────
# The README kept its correct "don't use corepack" guidance while the runbook switched to
# requiring corepack, so the repo shipped two opposite instructions for months.
if rg -q 'npm install -g pnpm' README.md; then
  pass "README.md documents the npm install path for pnpm (agrees with the runbook)."
else
  bad "README.md no longer documents 'npm install -g pnpm' — it may contradict the runbook."
fi

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "All runbook invariants hold."
else
  echo "One or more invariants FAILED (see ✗ above)." >&2
fi
exit "$FAILED"

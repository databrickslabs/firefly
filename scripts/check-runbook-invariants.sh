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
if grep -qE '^[[:space:]]*corepack[[:space:]]+(enable|prepare)' BOOTSTRAP.md; then
  bad "BOOTSTRAP.md requires 'corepack enable/prepare' — blocked on corporate networks (ENV-0)."
  echo "      Use: npm install -g pnpm@<pinned-version>  (npm honors the user's registry)"
  grep -nE '^[[:space:]]*corepack[[:space:]]+(enable|prepare)' BOOTSTRAP.md | sed 's/^/      /'
else
  pass "BOOTSTRAP.md does not require corepack for pnpm."
fi

if grep -qE '^[[:space:]]*run "corepack[[:space:]]+(enable|prepare)' scripts/bootstrap.sh; then
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
    if grep -qE 'lib/corp-network\.sh' "$consumer"; then
      pass "$consumer references $LIB (no drift)."
    else
      bad "$consumer does not reference $LIB — runbook and runner can drift again."
    fi
  done
  if grep -qE 'firefly_bridge_corp_network' BOOTSTRAP.md; then
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
LIB_PIN=$(sed -nE 's/.*PNPM_VERSION:=([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' "$LIB" 2>/dev/null | head -1)
PKG_PIN=$(python3 -c 'import json;print(json.load(open("package.json")).get("packageManager","").split("@")[-1])' 2>/dev/null)
DOC_PIN=$(sed -nE 's/.*npm install -g pnpm@([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' BOOTSTRAP.md 2>/dev/null | head -1)
if [[ -n "$LIB_PIN" && "$LIB_PIN" == "$PKG_PIN" && "$LIB_PIN" == "$DOC_PIN" ]]; then
  pass "pnpm pin consistent across lib / package.json / BOOTSTRAP.md ($LIB_PIN)."
else
  bad "pnpm pin mismatch — lib='$LIB_PIN' package.json='$PKG_PIN' BOOTSTRAP.md='$DOC_PIN'."
  echo "      An unpinned pnpm resolves the 'latest' dist-tag, which has shipped a 12.x alpha"
  echo "      that ignores onlyBuiltDependencies (ERR_PNPM_IGNORED_BUILDS)."
fi

# ── 5. Every library the runbook sources must work under bash AND zsh. ───────
# BOOTSTRAP.md Phase 0a tells the reader to `source scripts/lib/*.sh` from their own shell,
# and zsh is the macOS default. Bash-only idioms silently break there: `declare -F name` is
# a function test in bash but declares a FLOAT in zsh (returns 0), so a
# `declare -F x || x() {…}` guard skips the definition and every call dies with
# "command not found". Caught on a live corp VM; assert both shells here.
#
# Derived from the runbook rather than hardcoded to one path: this check used to name
# corp-network.sh only, so a second library could be added with no portability coverage.
# Built with a read loop, not `mapfile`: macOS ships bash 3.2, where mapfile does not exist.
SOURCED_LIBS=()
while IFS= read -r _lib; do
  [[ -n "$_lib" ]] && SOURCED_LIBS+=("$_lib")
done < <(sed -nE 's|^[[:space:]]*source[[:space:]]+(scripts/lib/[A-Za-z0-9_-]+\.sh).*|\1|p' BOOTSTRAP.md | sort -u)
if [[ "${#SOURCED_LIBS[@]}" -eq 0 ]]; then
  bad "BOOTSTRAP.md sources no scripts/lib/*.sh — the shared-implementation path is gone."
else
  pass "BOOTSTRAP.md sources ${#SOURCED_LIBS[@]} shared librar$([[ ${#SOURCED_LIBS[@]} -eq 1 ]] && echo y || echo ies): ${SOURCED_LIBS[*]}"
fi
for lib in "${SOURCED_LIBS[@]}"; do
  if [[ ! -f "$lib" ]]; then
    bad "BOOTSTRAP.md sources $lib, which does not exist."
    continue
  fi
  for sh in bash zsh; do
    if ! command -v "$sh" >/dev/null 2>&1; then
      pass "$sh not installed — skipping portability check for $lib."
      continue
    fi
    if "$sh" -n "$lib" 2>/dev/null && \
       "$sh" -c "source '$lib'; ok x >/dev/null && note x >/dev/null && warn x >/dev/null && fail x >/dev/null" >/dev/null 2>&1; then
      pass "$lib sources cleanly under $sh (helpers resolve)."
    else
      bad "$lib is not usable under $sh — Phase 0a tells users to source it from their shell."
      echo "      Avoid bash-only idioms ('declare -F' is not a function test in zsh;"
      echo "      \${!var} indirect expansion does not exist there either)."
    fi
  done
done

# ── 5a. Every function the runbook calls must actually be defined. ───────────
# BOOTSTRAP.md called store_secret / read_secret for four days while both existed only in
# bootstrap.sh — and bootstrap.sh's read_secret took (VARNAME, _, KEY) while every runbook
# call site used $(read_secret KEY), so even copying it across did not work. Resolve every
# firefly-namespaced call against the libraries the runbook itself sources.
if [[ "${#SOURCED_LIBS[@]}" -gt 0 ]] && command -v bash >/dev/null 2>&1; then
  # Command position only, inside ```bash fences only. `firefly_wheels` (a UC volume) and
  # `firefly_managed_memory` (a table) are arguments, not calls; prose like
  # `firefly_install_*` is not code at all.
  CALLED=$(python3 - <<'PY'
import re
text = open("BOOTSTRAP.md").read()
NAME = r'(?:firefly_[a-z0-9_]+|store_secret|read_secret|require_secret|' \
       r'assert_bundle_quickstart_ran|check_sync_exclude_rules)'
found = set()
for m in re.finditer(r'^```bash\n(.*?)^```', text, re.S | re.M):
    for raw in m.group(1).splitlines():
        line = re.sub(r'(^|\s)#.*$', '', raw).strip()
        if not line:
            continue
        # start of line, after a separator, or inside $( ... )
        for cm in re.finditer(r'(?:^|[;&|]\s*|\$\(\s*|\bif\s+|\bthen\s+|\belse\s+|!\s*)(' + NAME + r')\b', line):
            found.add(cm.group(1))
print("\n".join(sorted(found)))
PY
)
  MISSING=""
  for fn in $CALLED; do
    bash -c "$(printf 'source %q; ' "${SOURCED_LIBS[@]}") declare -F $fn >/dev/null" 2>/dev/null \
      || MISSING="$MISSING $fn"
  done
  if [[ -z "$MISSING" ]]; then
    pass "every helper BOOTSTRAP.md calls is defined by a library it sources."
  else
    bad "BOOTSTRAP.md calls helpers that no sourced library defines:$MISSING"
    echo "      A reader following the runbook hits 'command not found'. Define them in"
    echo "      scripts/lib/ and source that file from Phase 0a."
  fi
fi

# ── 5b. Runnable blocks must parse under bash AND zsh. ───────────────────────
# The reader pastes these into their own shell. A bash-only construct is a runbook bug,
# not a style issue: ${!key} produced '(eval):1: bad substitution' on a real run.
if command -v zsh >/dev/null 2>&1; then
  BLOCK_ERRS=$(python3 - <<'PY'
import re, subprocess, sys, tempfile, os
text = open("BOOTSTRAP.md").read()
errs = []
for i, m in enumerate(re.finditer(r'^```bash\n(.*?)^```', text, re.S | re.M), 1):
    body = m.group(1)
    line = text[:m.start()].count("\n") + 1
    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as fh:
        fh.write(body); path = fh.name
    for sh in ("bash", "zsh"):
        r = subprocess.run([sh, "-n", path], capture_output=True, text=True)
        if r.returncode != 0:
            errs.append(f"BOOTSTRAP.md:{line} block {i} does not parse under {sh}: "
                        + r.stderr.strip().splitlines()[-1 if r.stderr.strip() else 0])
    os.unlink(path)
print("\n".join(errs))
PY
)
  if [[ -z "$BLOCK_ERRS" ]]; then
    pass "every \`\`\`bash block in BOOTSTRAP.md parses under bash and zsh."
  else
    bad "BOOTSTRAP.md has shell blocks that do not parse:"
    echo "$BLOCK_ERRS" | sed 's/^/      /'
  fi
fi

# ── 5c. No runnable block may be a stub. ─────────────────────────────────────
# Phase 1b's Databricks CLI install and Phase 1e's gh install were both shipped as
# `command -v X || { <comment only> }` / `{ : ; }`. They read as installers and do
# nothing, which is invisible on any machine that already has the tool.
STUBS=$(python3 - <<'PY'
import re
text = open("BOOTSTRAP.md").read()
out = []
for m in re.finditer(r'^```bash\n(.*?)^```', text, re.S | re.M):
    base = text[:m.start()].count("\n") + 1
    # Only command groups. `${#VAR}` / `${VAR}` are parameter expansions, and the
    # bare-brace regex read `${#GUEST_API_SECRET}` as a group whose sole content
    # was the comment `#GUEST_API_SECRET` - flagging correct shell as a stub.
    for bm in re.finditer(r'(?<!\$)\{(.*?)\}', m.group(1), re.S):
        body = bm.group(1)
        stmts = [s.strip() for s in body.splitlines() if s.strip()]
        live = [s for s in stmts if not s.startswith("#") and s not in (":", ": ;", ":;")]
        if stmts and not live:
            out.append(f"BOOTSTRAP.md:{base + body[:1].count(chr(10))} "
                       f"brace block does nothing: {' '.join(stmts)[:70]}")
print("\n".join(out))
PY
)
if [[ -z "$STUBS" ]]; then
  pass "no comment-only / no-op brace blocks in BOOTSTRAP.md."
else
  bad "BOOTSTRAP.md contains brace blocks that only look like they do something:"
  echo "$STUBS" | sed 's/^/      /'
fi

# ── 6. The agent-facing invariant must stay documented. ──────────────────────
# Actions is disabled on this repo, so AGENTS.md / CLAUDE.md are the only controls that
# reach an agent editing the runbook — and an agent (a docs-sync commit) is what caused the
# original regression. Deleting the written rule is precisely how ENV-0 was lost the first
# time, so treat its removal as a failure in its own right.
for doc in AGENTS.md CLAUDE.md; do
  if grep -qE 'ENV-0' "$doc" && grep -qiE 'corepack' "$doc"; then
    pass "$doc documents the ENV-0 / corepack invariant."
  else
    bad "$doc no longer documents the ENV-0 corepack invariant — restore it."
    echo "      Agents load these files automatically; the rule is the only live guard"
    echo "      while GitHub Actions is disabled on this repository."
  fi
done

# ── 7. README and the runbook must not contradict each other. ────────────────
# The README kept its correct "don't use corepack" guidance while the runbook switched to
# requiring corepack, so the repo shipped two opposite instructions for months.
if grep -qE 'npm install -g pnpm' README.md; then
  pass "README.md documents the npm install path for pnpm (agrees with the runbook)."
else
  bad "README.md no longer documents 'npm install -g pnpm' — it may contradict the runbook."
fi

# ── 8. Credential lookups must not be hardcoded to one path in the runbook. ──
# bootstrap.sh has read the Vercel token from $VERCEL_TOKEN first since the comment
# "a single hardcoded path made it a silent 404 or a hard stop for anyone storing auth
# elsewhere" was written — but BOOTSTRAP.md kept the hardcoded auth.json lookup, so the
# fix never reached the readers who follow the doc. ~/Library/.../auth.json only exists
# after an interactive `vercel login`, which makes the doc path fail outright for CI, for
# token-based setups, and for the fresh-install harness.
#
# The lookup now lives in firefly_vercel_context (scripts/lib/runbook.sh) so that
# Phases 8a and 8e cannot disagree. Follow the logic to wherever it lives: the
# runbook satisfies this either by doing it inline or by calling the helper that
# does. What must never happen is auth.json being read with no $VERCEL_TOKEN
# preference anywhere in the chain.
if grep -qE 'V_TOKEN="\$\{VERCEL_TOKEN:-\}"' BOOTSTRAP.md; then
  pass "BOOTSTRAP.md prefers \$VERCEL_TOKEN before the CLI's auth.json."
elif grep -qE 'firefly_vercel_context' BOOTSTRAP.md; then
  if grep -qE 'VERCEL_TOKEN:-' scripts/lib/runbook.sh; then
    pass "BOOTSTRAP.md defers to firefly_vercel_context, which prefers \$VERCEL_TOKEN."
  else
    bad "firefly_vercel_context does not prefer \$VERCEL_TOKEN — the drift moved into the library."
  fi
elif grep -qE 'auth\.json' BOOTSTRAP.md; then
  bad "BOOTSTRAP.md reads auth.json without trying \$VERCEL_TOKEN first — drifted from scripts/bootstrap.sh."
  grep -nE 'auth\.json' BOOTSTRAP.md | sed 's/^/      /'
fi

# ── 9. A write-only secret must not be trusted straight from `vercel env pull`. ──
# Encrypted Vercel vars come back redacted (~11 chars). The runbook stored that
# placeholder as if it were the value, and every guest-login call then failed 401 with
# no indication why. Recovery requires reminting, so the length check is what turns a
# silent 401 into an actionable branch.
if grep -qE 'GUEST_API_SECRET' BOOTSTRAP.md; then
  # Match the comparison, not merely the expansion: the diagnostic `echo` also
  # contains ${#GUEST_API_SECRET}, so a looser pattern passes even when the
  # validation itself has been deleted.
  if grep -qE '\$\{#GUEST_API_SECRET\}[[:space:]]*-ne[[:space:]]*128' BOOTSTRAP.md; then
    pass "BOOTSTRAP.md validates GUEST_API_SECRET's length before using it."
  else
    bad "BOOTSTRAP.md uses GUEST_API_SECRET without checking it is not a redacted placeholder."
  fi
fi

# ── 10. Databricks failures must not be misattributed to this app (#78). ─────
# A workspace IP access list refuses the deployment's egress with a bare 403.
# Building the error from `statusText` alone renders "Databricks API error:
# Forbidden", which reads as an application bug; the explanation is in the
# X-Databricks-Reason-Phrase header both wrappers used to discard.
# Match the actual header READ, not the words. A case-insensitive search for the
# header name also matches the explanatory comment, so the check passed with the
# code reverted — the same false-pass the GUEST_API_SECRET check had.
ATTRIB_MISSING=""
for w in src/lib/databricks-api-wrapper.ts src/lib/databricks-spn-api-wrapper.ts; do
  [[ -f "$w" ]] || continue
  grep -qE 'headers\.get\(["'"'"']x-databricks-reason-phrase["'"'"']\)' "$w" \
    || ATTRIB_MISSING+=" $w"
done
if [[ -z "$ATTRIB_MISSING" ]]; then
  pass "Databricks API wrappers surface X-Databricks-Reason-Phrase (network blocks stay attributable)."
else
  bad "these wrappers drop X-Databricks-Reason-Phrase, so an IP-ACL block reads as an app bug (#78):$ATTRIB_MISSING"
fi

# ── 11. An expired guest link must have a runnable recovery (#79). ───────────
# Links are single-use with a ~10 minute TTL, and Phase 9 mints one ~20 minutes
# into a run, so it is usually dead before a human clicks it. Prose telling the
# reader to "re-run the three POSTs above" is not a recovery path:
# /api/guest/users needs an spnId, which needs a workspace record first.
if [[ -x scripts/new-guest-link.sh ]]; then
  if grep -qE 'new-guest-link\.sh' BOOTSTRAP.md; then
    pass "an expired guest link has a runnable remint, referenced from the runbook."
  else
    bad "scripts/new-guest-link.sh exists but BOOTSTRAP.md never points the reader at it (#79)."
  fi
else
  bad "scripts/new-guest-link.sh is missing or not executable — an expired guest link has no recovery (#79)."
fi

# ── 12. Genie mode and space id must never move independently (#83). ─────────
# agent.py raises ValueError("GENIE_MCP_MODE=space requires GENIE_SPACE_ID"), so
# a bundle that can set the mode without the id fails the app boot rather than
# degrading to workspace-wide Genie. Both must exist as variables, and every command that
# passes one must pass the other.
GENIE_COUPLING_BAD=""
for v in genie_mcp_mode genie_space_id; do
  grep -qE "^[[:space:]]*${v}:" agent/databricks.yml || GENIE_COUPLING_BAD="$GENIE_COUPLING_BAD ${v}(undeclared)"
done
grep -qE 'GENIE_SPACE_ID' agent/databricks.yml || GENIE_COUPLING_BAD="$GENIE_COUPLING_BAD GENIE_SPACE_ID(not-in-app-env)"

# The genie_space_id default must NOT be empty. An empty value makes the bundle
# render `{"name": "GENIE_SPACE_ID"}` with no `value` key, and the Apps API
# refuses the whole deploy: "Must specify environment variable source using
# either value or valueFrom". That broke Phase 4 on the DEFAULT Genie Agent path
# in six of nine E2E runs; each one still looked clean because the agent
# diagnosed it and worked around it, and the app ended up RUNNING either way.
GSID_DEFAULT="$(awk '
  /^[[:space:]]*genie_space_id:/ { found = 1 }
  found && /^[[:space:]]*default:/ {
    sub(/^[[:space:]]*default:[[:space:]]*/, ""); print; exit
  }' agent/databricks.yml | tr -d '[:space:]')"
case "$GSID_DEFAULT" in
  ''|'""'|"''")
    GENIE_COUPLING_BAD="$GENIE_COUPLING_BAD genie_space_id(empty-default-breaks-apps-deploy)" ;;
esac

# Any line setting one --var without the other is the failure mode we care about.
for f in BOOTSTRAP.md scripts/bootstrap.sh README.md; do
  [[ -f "$f" ]] || continue
  while IFS= read -r line; do
    case "$line" in
      *genie_mcp_mode=space*)
        case "$line" in *genie_space_id*) ;; *) GENIE_COUPLING_BAD="$GENIE_COUPLING_BAD $f(mode-without-id)" ;; esac ;;
    esac
  done < <(grep -nE 'genie_mcp_mode=space' "$f" 2>/dev/null)
done

if [[ -z "$GENIE_COUPLING_BAD" ]]; then
  pass "Genie mode and space id are declared together and always passed together."
else
  bad "GENIE_MCP_MODE=space can be set without GENIE_SPACE_ID — the app fails to boot (#83):$GENIE_COUPLING_BAD"
fi

# ── 13. Seeding must be the user's choice, and offered (#83). ────────────────
# The runbook used to forbid seeding while never asking, so "unless the user
# explicitly asks" was unreachable: no Phase 0 input mentioned it. An empty schema
# means Genie answers nothing, so the fix is an ask — not a silent default either way.
SEED_ASK_BAD=""
grep -qE '\*\*\[ASK — REQUIRED, BLOCKING\]\*\* `SEED_SAMPLE_DATA`' BOOTSTRAP.md \
  || SEED_ASK_BAD="$SEED_ASK_BAD BOOTSTRAP.md(no-blocking-ask)"
grep -qE '\*\*\[ASK — REQUIRED, BLOCKING\]\*\* `GENIE_SPACE_IDS`' BOOTSTRAP.md \
  || SEED_ASK_BAD="$SEED_ASK_BAD BOOTSTRAP.md(no-space-ids-ask)"
grep -qE '^ask SEED_SAMPLE_DATA' scripts/bootstrap.sh \
  || SEED_ASK_BAD="$SEED_ASK_BAD bootstrap.sh(no-ask)"
grep -qE '^ask GENIE_SPACE_IDS' scripts/bootstrap.sh \
  || SEED_ASK_BAD="$SEED_ASK_BAD bootstrap.sh(no-space-ids-ask)"
# The old prohibition must be gone: it contradicts the ask it predates.
grep -qE 'Do not auto-create seed tables during bootstrap unless the user explicitly asks' BOOTSTRAP.md \
  && SEED_ASK_BAD="$SEED_ASK_BAD BOOTSTRAP.md(stale-prohibition)"

if [[ -z "$SEED_ASK_BAD" ]]; then
  pass "seeding and Genie space setup are offered as Phase 0 blocking asks, in both surfaces."
else
  bad "seeding is not a real user choice — the runbook and runner disagree (#83):$SEED_ASK_BAD"
fi

# ── 14. Phase 6c must exist in BOTH the runbook and the runner (#83). ────────
# bootstrap.sh had no 6c at all, so the automated path finished "successfully"
# with an empty schema. This is the same drift class as 8 and 9: one surface
# implements a phase and the other only describes it.
SIXC_BAD=""
grep -qE '^## Phase 6c' BOOTSTRAP.md || SIXC_BAD="$SIXC_BAD BOOTSTRAP.md(no-phase)"
grep -qE 'run_phase "6c"' scripts/bootstrap.sh || SIXC_BAD="$SIXC_BAD bootstrap.sh(no-phase)"
[[ -x scripts/genie-data-setup.sh ]] || SIXC_BAD="$SIXC_BAD genie-data-setup.sh(missing-or-not-executable)"
# Both surfaces must call the SAME implementation, or they drift again.
for f in BOOTSTRAP.md scripts/bootstrap.sh; do
  grep -qE 'genie-data-setup\.sh' "$f" || SIXC_BAD="$SIXC_BAD $f(does-not-call-shared-script)"
done

if [[ -z "$SIXC_BAD" ]]; then
  pass "Phase 6c exists in both surfaces and both call scripts/genie-data-setup.sh."
else
  bad "Phase 6c is not implemented consistently — a fresh workspace can finish with no data (#83):$SIXC_BAD"
fi

# ── 16. Point-of-use defaults, not source-time-only defaults. ───────────────
# Two separate bugs, one cause: `: "${VAR:=default}"` runs once when the file is
# sourced, but the variable is READ later, inside a function. A caller that
# exports it empty in between gets the empty value.
#   * INPUTS_DIR empty  -> CA bundle written to /proxy-ca-bundle.pem (5 runs)
#   * FIREFLY_PLACEHOLDER_EXPERIMENT_ID empty -> `grep -q ""` matches every line,
#     so a HEALTHY bundle fails assert_bundle_quickstart_ran (3 runs)
POU_BAD=""
sed -n '/init_inputs_dir()/,/}/p' scripts/lib/corp-network.sh   | grep -q 'INPUTS_DIR="\$HOME/.firefly-bootstrap"'   || POU_BAD="$POU_BAD init_inputs_dir(no-point-of-use-default)"
sed -n '/assert_bundle_quickstart_ran()/,/^}/p' scripts/lib/runbook.sh   | grep -q 'FIREFLY_PLACEHOLDER_EXPERIMENT_ID=123237888438046'   || POU_BAD="$POU_BAD assert_bundle_quickstart_ran(no-point-of-use-default)"
if [[ -z "$POU_BAD" ]]; then
  pass "helpers re-apply defaults at point of use, not only at source time."
else
  bad "defaults that are applied only at source time break when a caller exports them empty:$POU_BAD"
fi

# ── 17. A crashed deploy must not read as success. ──────────────────────────
# Databricks CLI v1.9.0 can panic on `bundle deploy` and still exit 0. Both
# surfaces must assert the app exists rather than trusting the exit code.
DEPLOY_ASSERT_BAD=""
grep -q 'did not create' BOOTSTRAP.md || DEPLOY_ASSERT_BAD="$DEPLOY_ASSERT_BAD BOOTSTRAP.md"
grep -q 'did not create the app' scripts/bootstrap.sh || DEPLOY_ASSERT_BAD="$DEPLOY_ASSERT_BAD bootstrap.sh"
if [[ -z "$DEPLOY_ASSERT_BAD" ]]; then
  pass "Phase 4 asserts the app exists instead of trusting the deploy exit code."
else
  bad "no post-deploy assertion — a panicking CLI that exits 0 reads as success:$DEPLOY_ASSERT_BAD"
fi

# ── 18. Phase 5 must say the preview is missing, not fail opaquely. ─────────
# The most-reported gap across E2E runs (9 of 12).
# The first attempt at this was a PROBE of /api/2.0/memory-stores. That path
# returns "Error: Not Found", which matched none of its patterns, so it reported
# the preview as ENABLED on a workspace where setup then failed. Both surfaces
# must run the operation and classify the failure, and must not reintroduce the
# probe.
MEM_BAD=""
for f in BOOTSTRAP.md scripts/bootstrap.sh; do
  grep -qE 'not enabled\|NotImplemented\|preview' "$f" \
    || MEM_BAD="$MEM_BAD $f(does-not-classify-the-failure)"
  grep -qE 'api get /api/2\.0/memory-stores' "$f" \
    && MEM_BAD="$MEM_BAD $f(broken-probe-is-back)"
done
if [[ -z "$MEM_BAD" ]]; then
  pass "Phase 5 attempts the setup and classifies the failure (no unreliable probe)."
else
  bad "Phase 5 cannot tell a missing preview from a real error:$MEM_BAD"
fi

# ── 19. The SQL grants must be executable, not prose. ───────────────────────
# They were commented-out SQL telling the reader to paste into a warehouse
# session. A backquoted principal cannot survive `--json "..."`, so in practice
# the grants were skipped and Genie could not read the data.
GRANT_BAD=""
grep -qE '^\s*#\s*GRANT (USE|SELECT)' BOOTSTRAP.md   && GRANT_BAD="$GRANT_BAD BOOTSTRAP.md(grants-still-commented-out)"
grep -q 'firefly_sql' BOOTSTRAP.md || GRANT_BAD="$GRANT_BAD BOOTSTRAP.md(no-executed-grants)"
grep -q 'firefly_sql' scripts/bootstrap.sh || GRANT_BAD="$GRANT_BAD bootstrap.sh(no-executed-grants)"
if [[ -z "$GRANT_BAD" ]]; then
  pass "the UC grants are executed via firefly_sql, not left as un-pasteable comments."
else
  bad "the UC grants cannot actually be run as written:$GRANT_BAD"
fi

# ── 20. A failed seed must say WHICH failure it was. ────────────────────────
# One status, "source-unavailable", was reported for four different causes: the
# schema not existing yet, existing but empty, a real permission denial, and a
# warehouse error — with stderr discarded via 2>/dev/null so the server's own
# message was thrown away. On a fresh workspace the cause is almost always a
# race (samples is provisioned asynchronously; Phase 6c probed 40s early on an
# observed run), but it read as a permanent entitlement problem.
SEED_DIAG_BAD=""
grep -qE 'source-not-ready' scripts/genie-data-setup.sh \
  || SEED_DIAG_BAD="$SEED_DIAG_BAD genie-data-setup.sh(no-cause-classification)"
grep -qE 'source-denied' scripts/genie-data-setup.sh \
  || SEED_DIAG_BAD="$SEED_DIAG_BAD genie-data-setup.sh(cannot-report-a-denial)"
grep -qE 'FIREFLY_SEED_SOURCE_WAIT' scripts/genie-data-setup.sh \
  || SEED_DIAG_BAD="$SEED_DIAG_BAD genie-data-setup.sh(no-wait-for-async-samples)"
# The discarded-stderr pattern must not come back on the source probe.
grep -qE 'SHOW TABLES IN .*SRC_SCHEMA.*2>/dev/null' scripts/genie-data-setup.sh \
  && SEED_DIAG_BAD="$SEED_DIAG_BAD genie-data-setup.sh(stderr-discarded-again)"
grep -qE 'source-unavailable' BOOTSTRAP.md \
  && SEED_DIAG_BAD="$SEED_DIAG_BAD BOOTSTRAP.md(still-documents-the-catch-all)"
if [[ -z "$SEED_DIAG_BAD" ]]; then
  pass "a failed seed reports which cause it was, and waits out async samples provisioning."
else
  bad "the seed probe would collapse four causes into one misleading status:$SEED_DIAG_BAD"
fi

# ── 21. No workspace attribution link in the guest panel. ───────────────────
# The panel's audience is GUEST users, who have no Databricks workspace access,
# so a workspace link is dead for every one of them. It also named "Genie Agent"
# while GENIE_MCP_MODE defaults to a space — the wrong backend. Attribution is
# plain text; the link must not come back, and neither must the env var that fed
# it.
ATTRIB_LINK_BAD=""
APP_SRC="agent/patches/e2e-chatbot-app-next"
if [[ -d "$APP_SRC" ]]; then
  grep -rqE 'genieOneUrl|buildGenieOneUrl' "$APP_SRC/client/src" "$APP_SRC/server/src" 2>/dev/null \
    && ATTRIB_LINK_BAD="$ATTRIB_LINK_BAD app(genieOneUrl-is-back)"
  # A bare "/one?o=" means someone rebuilt the workspace-wide link by hand.
  grep -rqE '/one\?o=' "$APP_SRC/client/src" "$APP_SRC/server/src" 2>/dev/null \
    && ATTRIB_LINK_BAD="$ATTRIB_LINK_BAD app(workspace-link-rebuilt)"
fi
# The env var must not be reintroduced as a real setting (prose explaining its
# removal is fine, so only an actual `name:`/export counts).
grep -qE '^\s*(- name: GENIE_ONE_URL|export GENIE_ONE_URL|GENIE_ONE_URL=)' agent/databricks.yml scripts/bootstrap.sh BOOTSTRAP.md 2>/dev/null \
  && ATTRIB_LINK_BAD="$ATTRIB_LINK_BAD GENIE_ONE_URL(set-again)"
if [[ -z "$ATTRIB_LINK_BAD" ]]; then
  pass "the guest panel carries no workspace attribution link (dead for guests, wrong backend)."
else
  bad "a workspace attribution link is back in a guest-facing panel:$ATTRIB_LINK_BAD"
fi

# ── 22. Installers must be able to verify their downloads. ──────────────────
# The astral.sh uv installer checks its download with `sha256sum`, which does not
# exist on macOS 14 or earlier (the tool there is `shasum`). Without a shim it
# prints "skipping sha256 checksum verification" and installs an UNVERIFIED
# binary — the default path on a clean VM, with the message buried in a long
# install. Reported by the E2E agent once the gap prompt asked about detours as
# well as workarounds.
SHA_SHIM_BAD=""
grep -q 'firefly_ensure_sha256sum()' scripts/lib/runbook.sh \
  || SHA_SHIM_BAD="$SHA_SHIM_BAD runbook.sh(no-shim-helper)"
for f in BOOTSTRAP.md scripts/bootstrap.sh; do
  # The shim has to run BEFORE the installer, or it changes nothing.
  python3 - "$f" <<'PYCHK' || SHA_SHIM_BAD="$SHA_SHIM_BAD $f(shim-not-before-uv-install)"
import sys
t = open(sys.argv[1]).read()
shim = t.find('firefly_ensure_sha256sum')
inst = t.find('astral.sh/uv/install.sh')
sys.exit(0 if (shim != -1 and inst != -1 and shim < inst) else 1)
PYCHK
done
if [[ -z "$SHA_SHIM_BAD" ]]; then
  pass "the uv installer can verify its own download (sha256sum shim precedes it)."
else
  bad "uv would install an unverified binary on macOS 14 and earlier:$SHA_SHIM_BAD"
fi

# ── 23. The reported Lakebase must be the one that exists. ──────────────────
# Passing --app-name for an app that already exists makes quickstart bind Lakebase
# from that app and ignore --lakebase-create-new. The requested project is never
# created, Phase 3a still reports PASS, and the summary names a resource that was
# never created. Observed across two passes of one run: created
# firefly-lb-0727083127, reported firefly-lb-0727090103.
LB_TRUTH_BAD=""
grep -q 'firefly_reconcile_lakebase()' scripts/lib/runbook.sh \
  || LB_TRUTH_BAD="$LB_TRUTH_BAD runbook.sh(no-reconcile-helper)"
for f in BOOTSTRAP.md scripts/bootstrap.sh; do
  grep -q 'firefly_reconcile_lakebase' "$f" || LB_TRUTH_BAD="$LB_TRUTH_BAD $f(does-not-reconcile)"
  # The reconcile must run AFTER quickstart, or there is nothing to read.
  python3 - "$f" <<'PYCHK' || LB_TRUTH_BAD="$LB_TRUTH_BAD $f(reconcile-before-quickstart)"
import sys
t = open(sys.argv[1]).read()
qs = t.find('quickstart.py')
rc = t.find('firefly_reconcile_lakebase')
sys.exit(0 if (qs != -1 and rc != -1 and qs < rc) else 1)
PYCHK
done
# The reconciled name must PERSIST. An in-shell export is lost when a resumed run
# re-sources inputs.env, which resurrects the requested-but-never-created name.
grep -q 'firefly_store_input LAKEBASE_NAME' scripts/lib/runbook.sh \
  || LB_TRUTH_BAD="$LB_TRUTH_BAD runbook.sh(reconciled-name-not-persisted)"
# And the create path must not read as though it will provision the name, right up
# until a post-hoc warning. Say it in advance when the app already exists.
for f in BOOTSTRAP.md scripts/bootstrap.sh; do
  grep -q 'firefly_warn_existing_app_wins' "$f" \
    || LB_TRUTH_BAD="$LB_TRUTH_BAD $f(no-advance-warning)"
done
if [[ -z "$LB_TRUTH_BAD" ]]; then
  pass "the reported Lakebase name is reconciled, persisted, and pre-announced."
else
  bad "the summary could name a Lakebase project that was never created:$LB_TRUTH_BAD"
fi

# ── 24. A tool must not advertise the version the pin forbids. ──────────────
# pnpm prints "Update available! 10.34.5 -> 12.0.0-alpha.16" — the exact alpha the
# pin exists to avoid, because it ignores onlyBuiltDependencies and fails with
# ERR_PNPM_IGNORED_BUILDS. A reader who follows the tool's own advice breaks the
# build, so the banner is suppressed and the runbook says to ignore it if it slips
# through.
PIN_ADVERT_BAD=""
grep -q 'NPM_CONFIG_UPDATE_NOTIFIER' scripts/lib/corp-network.sh \
  || PIN_ADVERT_BAD="$PIN_ADVERT_BAD corp-network.sh(notifier-not-suppressed)"
grep -qE 'Update available|IGNORE IT' BOOTSTRAP.md \
  || PIN_ADVERT_BAD="$PIN_ADVERT_BAD BOOTSTRAP.md(banner-not-documented)"
if [[ -z "$PIN_ADVERT_BAD" ]]; then
  pass "pnpm's update banner cannot lead a reader onto the version the pin forbids."
else
  bad "a tool advertises the one version that breaks the build:$PIN_ADVERT_BAD"
fi

# ── 25. Recurring harmless noise must be documented where it appears. ───────
# The Vercel CLI prints `Error: Failed to get package info ... dist-tags` on nearly
# every command behind a corp proxy. It is its own update check, it exits 0, and
# the command succeeds — but it is on stderr, prefixed "Error:", and printed before
# the real output, so it reads like an auth/install failure. SEVEN separate E2E
# agents flagged it, each rediscovering it, because the runbook never mentioned it.
# "Accepted" in a triage registry is not the same as telling the reader.
NOISE_DOC_BAD=""
grep -q 'dist-tags' BOOTSTRAP.md \
  || NOISE_DOC_BAD="$NOISE_DOC_BAD BOOTSTRAP.md(noise-undocumented)"
if [[ -z "$NOISE_DOC_BAD" ]]; then
  pass "the recurring vercel 'Error:' line is documented as harmless where it appears."
else
  bad "output that reads like a failure but is not is left unexplained:$NOISE_DOC_BAD"
fi

# ── 26. No command may run before the tool it needs is installed. ───────────
# I added an IP-allowlist check to Phase 0 so it would be seen early, and it called
# `databricks` — which Phase 1b installs. It could not run as written; the E2E agent
# had to defer it. Early placement is worthless if the step cannot execute there.
ORDER_BAD=""
python3 - <<'PYCHK' || ORDER_BAD="$ORDER_BAD BOOTSTRAP.md(databricks-used-before-install)"
import re, sys
t = open('BOOTSTRAP.md').read()
install = t.find('firefly_install_databricks_cli')
if install == -1:
    sys.exit(0)                        # nothing to order against
# Any `databricks ...` invocation inside a bash block before the install is a bug.
for m in re.finditer(r'^\s*databricks\s+\S', t[:install], re.M):
    sys.exit(1)
sys.exit(0)
PYCHK
if [[ -z "$ORDER_BAD" ]]; then
  pass "no runbook step invokes the databricks CLI before Phase 1b installs it."
else
  bad "a step runs before the tool that runs it exists:$ORDER_BAD"
fi

# ── 27. Never pipe a discarded-stderr call into a parser. ───────────────────
# Written three separate times today, and each time the failure mode was the same:
# `cmd 2>/dev/null | python3 -c "json.load(...)"` turns ANY failure — endpoint 404,
# expired auth, tool not installed — into `JSONDecodeError: Expecting value`, which
# reads like a bad API response and hides the real cause. The seed probe had it, the
# Phase 5 preflight had it, and the IP-allowlist check had it.
#
# Two shapes evaded the first version of this check, and the second one shipped a
# false all-clear on the IP allowlist:
#
#   1. Assignment, then parse on a LATER line:
#        ACL=$(databricks api get ... 2>/dev/null)
#        ENABLED=$(printf '%s' "$ACL" | python3 -c "...json.load...")
#      The discard and the parser are separate statements, so a same-line regex
#      never sees them together.
#
#   2. An `except` that swallows instead of speaking:
#        except Exception: raise SystemExit
#      This satisfies "has a guard" while printing NOTHING — and the caller read
#      that empty string as "no allowlist is enabled" and printed
#      "ok: ... the app can reach it". A handler that exits silently is not a
#      guard; it manufactures a confident wrong answer.
PIPE_BLIND_BAD="$(python3 - <<'PYCHK'
import re
t = open('BOOTSTRAP.md').read()
bad = []

def guarded(seg):
    """A parser is guarded only if every failure path SAYS something."""
    if 'json.load' not in seg:
        return True
    for h in re.finditer(r'except[^\n:]*:\s*([^\n]*)\n((?:[ \t]+[^\n]*\n)*)', seg):
        body = (h.group(1) + ' ' + h.group(2)).strip()
        if not body:
            return False
        # Swallowing silently is as misleading as crashing: no print, no raise
        # of anything a human reads.
        if not re.search(r'print|sys\.stderr|write|echo', body):
            # An empty fallback is legitimate when it feeds a self-correcting
            # ACTION (create the missing thing, omit an optional flag) rather
            # than a CLAIM about state. That difference is not mechanically
            # detectable, so it must be declared and reviewed: mark the handler
            # `# SAFE-EMPTY: <why>`. Undeclared silence stays a failure — that
            # is precisely how "ok: no enabled IP allowlist" got printed for a
            # check that never ran.
            if 'SAFE-EMPTY' not in body:
                return False
    return bool(re.search(r'except|if not raw', seg))

# Shape 1: discarded stderr piped straight into a parser.
for m in re.finditer(r'2>/dev/null[^\n]*\\?\n?[^\n]*\|[^\n]*python3[^\n]*', t):
    seg = t[m.start():m.start() + 400]
    if 'json.load' in seg and not guarded(seg):
        bad.append('inline:' + m.group(0)[:52].replace('\n', ' '))

# Shape 2: stderr discarded into a variable that a parser later reads.
for m in re.finditer(r'(\w+)=\$\([^\n]*2>/dev/null\s*\)', t):
    var, tail = m.group(1), t[m.end():m.end() + 900]
    use = re.search(r'\$(?:\{)?' + re.escape(var) + r'\}?[^\n]*\|[^\n]*python3', tail)
    if use and not guarded(tail[use.start():use.start() + 500]):
        bad.append('via-$' + var)

# Shape 3: any silent swallow, wherever it lives.
for m in re.finditer(r'except[^\n:]*:\s*(?:raise SystemExit|pass|sys\.exit\(\))\s*\n', t):
    bad.append('silent-swallow:' + t[m.start():m.start() + 34].replace('\n', ' '))

print(' '.join(sorted(set(bad))))
PYCHK
)"
if [[ -z "$PIPE_BLIND_BAD" ]]; then
  pass "no runbook step pipes a discarded-stderr call into an unguarded parser."
else
  bad "a parser will report JSONDecodeError instead of the real cause:$PIPE_BLIND_BAD"
fi

# ── 15. The runner itself must parse, under bash AND zsh. ────────────────────
# Invariant 5 checks every ```bash block in BOOTSTRAP.md and sources the shared
# libs, but nothing ever ran `bash -n` on scripts/bootstrap.sh. A stray edit left
# an unterminated `if` in Phase 3c and this suite still printed "All runbook
# invariants hold" — the runner is the one file guaranteed to be executed, and it
# was the one file not being checked.
SHELL_PARSE_BAD=""
for f in scripts/bootstrap.sh scripts/genie-data-setup.sh scripts/new-guest-link.sh; do
  [[ -f "$f" ]] || continue
  bash -n "$f" 2>/dev/null || SHELL_PARSE_BAD="$SHELL_PARSE_BAD $f(bash)"
  command -v zsh >/dev/null 2>&1 && { zsh -n "$f" 2>/dev/null || SHELL_PARSE_BAD="$SHELL_PARSE_BAD $f(zsh)"; }
done
if [[ -z "$SHELL_PARSE_BAD" ]]; then
  pass "bootstrap.sh and the helper scripts parse under bash and zsh."
else
  bad "these scripts do not parse — the runner would die at that line:$SHELL_PARSE_BAD"
fi

# ── 28. Phase 0a's confirmation command must list every var the bridge sets ───
# The bridge exported CURL_CA_BUNDLE and REQUESTS_CA_BUNDLE, and Phase 9's smoke
# tests depend on CURL_CA_BUNDLE, but the documented `env | grep` omitted both --
# so a reader following the runbook could not verify the trust var the later phases
# rely on. Derive the expected set from the bridge itself rather than restating it
# here, so adding an export cannot silently outrun the confirmation step.
CONFIRM_MISSING="$(python3 - <<'PYCHK'
import re
bridge = open('scripts/lib/corp-network.sh').read()
names = ('UV_DEFAULT_INDEX', 'UV_SYSTEM_CERTS', 'PIP_INDEX_URL',
         'COREPACK_NPM_REGISTRY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE',
         'CURL_CA_BUNDLE', 'REQUESTS_CA_BUNDLE')
want = [n for n in names if re.search(r'\b' + n + r'\b', bridge)]
# Every line of the runbook that documents an `env | grep` confirmation.
confirm = [l for l in open('BOOTSTRAP.md') if 'env |' in l and 'grep' in l]
blob = ' '.join(confirm)
print(' '.join(n for n in want if n not in blob))
PYCHK
)"
if [[ -z "$CONFIRM_MISSING" ]]; then
  pass "Phase 0a's confirmation lists every proxy/CA var the bridge sets."
else
  bad "the bridge sets vars Phase 0a's confirmation cannot show:$CONFIRM_MISSING"
fi

# ── 29. What Phase 0 CLAIMS the sourced helpers do, they must actually do ──────
# BOOTSTRAP.md said $HOME/bin and $HOME/.local/bin "are added to PATH in Phase 0",
# and Phase 0a promised that re-sourcing the helpers restores a fresh shell. Both
# were false: firefly_bridge_corp_network only mkdir'd the dirs and the export lived
# in scripts/bootstrap.sh, which a reader following the runbook by hand never runs.
# After Phase 1, databricks and uv were not findable and the reader had to invent an
# export. A claim that only holds for the RUNNER is a defect for every human reader,
# so prove it against the sourced helper -- in a fresh shell, the way a reader gets it.
PATH_CLAIM_BAD=""
if grep -qE 'added to .?PATH.? in Phase 0' BOOTSTRAP.md; then
  for d in bin .local/bin; do
    env -i HOME="$HOME" PATH="/usr/bin:/bin" bash -c "
      cd '$PWD'
      source scripts/lib/corp-network.sh >/dev/null 2>&1 || exit 1
      FIREFLY_TRUST_PROXY_CA=1 firefly_bridge_corp_network >/dev/null 2>&1
      case \":\$PATH:\" in *\":\$HOME/$d:\"*) exit 0 ;; *) exit 1 ;; esac
    " || PATH_CLAIM_BAD="$PATH_CLAIM_BAD \$HOME/$d"
  done
fi
if [[ -z "$PATH_CLAIM_BAD" ]]; then
  pass "the dirs Phase 0 claims to put on PATH are on PATH after sourcing the helpers."
else
  bad "BOOTSTRAP.md claims Phase 0 adds these to PATH, but sourcing the helpers does not:$PATH_CLAIM_BAD"
fi

# ── 30. quickstart's first-run "does not exist or is deleted" must be pre-empted ─
# With --app-name, quickstart.py answers a not-yet-created app with
#   Could not fetch app details: App with name '...' does not exist or is deleted
# and suggests `databricks bundle deployment bind` / `bundle deploy`. That is the
# normal first-run state -- Phase 4 creates the app -- but it reads as a recovery
# path for an app someone deleted, and a run reported chasing it. Technically
# accurate output that points at the wrong problem costs the same as an error.
FIRSTRUN_BAD=""
grep -q 'does not exist or is deleted' scripts/lib/runbook.sh \
  || FIRSTRUN_BAD="$FIRSTRUN_BAD runbook.sh(no-preempt)"
grep -q 'does not exist or is deleted' BOOTSTRAP.md \
  || FIRSTRUN_BAD="$FIRSTRUN_BAD BOOTSTRAP.md(undocumented)"
# The pre-empt is worthless if it only fires when the app EXISTS.
sed -n '/^firefly_warn_existing_app_wins()/,/^}/p' scripts/lib/runbook.sh | grep -q 'else' \
  || FIRSTRUN_BAD="$FIRSTRUN_BAD warn_existing_app_wins(no-absent-branch)"
# quickstart prints the bind suggestion on BOTH paths. Defusing only one of them leaves
# it reading as an actionable next step on the other, which is what a run reported after
# the absent-case fix shipped. Require both halves of the function to mention it.
BIND_HALVES="$(sed -n '/^firefly_warn_existing_app_wins()/,/^}/p' scripts/lib/runbook.sh \
  | awk 'BEGIN{half=0}
         /^[[:space:]]*#/ {next}                      # a comment defuses nothing
         /else/{half=1}
         /deployment bind/ && /note|warn|echo/ {print half}' | sort -u | tr -d '\n')"
[[ "$BIND_HALVES" == "01" ]] \
  || FIRSTRUN_BAD="$FIRSTRUN_BAD warn_existing_app_wins(bind-not-defused-on-both-paths)"
if [[ -z "$FIRSTRUN_BAD" ]]; then
  pass "quickstart's first-run 'does not exist or is deleted' noise is pre-empted."
else
  bad "a first run will chase quickstart's bind suggestion:$FIRSTRUN_BAD"
fi

# ── 31. Helpers must reach their own error reporting under `set -e` ────────────
# firefly_ip_allowlist_status did `raw="$(databricks api get ...)"`. On a tier without
# the IP-allowlist feature the CLI exits 1, and an assignment from a failing command
# substitution ABORTS the shell under errexit in both bash and zsh. So the branch
# written to handle that tier gracefully instead killed Phase 1b and Phase 9 on exactly
# the workspaces that reach it -- worse than the wrong "ok" it replaced. firefly_sql had
# the same shape, with an `rc=$?` check immediately after that errexit never reached.
#
# Assert the DIAGNOSTIC, not merely that the shell survived: calling the helper as
# `fn || true` suppresses errexit for the whole function body, so a survival check
# passes even when the helper is broken. That was the first version of this invariant
# and it could never fail. What matters is that the helper still SPEAKS when its own
# CLI fails, so require the words it promises to emit.
ERREXIT_BAD=""
for _sh in bash zsh; do
  # firefly_ip_allowlist_status must classify, not die.
  _out="$("$_sh" -c "
    set -e
    cd '$PWD'
    source scripts/lib/runbook.sh >/dev/null 2>&1
    databricks() { echo 'Error: IP access list is not available in the pricing tier' >&2; return 1; }
    firefly_ip_allowlist_status myprof
  " 2>/dev/null)"
  case "$_out" in
    unavailable:*|unknown:*|none|enabled:*) ;;
    *) ERREXIT_BAD="$ERREXIT_BAD $_sh:firefly_ip_allowlist_status(silent)" ;;
  esac

  # firefly_sql must print its submit-failed diagnostic, not vanish.
  _out="$("$_sh" -c "
    set -e
    cd '$PWD'
    source scripts/lib/runbook.sh >/dev/null 2>&1
    databricks() { echo 'Error: warehouse not found' >&2; return 1; }
    firefly_sql 'SELECT 1' myprof mywh
  " 2>&1 || true)"
  case "$_out" in
    *"statement submit failed"*) ;;
    *) ERREXIT_BAD="$ERREXIT_BAD $_sh:firefly_sql(silent)" ;;
  esac
done
if [[ -z "$ERREXIT_BAD" ]]; then
  pass "helpers still report their own CLI failure under set -e (bash and zsh)."
else
  bad "these helpers die before reporting, under set -e:$ERREXIT_BAD"
fi

# ── 32. The app must be DEPLOYED in its final Genie mode, not corrected afterwards ──
# This used to assert that Phase 6c's redeploy waited for Phase 4's deployment to settle,
# because the app was deployed workspace-wide (no space existed yet) and redeployed into
# space mode later. That race is gone -- along with the redeploy -- now that Phase 3f
# creates the space BEFORE Phase 4. Retiring the old check rather than leaving it in place
# matters: it searched for the literal `genie_mcp_mode=space`, which no longer appears, so
# it had started passing vacuously. A check that cannot fail still reports success.
#
# What must hold now: the first deploy carries both Genie vars, and nothing redeploys to
# fix the mode afterwards.
DEPLOY_MODE_BAD=""
for f in BOOTSTRAP.md scripts/bootstrap.sh; do
  # The deploy that Phase 4 performs must pass both vars together.
  python3 - "$f" <<'PYCHK' || DEPLOY_MODE_BAD="$DEPLOY_MODE_BAD $(basename "$f")(deploy-lacks-genie-vars)"
import re, sys
t = open(sys.argv[1]).read()
# Any bundle deploy line, plus the ~600 chars before it (where BUNDLE_VARS is built).
for m in re.finditer(r'bundle deploy', t):
    seg = t[max(0, m.start() - 800):m.end() + 200]
    if 'genie_mcp_mode' in seg and 'genie_space_id' in seg:
        sys.exit(0)
sys.exit(1)
PYCHK
  # And no bundle deploy may appear at or after Phase 6 -- that late deploy IS the
  # correction this reordering removed. Matching the WORD "redeploy" flagged prose that
  # denies one ("There is no redeploy here"), which is the third time a check here has been
  # decided by documentation instead of by what executes.
  python3 - "$f" <<'PYCHK' || DEPLOY_MODE_BAD="$DEPLOY_MODE_BAD $(basename "$f")(late-deploy-corrects-mode)"
import re, sys
t = open(sys.argv[1]).read()
m = re.search(r'(##|header ")\s*"?Phase 6', t)
if not m:
    sys.exit(0)
tail = t[m.start():]
# A deploy command, not the word. Comment/prose lines are excluded.
for line in tail.split('\n'):
    stripped = line.strip()
    if stripped.startswith('#') or stripped.startswith('>'):
        continue
    if 'bundle deploy' in stripped:
        sys.exit(1)
sys.exit(0)
PYCHK
done
if [[ -z "$DEPLOY_MODE_BAD" ]]; then
  pass "the app is deployed in its final Genie mode; nothing redeploys to correct it."
else
  bad "the app can still be born in the wrong Genie mode:$DEPLOY_MODE_BAD"
fi

# ── 33. Value-returning helpers must keep stdout clean ────────────────────────
# Callers use these as VALUE="$(fn ...)". warn/note/ok all echo to STDOUT, so any
# diagnostic emitted through them is captured INTO the value. genie-data-setup.sh
# shipped that defect once (progress folded into its key=value output), and
# read_secret nearly shipped it again with a duplicate-key warning.
STDOUT_BAD=""
# REPO_DIR, not FIREFLY_STATE_DIR: init_state_dir derives STATE_FILE from
# ${1:-${REPO_DIR:-$PWD}} and overwrites it unconditionally, so the first version of
# this check wrote its K=first/K=second probe lines straight into the repo's real
# .firefly-bootstrap/state.env -- every invocation of this suite mutating the operator's
# own state. A test must not write where the thing it tests writes.
_out="$(bash -c "
  export REPO_DIR=\$(mktemp -d)
  cd '$PWD'
  source scripts/lib/corp-network.sh >/dev/null 2>&1
  source scripts/lib/runbook.sh      >/dev/null 2>&1
  init_state_dir \"\$REPO_DIR\" >/dev/null 2>&1
  # Two assignments: whatever the helper wants to say about that must go to stderr.
  printf 'export K=first\nexport K=second\n' >> \"\$STATE_FILE\"
  read_secret K 2>/dev/null
  rm -rf \"\$REPO_DIR\"
" 2>/dev/null)"
case "$_out" in
  second) ;;
  *) STDOUT_BAD="$STDOUT_BAD read_secret(stdout=$(printf '%s' "$_out" | tr '\n' '/' | cut -c1-40))" ;;
esac
if [[ -z "$STDOUT_BAD" ]]; then
  pass "value-returning helpers keep diagnostics off stdout."
else
  bad "a diagnostic is being captured as part of the value:$STDOUT_BAD"
fi

# ── 34. firefly_store_inputs must cover every [ASK] key, and dodge ${!k} ───────
# The runbook only ever said bootstrap.sh saves answers to inputs.env and showed a
# reader nothing, so an agent invented the loop -- reaching for `${!k}`, bash-only
# indirect expansion, which is `bad substitution` under zsh, macOS's default shell.
# The same hazard was already documented on read_secret, so leaving the safe form
# unwritten is what let it recur. Two things must hold: the helper's default list
# covers every [ASK] row, and nothing here teaches ${!k}.
ASK_DRIFT="$(python3 - <<'PYCHK'
import re
doc = open('BOOTSTRAP.md').read()
lib = open('scripts/lib/runbook.sh').read()
asked = re.findall(r'\*\*\[ASK[^\]]*\]\*\* `([A-Z_][A-Z0-9_]*)`', doc)
m = re.search(r'firefly_store_inputs\(\)\s*\{(.*?)\n\}', lib, re.S)
covered = set(re.findall(r'\b([A-Z_][A-Z0-9_]{2,})\b', m.group(1))) if m else set()
print(' '.join(sorted(set(asked) - covered)))
PYCHK
)"
INDIRECT_TAUGHT=""
# A ${!k} that is not immediately called out as the thing NOT to do.
python3 - <<'PYCHK' || INDIRECT_TAUGHT="BOOTSTRAP.md(teaches-\${!k})"
import re, sys
t = open('BOOTSTRAP.md').read()
for m in re.finditer(r'\$\{!\w+\}', t):
    window = t[m.start():m.start() + 400]
    if not re.search(r'bash-only|Do \*\*not\*\*|bad substitution', window):
        sys.exit(1)
sys.exit(0)
PYCHK
if [[ -z "$ASK_DRIFT$INDIRECT_TAUGHT" ]]; then
  pass "firefly_store_inputs covers every [ASK] key and no phase teaches \${!k}."
else
  bad "headless Phase 0 persistence is incomplete:${ASK_DRIFT:+ uncovered:$ASK_DRIFT}$INDIRECT_TAUGHT"
fi

# ── 35. A Genie space must not be abandoned on one failed read ─────────────────
# Phase 6c created a space, round-tripped 16 tables through it and granted CAN_RUN --
# then a single GET failed, printed "not readable - staying on workspace-wide Genie", cleared
# GENIE_SPACE_ID and shipped the app on Genie Agent, which guest users cannot use. The
# same GET succeeded minutes later. Reads after a create are eventually consistent, so
# one failure means "not yet", not "not there", and `2>/dev/null` meant the only thing
# it could ever report was "not readable" whatever actually went wrong.
SPACE_READ_BAD=""
grep -q 'space_readable()' scripts/genie-data-setup.sh \
  || SPACE_READ_BAD="$SPACE_READ_BAD no-retry-helper"
# The decision points must use it rather than a bare single GET.
if grep -nE 'if get_space "\$[A-Za-z_]+" \| grep -q' scripts/genie-data-setup.sh >/dev/null 2>&1; then
  SPACE_READ_BAD="$SPACE_READ_BAD single-GET-decides"
fi
# It has to actually loop, and it has to keep stderr, or it is the old check renamed.
sed -n '/^space_readable()/,/^}/p' scripts/genie-data-setup.sh | grep -q 'while' \
  || SPACE_READ_BAD="$SPACE_READ_BAD helper-does-not-retry"
sed -n '/^space_readable()/,/^}/p' scripts/genie-data-setup.sh | grep -q '2>&1' \
  || SPACE_READ_BAD="$SPACE_READ_BAD helper-discards-stderr"
# Falling back to workspace-wide Genie costs the guest experience, so it must name the space and
# where it came from -- not just say "not readable".
grep -q 'abandoning space' scripts/genie-data-setup.sh \
  || SPACE_READ_BAD="$SPACE_READ_BAD fallback-not-explained"
if [[ -z "$SPACE_READ_BAD" ]]; then
  pass "a Genie space survives a transient read failure instead of falling back to workspace-wide Genie."
else
  bad "Phase 6c can discard a space it just created:$SPACE_READ_BAD"
fi

# ── 36. Phase 6 must not depend on a shell that may be gone ────────────────────
# Phases 6, 6b and 6c read WAREHOUSE_ID, SP_CLIENT_ID, GUEST_SP_CLIENT_ID,
# GENIE_MCP_MODE and GENIE_SPACE_ID straight from the shell. A second pass in a fresh
# terminal lost them, and not one resulting error named the empty variable:
#   WAREHOUSE_ID=""       -> "No API found for 'PATCH /permissions/warehouses/'"
#   GUEST_SP_CLIENT_ID="" -> "Principal: ServicePrincipalName() does not exist"
#   GENIE_MCP_MODE=""     -> the space-mode gate silently skipped, and the app never
#                            received genie_space_id at all
# The silent skip is the worst of the three: nothing failed, so nothing was investigated.
PHASE6_BAD=""
grep -q 'firefly_restore_phase6_context()' scripts/lib/runbook.sh \
  || PHASE6_BAD="$PHASE6_BAD no-restore-helper"
grep -q 'firefly_require()' scripts/lib/runbook.sh \
  || PHASE6_BAD="$PHASE6_BAD no-require-helper"
# Presence is not enough: BOOTSTRAP.md has several call sites, so requiring merely one
# passed even with a phase boundary left unguarded. Each place that CONSUMES the vars
# must have a restore ahead of it -- the same positional requirement as invariant 32.
PHASE6_POS="$(python3 - <<'PYCHK'
import re

# Derive the consumers rather than listing them. The first version named two -- the
# warehouse PATCH and the space-mode gate -- and Phase 6's FIRST command is neither: it
# is the catalog PATCH, which read an empty $SP_CLIENT_ID and got back "UpdatePermissions
# Missing required field: principal". A hand-picked list of consumers has exactly the
# blind spot of whichever one nobody thought of, which is the bug it was meant to catch.
VARS = ('SP_CLIENT_ID', 'WAREHOUSE_ID', 'GUEST_SP_CLIENT_ID',
        'GENIE_MCP_MODE', 'GENIE_SPACE_ID')

t = open('BOOTSTRAP.md').read()
# Phase 6 onward; earlier phases legitimately establish these values.
start = t.find('## Phase 6')
body = t[start:] if start != -1 else t

bad = []
for var in VARS:
    for m in re.finditer(r'\$\{?' + var + r'\b', body):
        line_start = body.rfind('\n', 0, m.start()) + 1
        line = body[line_start:body.find('\n', m.start())]
        # Skip comments, the helper's own definition/mention, and assignments.
        if re.match(r'\s*#', line) or 'restore_phase6_context' in line or 'firefly_require' in line:
            continue
        if re.search(r'\b' + var + r'=(?!=)', line) or ':=' in line:
            continue
        # Only calls that actually leave the machine can misattribute the cause -- but
        # judge the LOGICAL command, not the physical line. $SP_CLIENT_ID appears on the
        # `--json` continuation of a multi-line `databricks api patch`, so a per-line
        # filter skipped the very call that shipped this bug.
        cmd_start = line_start
        while cmd_start > 0:
            prev_end = body.rfind('\n', 0, cmd_start - 1)
            prev = body[prev_end + 1:cmd_start - 1]
            if prev.rstrip().endswith('\\'):
                cmd_start = prev_end + 1
            else:
                break
        logical = body[cmd_start:body.find('\n', m.start())]
        if not re.search(r'databricks |curl |firefly_sql', logical):
            continue
        before = body[:m.start()]
        if 'firefly_restore_phase6_context' not in before:
            ln = t[:start + m.start()].count('\n') + 1
            bad.append(f'{var}@{ln}')
            break
print(' '.join(bad))
PYCHK
)"
[[ -n "$PHASE6_POS" ]] && PHASE6_BAD="$PHASE6_BAD $PHASE6_POS"
grep -q 'firefly_restore_phase6_context' scripts/bootstrap.sh \
  || PHASE6_BAD="$PHASE6_BAD bootstrap.sh(no-restore)"
grep -q 'firefly_require WAREHOUSE_ID' BOOTSTRAP.md \
  || PHASE6_BAD="$PHASE6_BAD BOOTSTRAP.md(no-assert)"
# The space-mode gate must have an else that SAYS something.
python3 - <<'PYCHK' || PHASE6_BAD="$PHASE6_BAD space-gate-silent"
import re, sys
for path in ('BOOTSTRAP.md', 'scripts/bootstrap.sh'):
    t = open(path).read()
    # Anchor on the GATE, not on the first mention of the variable.
    #
    # The previous version searched from the first occurrence of GENIE_MCP_MODE, asked
    # whether a gate appeared within 2000 chars, then looked for speech within 900 -- two
    # spans that need not overlap. It duly landed on Phase 3f's firefly_store_input, found
    # Phase 4's gate far downstream, and judged Phase 3f's neighbourhood for speech. Correct
    # code failed. Find each gate and inspect that gate's own body.
    gates = list(re.finditer(r'(?:if|elif)[^\n]*GENIE_MCP_MODE[^\n]*(?:=|!=)\s*.?space.?', t))
    if not gates:
        sys.exit(0)                    # nothing gating on the mode here
    # EVERY gate must speak, not merely one of them. Requiring "some gate speaks" let a
    # silenced gate hide behind a talkative one -- verified by silencing Phase 6c's and
    # watching this pass because Phase 4's was still loud.
    for g in gates:
        body = t[g.end():g.end() + 800]
        if not re.search(r'(warn|note|echo|fail)\s', body):
            sys.exit(1)
sys.exit(0)
PYCHK
if [[ -z "$PHASE6_BAD" ]]; then
  pass "Phase 6 restores its context, asserts before use, and never skips in silence."
else
  bad "Phase 6 breaks when the shell is fresh:$PHASE6_BAD"
fi

# ── 37. The guest-grant answer must be asked everywhere and honoured exactly ───
# GRANT_GUEST_SPACE_ACCESS used to be asked only when the operator SUPPLIED space ids,
# and defaulted to no -- so on the common path, where bootstrap creates the space, the
# guest SP got nothing and guest users could not query the space the app was pointed at.
#
# The first fix forced the grant for a bootstrap-created space. That was worse in a
# different way: Phase 0 presents this as a controlling input, so overriding it made the
# ask a lie, and two runs reported exactly that. The answer is now put on every path,
# defaults to yes so the guest flow works without anyone having to know, and is honoured
# as given -- with the cost of `no` stated where it takes effect.
GUEST_GRANT_BAD=""
grep -qE 'ask this on every path' BOOTSTRAP.md \
  || GUEST_GRANT_BAD="$GUEST_GRANT_BAD ask-still-conditional"
grep -qE 'GRANT_GUEST_SPACE_ACCESS:-no\b' BOOTSTRAP.md scripts/bootstrap.sh \
  && GUEST_GRANT_BAD="$GUEST_GRANT_BAD default-still-no"
# The override must be gone: no forcing of the grant based on who owns the space.
grep -q 'GUEST_GRANT_WANTED' scripts/genie-data-setup.sh \
  && GUEST_GRANT_BAD="$GUEST_GRANT_BAD answer-overridden"
grep -qE 'regardless of --grant-guest' scripts/genie-data-setup.sh \
  && GUEST_GRANT_BAD="$GUEST_GRANT_BAD answer-overridden-msg"
# And `no` must state what it costs, not pass in silence.
grep -q 'unable to ask' scripts/genie-data-setup.sh \
  || GUEST_GRANT_BAD="$GUEST_GRANT_BAD cost-of-no-not-stated"
if [[ -z "$GUEST_GRANT_BAD" ]]; then
  pass "the guest-grant answer is asked on every path, honoured exactly, and its cost stated."
else
  bad "the guest-grant ask does not match what happens:$GUEST_GRANT_BAD"
fi

# ── 38. State must not depend on cwd, and an empty write must not erase a value ─
# Two failures with one shape, both costing real time on a live run:
#   * init_state_dir fell back to $PWD, so a phase run from anywhere but the repo read a
#     DIFFERENT state.env. Phase 9 concluded GUEST_API_SECRET was "0 chars" and spent
#     three minutes reminting and redeploying a secret that was already stored.
#   * Phase 8d does store_secret PREVIEW_URL "$APP_ORIGIN"; in a fresh shell APP_ORIGIN
#     was unset, so a good value was overwritten with "" and Phase 9's curls returned
#     HTTP 000 with nothing to explain it.
STATE_BAD=""
# REPO_DIR must be recovered from inputs.env before any $PWD fallback.
python3 - <<'PYCHK' || STATE_BAD="$STATE_BAD cwd-dependent-state"
import re, sys
t = open('scripts/lib/runbook.sh').read()
m = re.search(r'init_state_dir\(\)\s*\{(.*?)\n\}', t, re.S)
if not m:
    sys.exit(1)
# Strip comments before looking: the explanatory comment above this function mentions
# $PWD, and matching that made the check fail against correct code. Twice now a check
# here has been satisfied or broken by prose rather than by what executes.
body = '\n'.join(re.sub(r'#.*$', '', ln) for ln in m.group(1).split('\n'))
# The recovery has to come before the PWD fallback, or it never runs.
i_rec = body.find('inputs.env')
i_pwd = body.find('$PWD')
sys.exit(0 if (i_rec != -1 and i_pwd != -1 and i_rec < i_pwd) else 1)
PYCHK
sed -n '/^store_secret()/,/^}/p' scripts/lib/runbook.sh | grep -q 'refusing to overwrite' \
  || STATE_BAD="$STATE_BAD empty-write-erases"
# And the phase that hit it must recover rather than trust the shell.
grep -q 'APP_ORIGIN:=$(read_secret APP_ORIGIN' BOOTSTRAP.md \
  || STATE_BAD="$STATE_BAD phase8d-trusts-shell"
grep -q 'is NOT a domain mismatch' BOOTSTRAP.md \
  || STATE_BAD="$STATE_BAD phase8e-blames-domain"
if [[ -z "$STATE_BAD" ]]; then
  pass "state resolves independently of cwd, and an empty write cannot erase a value."
else
  bad "a lost shell variable can still destroy or misreport state:$STATE_BAD"
fi

# ── 39. A re-store must recover the value first, or it saves nothing ───────────
# Phase 8d ends with store_secret GUEST_API_SECRET "$GUEST_API_SECRET", re-storing a
# value minted back in 8b. After a shell boundary the variable is empty, so the line
# passes nothing. The empty-write guard (invariant 38) keeps the stored value, so no data
# is lost -- but the call is then a save that saves nothing, and APP_ORIGIN two lines
# above already recovered itself first. The asymmetry was the defect, and three keys had
# it. A store right after a mint is fine; only a RE-store needs the recovery.
RESTORE_BAD="$(python3 - <<'PYCHK'
import re
t = open('BOOTSTRAP.md').read()
bad = []
for m in re.finditer(r'store_secret\s+([A-Z_][A-Z0-9_]*)\s+"\$\{?\1\}?"', t):
    key = m.group(1)
    window = t[max(0, m.start() - 700):m.start()]
    # `eval "$(...)"` mints variables without the text `KEY=` appearing, so a purely
    # textual "was it assigned nearby" test cannot see it. Phase 3f captures GENIE_SPACE_ID
    # exactly that way and then stores it -- a mint-then-store, not a re-store -- and the
    # first version of this check flagged it.
    minted = (re.search(r'\b' + key + r'=(?!=)', window)
              or re.search(r'eval "\$\(', window))
    recovered = re.search(r':\s*"\$\{' + key + r':=\$\(read_secret', window)
    if not minted and not recovered:
        bad.append(key)
print(' '.join(sorted(set(bad))))
PYCHK
)"
if [[ -z "$RESTORE_BAD" ]]; then
  pass "every re-store of a secret recovers the value before storing it."
else
  bad "these re-stores pass an empty variable after a shell boundary:$RESTORE_BAD"
fi

# ── 40. The shareable summary must not hand the recipient operator commands ─────
# The deployment summary is the one table an operator forwards to whoever will use the
# app. It carried `Expired or already used? | bash scripts/new-guest-link.sh --open`,
# which that person cannot run: the script needs a clone of this repo and reads
# PREVIEW_URL, GUEST_API_SECRET, GUEST_SP_CLIENT_ID and GUEST_SP_SECRET from
# .firefly-bootstrap/state.env, exiting if any is absent. So the row was useless to its
# reader, and the only way to make it work would be to hand over credentials.
SUMMARY_BAD="$(python3 - <<'PYCHK'
import re
t = open('BOOTSTRAP.md').read()
i = t.find('### Deployment summary')
if i == -1:
    print('summary-section-missing'); raise SystemExit
# The table is the block of pipe-rows following the heading.
rows = [l for l in t[i:i + 3000].split('\n') if l.startswith('|')]
bad = []
for r in rows:
    # Anything the recipient would have to run locally, or any secret name.
    if re.search(r'\b(bash|sh|databricks|vercel|neonctl|npm|pnpm|uv)\s+\S', r) \
       or re.search(r'scripts/\S+\.sh', r) \
       or re.search(r'GUEST_API_SECRET|GUEST_SP_SECRET|BETTER_AUTH_SECRET|ENCRYPTION_KEY', r):
        bad.append(r.strip()[:60])
print(' | '.join(bad))
PYCHK
)"
if [[ -z "$SUMMARY_BAD" ]]; then
  pass "the shareable summary asks nothing of its reader that needs the repo or a secret."
else
  bad "the summary table hands the recipient something only the operator can do:$SUMMARY_BAD"
fi

# ── 41. "Genie One" must not return as a current product name ───────────────────
# The product is Genie Agent -- the app's own attribution component has returned
# 'Genie Agent' for a while, and the docs lagged it in 49 places. Three references
# survive on purpose, and only those three: passages explaining why a link LABELLED
# "Genie One" was removed. Renaming a quoted historical label makes its own explanation
# self-contradictory, so they are quoted and allowed.
#
# Note what this check does NOT touch: the mode VALUE is `one`, an identifier, and
# renaming it would be a breaking change to bundle variables for no reader's benefit.
# Where "Genie One" was doing the work of saying "workspace-wide", the fix was to say
# workspace-wide -- both modes are the Genie Agent, so swapping the name alone would have
# left `one` and `space` reading identically.
GENIE_NAME_BAD="$(python3 - <<'PYCHK'
import re, subprocess
files = subprocess.run(
    ['grep','-rl','Genie One','--include=*.md','--include=*.tsx','--include=*.ts',
     '--include=*.py','--include=*.sh','--include=*.yml','.'],
    capture_output=True, text=True).stdout.split()
bad = []
# Exclude this script: it must name the old label to explain and to search for it, and a
# check that flags its own definition is the third time a guard here has been decided by
# its own prose rather than by what it is checking.
SELF = 'check-runbook-invariants.sh'
for f in (x for x in files if 'node_modules' not in x and SELF not in x):
    for i, line in enumerate(open(f, errors='replace'), 1):
        if 'Genie One' not in line:
            continue
        # Allowed only as a quoted label being discussed, e.g. a "Genie One" link.
        if re.search(r'["\u201c]Genie One["\u201d]', line):
            continue
        bad.append(f'{f}:{i}')
print(' '.join(bad))
PYCHK
)"
if [[ -z "$GENIE_NAME_BAD" ]]; then
  pass "\"Genie One\" appears only as a quoted historical label, never as the current name."
else
  bad "\"Genie One\" is used as a current product name:$GENIE_NAME_BAD"
fi

# ── 42. Nothing may pin the bootstrap branch, because it outlives itself ────────
# genie-agent carries this runbook; the default branch does not. So today a clone must
# ask for genie-agent, and the day it merges and is deleted that same clone fails with
# "Remote branch genie-agent not found in upstream origin" -- at Phase 2, the first step
# a new reader takes. Dropping the branch breaks the opposite state. Neither fixed choice
# survives the transition, so every clone resolves the branch and falls back.
#
# This also covers the README's "Open in Cursor" deeplink, which cannot run shell: its
# prompt has to TELL the agent to check, since a URL cannot.
BRANCH_PIN_BAD=""
# A clone that names the branch literally rather than through the variable.
#
# Capture and test for emptiness rather than piping into `grep -q`: grep -q exits on its
# first match, SIGPIPEs the greps upstream, and under `set -o pipefail` that turns the
# whole pipeline non-zero -- so an `&& set the flag` after it never fired, and this arm
# was dead code that passed against a deliberately re-pinned clone.
#
# Also exclude this file: it must contain the pattern in order to search for it.
# --exclude-dir=.git as well: a commit message that QUOTES the old pin (explaining why it
# was removed) lives in .git/COMMIT_EDITMSG and is not source. Without this the check fails
# on its own commit message the moment the fix is described accurately.
# Filter paths explicitly rather than trusting grep's --include/--exclude-dir: on the BSD
# grep macOS ships, --exclude-dir=.git did not exclude and --include='*.md' still matched
# .git/COMMIT_EDITMSG, a file with no extension at all. So this check failed on its own
# commit message -- the one describing the fix -- which is a guard broken by being
# explained. Path filtering here is portable and does what it says.
PIN_HITS="$(grep -rn -- '--branch genie-agent' . 2>/dev/null \
  | grep -E '\.(md|sh):[0-9]+:' \
  | grep -v '/\.git/' \
  | grep -v node_modules \
  | grep -v 'check-runbook-invariants.sh' \
  | grep -vE ':[[:space:]]*#' || true)"
[[ -n "$PIN_HITS" ]] && BRANCH_PIN_BAD="$BRANCH_PIN_BAD literal-clone-pin($(printf '%s' "$PIN_HITS" | head -1 | cut -d: -f1-2))"
# Both clone paths must resolve rather than assume.
grep -q 'ls-remote --exit-code --heads' BOOTSTRAP.md \
  || BRANCH_PIN_BAD="$BRANCH_PIN_BAD runbook-does-not-resolve"
grep -q 'firefly_resolve_branch()' scripts/bootstrap.sh \
  || BRANCH_PIN_BAD="$BRANCH_PIN_BAD runner-does-not-resolve"
# And the clone must be proved right: assert the runbook is actually in the checkout.
grep -q 'BOOTSTRAP.md is not in this checkout' BOOTSTRAP.md \
  || BRANCH_PIN_BAD="$BRANCH_PIN_BAD no-post-clone-assert"
# The deeplink prompt must name the fallback, not just the branch.
python3 - <<'PYCHK' || BRANCH_PIN_BAD="$BRANCH_PIN_BAD deeplink-pins-branch"
import re, sys, urllib.parse
s = open('README.md').read()
m = re.search(r'\]\((https://cursor\.com/link/prompt\?text=[^)]+)\)', s)
if not m:
    sys.exit(0)                       # no deeplink to guard
txt = urllib.parse.parse_qs(urllib.parse.urlparse(m.group(1)).query).get('text', [''])[0]
# Naming genie-agent is fine; naming it with no fallback is the defect.
sys.exit(0 if ('genie-agent' not in txt or 'default branch' in txt) else 1)
PYCHK
if [[ -z "$BRANCH_PIN_BAD" ]]; then
  pass "no clone or deeplink pins the bootstrap branch without a fallback."
else
  bad "this breaks the day genie-agent merges and is deleted:$BRANCH_PIN_BAD"
fi

# ── 43. Components must not hand-build GitHub URLs ─────────────────────────────
# github-source-link.tsx derived its blob URL from a GITHUB_REPO constant and then built
# its RAW url from a second, separately hardcoded copy of the same owner/repo. Changing the
# constant would have moved one link and silently left the other pointing at the old
# repository -- a half-applied edit that stays invisible until a user clicks. Both now come
# from src/lib/repo-links.ts.
#
# This does NOT require the two components to share a repo or branch: the docs "edit" links
# and the source-view links legitimately differ, and forcing them together would be a
# behaviour change wearing a refactor's clothes. Only hand-rolled URL STRINGS are banned.
URLGEN_BAD="$(python3 - <<'PYCHK'
import os, re
bad = []
for root, dirs, files in os.walk('src'):
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fn in files:
        if not fn.endswith(('.ts', '.tsx')):
            continue
        path = os.path.join(root, fn)
        if path.endswith(os.path.join('lib', 'repo-links.ts')):
            continue          # the one module allowed to know the URL shapes
        for i, line in enumerate(open(path, errors='replace'), 1):
            if re.match(r'\s*(//|\*)', line):
                continue      # a comment naming a URL is documentation, not construction
            if re.search(r'https://(github\.com|raw\.githubusercontent\.com)/\S*\$\{', line):
                bad.append(f'{path}:{i}')
print(' '.join(bad))
PYCHK
)"
if [[ -z "$URLGEN_BAD" ]]; then
  pass "GitHub URLs are built only in src/lib/repo-links.ts."
else
  bad "these hand-build a GitHub URL and can drift from their own constant:$URLGEN_BAD"
fi

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "All runbook invariants hold."
else
  echo "One or more invariants FAILED (see ✗ above)." >&2
fi
exit "$FAILED"

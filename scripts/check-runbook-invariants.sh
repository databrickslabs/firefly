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
# degrading to Genie One. Both must exist as variables, and every command that
# passes one must pass the other.
GENIE_COUPLING_BAD=""
for v in genie_mcp_mode genie_space_id; do
  grep -qE "^[[:space:]]*${v}:" agent/databricks.yml || GENIE_COUPLING_BAD="$GENIE_COUPLING_BAD ${v}(undeclared)"
done
grep -qE 'GENIE_SPACE_ID' agent/databricks.yml || GENIE_COUPLING_BAD="$GENIE_COUPLING_BAD GENIE_SPACE_ID(not-in-app-env)"

# The genie_space_id default must NOT be empty. An empty value makes the bundle
# render `{"name": "GENIE_SPACE_ID"}` with no `value` key, and the Apps API
# refuses the whole deploy: "Must specify environment variable source using
# either value or valueFrom". That broke Phase 4 on the DEFAULT Genie One path
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
# so a workspace link is dead for every one of them. It also named "Genie One"
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

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "All runbook invariants hold."
else
  echo "One or more invariants FAILED (see ✗ above)." >&2
fi
exit "$FAILED"

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
if grep -qE 'auth\.json' BOOTSTRAP.md; then
  if grep -qE 'V_TOKEN="\$\{VERCEL_TOKEN:-\}"' BOOTSTRAP.md; then
    pass "BOOTSTRAP.md prefers \$VERCEL_TOKEN before the CLI's auth.json."
  else
    bad "BOOTSTRAP.md reads auth.json without trying \$VERCEL_TOKEN first — drifted from scripts/bootstrap.sh."
    grep -nE 'auth\.json' BOOTSTRAP.md | sed 's/^/      /'
  fi
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

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "All runbook invariants hold."
else
  echo "One or more invariants FAILED (see ✗ above)." >&2
fi
exit "$FAILED"

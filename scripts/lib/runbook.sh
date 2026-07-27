# shellcheck shell=bash
# runbook.sh — the helpers BOOTSTRAP.md invokes, shared with scripts/bootstrap.sh.
#
#   source scripts/lib/runbook.sh
#
# WHY THIS FILE EXISTS
# Same reason as corp-network.sh, one layer up. BOOTSTRAP.md used to *call*
# store_secret / read_secret and *describe* the CLI installs, while the only real
# implementations lived in bootstrap.sh. Three consequences, all observed on the
# 2026-07-25 fresh-install run:
#
#   * store_secret / read_secret were undefined for anyone following the runbook,
#     and the script's read_secret had a different signature anyway
#     (read_secret VARNAME <ignored> KEY vs. the runbook's $(read_secret KEY)),
#     so even copying it across did not work.
#   * The Phase 1b/1e CLI installs were comments, so `databricks` and `gh` were
#     never installed on a machine that did not already have them.
#   * The Neon project-id parser was fixed in bootstrap.sh and left broken in the
#     markdown, because the two were separate copies.
#
# One implementation, sourced by both, is what stops that recurring.
#
# Safe to source from an interactive shell: nothing here sets -e or exits, and
# every function returns rather than terminating the caller. Must work under BOTH
# bash and zsh — BOOTSTRAP.md tells the reader to source this from their own
# shell, and zsh is the macOS default.

# ─── minimal helpers (defined only if the caller hasn't already) ──────────────
# `declare -F name` is NOT a function test in zsh: it declares a float and returns
# 0. Same guard as corp-network.sh; duplicated so each lib is independently
# sourceable.
_ff_is_func() {
  if [ -n "${ZSH_VERSION:-}" ]; then
    eval '(( ${+functions[$1]} ))'
  else
    declare -F "$1" >/dev/null 2>&1
  fi
}

_ff_is_func note || note() { echo "  $*"; }
_ff_is_func ok   || ok()   { echo "  ✓ $*"; }
_ff_is_func warn || warn() { echo "  ⚠ $*"; }
_ff_is_func fail || fail() { echo "  ✗ $*"; }

# ─── state.env: secret storage ───────────────────────────────────────────────
# A gitignored, chmod-600 file under $REPO_DIR. Deliberately not the macOS
# Keychain: the target machine may have no Python `keyring` wired up.
#
# On-disk format is `export KEY=<%q-quoted>` — consumers must SOURCE this file,
# never grep it. (A verifier once grepped '^PREVIEW_URL=' and silently missed
# every value because of the `export ` prefix.)
: "${STATE_DIR:=}"
: "${STATE_FILE:=}"

init_state_dir() {
  local base="${1:-${REPO_DIR:-$PWD}}"
  STATE_DIR="${base}/.firefly-bootstrap"
  STATE_FILE="${STATE_DIR}/state.env"
  mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
}

store_secret() {                        # store_secret KEY VALUE
  local key="$1" val="$2"
  init_state_dir
  local tmp="${STATE_FILE}.tmp"
  touch "$STATE_FILE"
  grep -v "^export ${key}=" "$STATE_FILE" > "$tmp" 2>/dev/null || true
  printf 'export %s=%q\n' "$key" "$val" >> "$tmp"
  mv "$tmp" "$STATE_FILE"
  chmod 600 "$STATE_FILE"
  ok "$key → state.env"
}

load_secrets() {
  init_state_dir
  # shellcheck disable=SC1090
  [ -f "$STATE_FILE" ] && . "$STATE_FILE"
  return 0
}

# read_secret KEY → prints the value on stdout; returns 1 if unset or empty.
#
# One argument, stdout. This is the form every BOOTSTRAP.md call site uses, and
# it is the contract. Note the deliberate absence of ${!key}: bash-only indirect
# expansion is what produced `(eval):1: bad substitution` under the guest zsh.
# Intended as $(read_secret KEY), which subshells the `.` so the caller's
# environment is not filled with every secret in the file.
read_secret() {
  local key="$1"
  init_state_dir
  [ -f "$STATE_FILE" ] || return 1
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  local val
  val="$(eval "printf '%s' \"\${$key-}\"")"
  [ -n "$val" ] || return 1
  printf '%s\n' "$val"
}

# require_secret VARNAME KEY — assign to VARNAME, or explain and return 1.
# Returns rather than exits so it is safe to source; callers that must stop
# should write `require_secret X Y || exit 1`.
require_secret() {
  local __var="$1" __key="$2" __val
  __val="$(read_secret "$__key")" || __val=""
  if [ -z "$__val" ]; then
    fail "state.env: $__key is empty (run the earlier phase that stores it first)"
    return 1
  fi
  eval "$__var=\$__val"
}

# ─── CLI installers (no Homebrew) ────────────────────────────────────────────
# Idempotent: each is a no-op when the tool is already on PATH. $HOME/bin is
# created here rather than assumed — a previous regression was an installer that
# wrote into a $HOME/bin that did not exist yet.

firefly_install_databricks_cli() {
  command -v databricks >/dev/null 2>&1 && {
    ok "databricks already installed: $(databricks --version 2>/dev/null | head -1)"; return 0; }
  local arch tag tmp
  case "$(uname -m)" in
    arm64|aarch64) arch=arm64 ;;
    x86_64)        arch=amd64 ;;
    *) fail "unsupported architecture: $(uname -m)"; return 1 ;;
  esac
  tag=$(curl -fsSL https://api.github.com/repos/databricks/cli/releases/latest \
        | python3 -c "import sys,json;print(json.load(sys.stdin)['tag_name'].lstrip('v'))") || {
    fail "could not resolve the latest Databricks CLI release"; return 1; }
  tmp=$(mktemp -d)
  curl -fsSL "https://github.com/databricks/cli/releases/download/v${tag}/databricks_cli_${tag}_darwin_${arch}.zip" \
       -o "$tmp/db.zip" || { rm -rf "$tmp"; fail "download failed"; return 1; }
  unzip -qo "$tmp/db.zip" -d "$tmp" || { rm -rf "$tmp"; fail "unzip failed"; return 1; }
  mkdir -p "$HOME/bin" && cp "$tmp/databricks" "$HOME/bin/databricks" && chmod +x "$HOME/bin/databricks"
  rm -rf "$tmp"
  export PATH="$HOME/bin:$PATH"
  ok "databricks installed to \$HOME/bin ($(databricks --version 2>/dev/null | head -1))"
}

firefly_install_gh() {
  command -v gh >/dev/null 2>&1 && {
    ok "gh already installed: $(gh --version 2>/dev/null | head -1)"; return 0; }
  local arch tag tmp
  case "$(uname -m)" in
    arm64|aarch64) arch=macOS_arm64 ;;
    x86_64)        arch=macOS_amd64 ;;
    *) fail "unsupported architecture: $(uname -m)"; return 1 ;;
  esac
  tag=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest \
        | python3 -c "import sys,json;print(json.load(sys.stdin)['tag_name'].lstrip('v'))") || {
    fail "could not resolve the latest GitHub CLI release"; return 1; }
  tmp=$(mktemp -d)
  curl -fsSL "https://github.com/cli/cli/releases/download/v${tag}/gh_${tag}_${arch}.zip" \
       -o "$tmp/gh.zip" || { rm -rf "$tmp"; fail "download failed"; return 1; }
  unzip -qo "$tmp/gh.zip" -d "$tmp" || { rm -rf "$tmp"; fail "unzip failed"; return 1; }
  mkdir -p "$HOME/bin" && cp "$tmp"/gh_*/bin/gh "$HOME/bin/gh" && chmod +x "$HOME/bin/gh"
  rm -rf "$tmp"
  export PATH="$HOME/bin:$PATH"
  ok "gh installed to \$HOME/bin ($(gh --version 2>/dev/null | head -1))"
}

# ─── CLI output parsers ──────────────────────────────────────────────────────
# These have fixture tests (scripts/test-parsing.sh). Keeping one copy is the
# point: the markdown's copy of the Neon parser read a top-level 'id' for months
# after the script's copy was fixed to read project.id.

extract_vercel_preview_url() {
  grep -oE 'https://[^ ]*\.vercel\.app' | tail -1
}

# `neonctl projects create --output json` nests the project under a "project"
# key. The flat fallback covers older CLI versions.
extract_neon_project_id() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('project',{}).get('id') or d.get('id',''))"
}

# firefly_neon_project_id [ORG_FLAG...] — id of the project named
# $NEON_PROJECT_NAME, or empty. Neon project names are NOT unique (ids are), so
# every lookup is by name against the list.
firefly_neon_project_id() {
  NEON_PROJECT_NAME="$NEON_PROJECT_NAME" neonctl projects list "$@" --output json 2>/dev/null \
    | python3 -c "import os,sys,json;d=json.load(sys.stdin);ps=d.get('projects',d) if isinstance(d,dict) else d;print(next((p['id'] for p in ps if p.get('name')==os.environ['NEON_PROJECT_NAME']),''))"
}

# ─── bundle assertions ───────────────────────────────────────────────────────

# The committed agent/databricks.yml carries placeholder resource bindings that
# `uv run scripts/quickstart.py` (Phase 3a) rewrites for the target workspace.
# Deploying without that rewrite fails with a 404 that names only the stale id
# — "Node ID 123237888438046 does not exist" — which points nowhere useful.
: "${FIREFLY_PLACEHOLDER_EXPERIMENT_ID:=123237888438046}"

assert_bundle_quickstart_ran() {         # assert_bundle_quickstart_ran <databricks.yml>
  local yml="${1:-agent-build/databricks.yml}"
  [ -f "$yml" ] || { fail "$yml not found — run scripts/assemble_agent.sh (Phase 2) first."; return 1; }
  # Re-apply the default HERE, not just at source time. The id is set with
  # `: "${VAR:=...}"` at the top of this file, which runs once; if the caller's
  # shell has it exported empty, the grep below becomes `grep -q ""` — and that
  # matches EVERY line, so a bundle quickstart had already rewritten correctly
  # fails the assert and the reader is told to re-run Phase 3a. Three E2E runs
  # lost time to that.
  [ -n "${FIREFLY_PLACEHOLDER_EXPERIMENT_ID:-}" ] \
    || FIREFLY_PLACEHOLDER_EXPERIMENT_ID=123237888438046
  if grep -q "$FIREFLY_PLACEHOLDER_EXPERIMENT_ID" "$yml"; then
    fail "$yml still holds the placeholder experiment id ($FIREFLY_PLACEHOLDER_EXPERIMENT_ID)."
    note "Phase 3a (quickstart) has not completed against this workspace, so the bundle"
    note "still points at the authoring workspace. Deploying now returns a 404 naming that"
    note "id. Re-run Phase 3a, then retry this phase."
    return 1
  fi
  ok "bundle resource bindings were written by quickstart"
}

# Phase 3e. Three rules that must hold simultaneously in the bundle's sync.exclude:
#   pyproject.toml   NOT excluded — the Apps build needs it to find the dep list
#   uv.lock          excluded     — forces a plain `uv sync` that can use UV_FIND_LINKS
#   vendor-wheels/   NOT excluded — the local wheels must reach the build
# Parsed with a YAML-aware reader rather than a regex: the exclude list opens
# with comment lines, and a naive `-\s` scan reads it as empty and "passes" a
# broken config (or fails a correct one, which is what happened on 2026-07-25).
check_sync_exclude_rules() {             # check_sync_exclude_rules <databricks.yml>
  local yml="${1:-agent-build/databricks.yml}"
  [ -f "$yml" ] || { fail "$yml not found"; return 1; }
  python3 - "$yml" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
m = re.search(r'^sync:\s*$', text, re.M)
if not m:
    print("  \u2717 no sync: block found"); sys.exit(1)
block, started = [], False
for line in text[m.start():].splitlines()[1:]:
    if line.strip() and not line[:1].isspace():
        break                                  # dedented to a new top-level key
    s = line.strip()
    if s.startswith('exclude:'):
        started = True; continue
    if started and s.startswith('- '):
        block.append(s[2:].strip())
    elif started and s and not s.startswith('#') and not s.startswith('- '):
        break
rules = {
    'pyproject.toml': (False, 'the Apps build needs it to find the dependency list'),
    'uv.lock':        (True,  'forces a plain `uv sync`, so UV_FIND_LINKS can supply wheels'),
    'vendor-wheels':  (False, 'the vendored wheels must reach the build host'),
}
bad = 0
for name, (must_exclude, why) in rules.items():
    present = any(name in e for e in block)
    if present != must_exclude:
        state = "excluded" if present else "not excluded"
        want  = "excluded" if must_exclude else "NOT excluded"
        print(f"  \u2717 {name} is {state}; it must be {want} \u2014 {why}")
        bad = 1
if bad:
    print(f"  sync.exclude currently: {block}")
    sys.exit(1)
print(f"  \u2713 sync.exclude rules hold ({len(block)} entries)")
PY
}

# ─── SQL over a warehouse (Phase 6c) ─────────────────────────────────────────
# Every SQL step in this runbook used to be a `note` telling the reader to open a
# warehouse session and paste it themselves, so nothing SQL-shaped was ever
# actually executed or verified. Phase 6c needs real execution (seeding, grants,
# table counts), so this is the one primitive that runs a statement and returns
# rows.
#
# `wait_timeout` maxes out at 50s server-side, which a 16-table CTAS can exceed,
# so a statement that is still PENDING/RUNNING when the wait expires is polled to
# completion rather than reported as a failure. on_wait_timeout=CONTINUE is what
# keeps it running instead of being cancelled at the 50s mark.
#
# Output: one line per result row, tab-separated. Non-zero exit means the
# statement did not reach SUCCEEDED, with the server's message on stderr.
: "${FIREFLY_SQL_DEADLINE:=900}"          # seconds to wait for one statement

firefly_sql() {                          # firefly_sql <warehouse_id> <sql> [profile]
  local wh="$1" sql="$2" prof="${3:-${DB_PROFILE:-}}"
  [ -n "$wh" ] || { fail "firefly_sql: no warehouse id given"; return 2; }
  [ -n "$prof" ] || { fail "firefly_sql: no Databricks profile given"; return 2; }

  local req; req="$(mktemp -t ffsql)" || return 2
  FF_WH="$wh" FF_SQL="$sql" python3 -c 'import json,os,sys
sys.stdout.write(json.dumps({
    "warehouse_id": os.environ["FF_WH"],
    "statement": os.environ["FF_SQL"],
    "wait_timeout": "50s",
    "on_wait_timeout": "CONTINUE",
}))' > "$req" || { rm -f "$req"; fail "firefly_sql: could not build request"; return 2; }

  local out rc
  out="$(databricks api post /api/2.0/sql/statements --json "@$req" --profile "$prof" 2>&1)"; rc=$?
  rm -f "$req"
  if [ "$rc" -ne 0 ]; then
    fail "firefly_sql: statement submit failed"
    printf '%s\n' "$out" | head -3 >&2
    return 1
  fi

  # PENDING/RUNNING → poll. Anything else is terminal and parsed below.
  local sid deadline state
  sid="$(printf '%s' "$out" | python3 -c 'import sys,json
try: print((json.load(sys.stdin) or {}).get("statement_id") or "")
except Exception: print("")' 2>/dev/null)"
  state="$(printf '%s' "$out" | python3 -c 'import sys,json
try: print(((json.load(sys.stdin) or {}).get("status") or {}).get("state") or "")
except Exception: print("")' 2>/dev/null)"

  deadline=$(( $(date +%s) + FIREFLY_SQL_DEADLINE ))
  while [ "$state" = "PENDING" ] || [ "$state" = "RUNNING" ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      databricks api post "/api/2.0/sql/statements/$sid/cancel" --profile "$prof" >/dev/null 2>&1
      fail "firefly_sql: statement $sid still $state after ${FIREFLY_SQL_DEADLINE}s (cancelled)"
      return 1
    fi
    sleep 5
    out="$(databricks api get "/api/2.0/sql/statements/$sid" --profile "$prof" 2>&1)" || {
      fail "firefly_sql: polling $sid failed"; return 1; }
    state="$(printf '%s' "$out" | python3 -c 'import sys,json
try: print(((json.load(sys.stdin) or {}).get("status") or {}).get("state") or "")
except Exception: print("")' 2>/dev/null)"
  done

  printf '%s' "$out" | python3 -c 'import sys,json
try:
    d = json.load(sys.stdin) or {}
except Exception:
    sys.stderr.write("firefly_sql: unparseable response\n"); sys.exit(1)
st = d.get("status") or {}
if st.get("state") != "SUCCEEDED":
    msg = (st.get("error") or {}).get("message", "")
    sys.stderr.write("firefly_sql: %s %s\n" % (st.get("state"), msg[:400])); sys.exit(1)
for row in ((d.get("result") or {}).get("data_array") or []):
    print("\t".join("" if c is None else str(c) for c in row))
'
}

# ─── IP allowlist: three outcomes, never two ─────────────────────────────────
# There were two copies of this check and they reached OPPOSITE conclusions on the
# same workspace. Phase 1b surfaced "IP access list is not available in the pricing
# tier of this workspace"; Phase 9 discarded stderr, failed to parse, and printed
# "ok: no enabled IP allowlist on this workspace - the app can reach it".
#
# That is worse than a confusing message. It is a false all-clear on a control that
# decides whether the data plane works at all, and it appears in the phase people
# read when something has already gone wrong.
#
# "Could not determine" is a distinct answer from "there is none". Echoes exactly
# one of:
#   none                 checked, nothing enabled
#   enabled:<labels>     checked, these are enabled
#   unknown:<reason>      could not check — say why, never imply safety
firefly_ip_allowlist_status() {           # firefly_ip_allowlist_status [profile]
  local prof="${1:-${DB_PROFILE:-}}" raw
  [ -n "$prof" ] || { echo "unknown:no profile given"; return 0; }
  raw="$(databricks api get /api/2.0/ip-access-lists --profile "$prof" 2>&1)"
  FF_RAW="$raw" python3 -c '
import json, os, re, sys
raw = (os.environ.get("FF_RAW") or "").strip()
if not raw:
    print("unknown:no response from the API"); sys.exit()
try:
    d = json.loads(raw)
except ValueError:
    # Not JSON: the CLI or the API said something. Pass its own words through —
    # a trial workspace answers "not available in the pricing tier", which is a
    # real answer and must never be rendered as "none".
    print("unknown:" + " ".join(raw.split())[:160]); sys.exit()
if not isinstance(d, dict):
    print("unknown:unexpected response shape"); sys.exit()
on = [l.get("label") or "?" for l in (d.get("ip_access_lists") or [])
      if l.get("enabled") and l.get("list_type") == "ALLOW"]
print("enabled:" + " / ".join(on) if on else "none")
'
}

# ─── Lakebase: report what got BOUND, not what was asked for ─────────────────
# Passing --app-name for an app that already exists makes quickstart bind Lakebase
# from that app's existing configuration and ignore --lakebase-create-new. The
# requested project is never created, Phase 3a still reports PASS, and every later
# summary prints LAKEBASE_NAME — a resource that does not exist. Observed across
# two passes: pass 1 created firefly-lb-0727083127, pass 2 asked for
# firefly-lb-0727090103, quickstart bound the first, and the summary named the
# second.
#
# The bound project is discoverable: quickstart writes agent-build/.env and
# patches databricks.yml, and both carry the endpoint path
# `projects/<name>/branches/<name>-branch/...`. Read the name out of that rather
# than trusting the request.
firefly_bound_lakebase() {               # firefly_bound_lakebase [agent_build_dir]
  local dir="${1:-${REPO_DIR:-$PWD}/agent-build}" f
  for f in "$dir/.env" "$dir/databricks.yml"; do
    [ -f "$f" ] || continue
    sed -nE 's|.*projects/([A-Za-z0-9_-]+)/branches/.*|\1|p' "$f" | head -1 | grep . && return 0
  done
  return 1
}

# Reconcile the request against reality and let reality win, loudly.
firefly_reconcile_lakebase() {            # firefly_reconcile_lakebase [agent_build_dir]
  local bound
  bound="$(firefly_bound_lakebase "$@" 2>/dev/null)" || {
    warn "could not determine which Lakebase project quickstart bound"
    return 0
  }
  if [ -n "$bound" ] && [ "$bound" != "${LAKEBASE_NAME:-}" ]; then
    warn "quickstart bound Lakebase '$bound', NOT the requested '${LAKEBASE_NAME:-}'."
    note "An existing --app-name wins over --lakebase-create-new: the app's own"
    note "Lakebase binding is reused and the requested project is never created."
    note "Reporting the bound name from here on, so the summary matches reality."
    LAKEBASE_NAME="$bound"
    export LAKEBASE_NAME
    # An in-shell export is not enough. Non-secret answers are re-sourced from
    # inputs.env on a later shell or a resumed run, which would resurrect the
    # requested-but-never-created name in the summary. Persist the truth.
    firefly_store_input LAKEBASE_NAME "$bound"
  else
    ok "Lakebase '$bound' matches the requested name"
  fi
}

# Persist a non-secret answer to inputs.env, the file a resumed run re-sources.
# bootstrap.sh has its own store_input; this is the library equivalent so the
# runbook and anything sourcing this lib can persist too, instead of the value
# living only in one shell.
firefly_store_input() {                  # firefly_store_input KEY VALUE
  local key="$1" val="$2" dir file
  [ -n "$key" ] || return 1
  dir="${INPUTS_DIR:-$HOME/.firefly-bootstrap}"
  file="$dir/inputs.env"
  mkdir -p "$dir" 2>/dev/null || return 1
  [ -f "$file" ] && grep -v "^${key}=" "$file" > "$file.tmp" 2>/dev/null && mv "$file.tmp" "$file"
  printf '%s=%s\n' "$key" "$val" >> "$file"
}

# Set expectations BEFORE quickstart runs, not after it has surprised you.
# The create path reads as though it will provision the named instance right up
# until the post-hoc warning appears; if the app already exists, its binding is
# going to win and that is knowable in advance.
firefly_warn_existing_app_wins() {        # firefly_warn_existing_app_wins <app> <profile>
  local app="$1" prof="$2"
  [ -n "$app" ] && [ -n "$prof" ] || return 0
  if databricks apps get "$app" --profile "$prof" >/dev/null 2>&1; then
    warn "app '$app' already exists, so ITS Lakebase binding will win here."
    note "--lakebase-create-new will not provision '${LAKEBASE_NAME:-}'; the name is"
    note "reconciled after quickstart and the summary will show what was bound."
  fi
}

# ─── sha256sum shim (Phase 1: before the uv installer) ───────────────────────
# The astral.sh uv installer verifies its own download with `sha256sum`, which
# does not exist on stock macOS — the tool there is `shasum`. So it prints
#
#   skipping sha256 checksum verification (it requires the 'sha256sum' command)
#
# and installs an UNVERIFIED binary. On a clean VM that is the default path, and
# the message scrolls past in the middle of a long install. We are fetching an
# executable over the network; declining to check its integrity is not something
# to accept silently just because the installer offers to.
#
# `shasum -a 256` is byte-identical to `sha256sum` for both hashing and -c check
# mode (verified), so a two-line shim on PATH restores the installer's own
# verification rather than working around it.
firefly_ensure_sha256sum() {
  command -v sha256sum >/dev/null 2>&1 && return 0
  if ! command -v shasum >/dev/null 2>&1; then
    warn "neither sha256sum nor shasum found — installers cannot verify checksums"
    return 1
  fi
  mkdir -p "$HOME/bin" || return 1
  cat > "$HOME/bin/sha256sum" <<'SHIM'
#!/bin/sh
# Shim: stock macOS ships `shasum`, not `sha256sum`. Output and -c behaviour are
# identical for SHA-256, so installers that require sha256sum can verify their
# downloads instead of skipping the check.
exec shasum -a 256 "$@"
SHIM
  chmod +x "$HOME/bin/sha256sum"
  case ":$PATH:" in *":$HOME/bin:"*) ;; *) PATH="$HOME/bin:$PATH"; export PATH ;; esac
  ok "provided a sha256sum shim so installers can verify their downloads"
}

# ─── Vercel API context (Phases 8a and 8e) ───────────────────────────────────
# Sets V_TOKEN / V_ORG / V_PROJ. Both phases need them and 8a used to be the only
# place they were derived, so running 8e in a fresh shell produced an empty
# Authorization header — the verify curl failed and reported "production does not
# serve $APP_ORIGIN" for a deployment that was perfectly fine. Deriving in one
# reusable place means a new shell cannot change the answer.
#
# Token precedence: explicit env first (CI / token-based setups), then the CLI's
# macOS store, then its XDG location. A hardcoded path is a silent failure for
# anyone whose Vercel auth lives elsewhere.
firefly_vercel_context() {               # firefly_vercel_context [repo_dir]
  local repo="${1:-${REPO_DIR:-$PWD}}" auth
  V_TOKEN="${VERCEL_TOKEN:-${V_TOKEN:-}}"
  for auth in "$HOME/Library/Application Support/com.vercel.cli/auth.json" \
              "$HOME/.local/share/com.vercel.cli/auth.json"; do
    [ -n "$V_TOKEN" ] && break
    [ -f "$auth" ] || continue
    V_TOKEN=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("token",""))' "$auth" 2>/dev/null || echo "")
  done
  [ -n "$V_TOKEN" ] || warn "no Vercel token found — project API calls will fail"

  if [ -f "$repo/.vercel/project.json" ]; then
    V_ORG=$(python3 -c "import json;print(json.load(open('$repo/.vercel/project.json'))['orgId'])" 2>/dev/null || echo "")
    V_PROJ=$(python3 -c "import json;print(json.load(open('$repo/.vercel/project.json'))['projectId'])" 2>/dev/null || echo "")
  else
    warn "$repo/.vercel/project.json not found — run Phase 8a (vercel link) first"
  fi
  export V_TOKEN V_ORG V_PROJ
}

# Convenience: the single scalar a lot of Phase 6c checks want (COUNT(*), etc).
firefly_sql_scalar() {                   # firefly_sql_scalar <warehouse_id> <sql> [profile]
  firefly_sql "$1" "$2" "${3:-${DB_PROFILE:-}}" | head -1 | cut -f1
}

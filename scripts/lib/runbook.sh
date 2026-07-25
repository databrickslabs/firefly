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

#!/usr/bin/env bash
# bootstrap.sh — Firefly Genie-Agent interactive setup runner
#
# Usage:
#   bash scripts/bootstrap.sh              # live mode (executes every command)
#   bash scripts/bootstrap.sh --dry-run   # prints commands, no infra touched
#   bash scripts/bootstrap.sh --dry-run --stop-after=3  # stop after Phase 3
#   bash scripts/bootstrap.sh --stop-after=1            # collect inputs + auth only
#
# Mirrors every phase in BOOTSTRAP.md exactly.
# Secrets persist in a gitignored, chmod-600 .firefly-bootstrap/state.env under the repo.

set -euo pipefail

# ─── flags ────────────────────────────────────────────────────────────────────
DRY_RUN=false
STOP_AFTER=""

for arg in "$@"; do
  case $arg in
    --dry-run)         DRY_RUN=true ;;
    --stop-after=*)    STOP_AFTER="${arg#*=}" ;;
    *) echo "Unknown flag: $arg  (use --dry-run, --stop-after=N)"; exit 1 ;;
  esac
done

# ─── color helpers ────────────────────────────────────────────────────────────
bold=$(tput bold 2>/dev/null || echo "")
dim=$(tput dim 2>/dev/null || echo "")
reset=$(tput sgr0 2>/dev/null || echo "")
cyan=$(tput setaf 6 2>/dev/null || echo "")
yellow=$(tput setaf 3 2>/dev/null || echo "")
green=$(tput setaf 2 2>/dev/null || echo "")
red=$(tput setaf 1 2>/dev/null || echo "")

header() { echo; echo "${bold}${cyan}=== $* ===${reset}"; echo; }
step()   { echo "${bold}$*${reset}"; }
note()   { echo "  ${dim}$*${reset}"; }
ok()     { echo "  ${green}✓ $*${reset}"; }
warn()   { echo "  ${yellow}⚠ $*${reset}"; }
fail()   { echo "  ${red}✗ $*${reset}"; }

# ─── run helper ───────────────────────────────────────────────────────────────
# In dry-run mode: prints the command. In live mode: executes it.
run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  ${yellow}[DRY-RUN]${reset} $*"
  else
    eval "$@"
  fi
}

# Like run, but captures output (dry-run returns a placeholder).
capture() {
  local varname="$1"; shift
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  ${yellow}[DRY-RUN]${reset} $* → <$varname>"
    eval "$varname='<$varname-placeholder>'"
  else
    eval "$varname=\$( $* )"
  fi
}

# ─── prompt helpers ───────────────────────────────────────────────────────────
ask() {
  local varname="$1" prompt="$2" default="${3:-}"
  local val=""
  # A cached answer (from inputs.env) takes precedence as the default.
  local cached="${!varname:-}"
  [[ -n "$cached" ]] && default="$cached"
  # When reusing saved answers, accept the cached value without prompting.
  if [[ "${REUSE_INPUTS:-0}" == "1" && -n "$cached" ]]; then
    eval "$varname='$cached'"
    ok "$varname = $cached ${dim}(saved)${reset}"
    return
  fi
  if [[ -n "$default" ]]; then
    read -rp "  ${bold}$prompt${reset} [${dim}$default${reset}]: " val
    val="${val:-$default}"
  else
    while [[ -z "$val" ]]; do
      read -rp "  ${bold}$prompt${reset}: " val
      [[ -z "$val" ]] && warn "Required — cannot be empty."
    done
  fi
  eval "$varname='$val'"
  store_input "$varname" "$val"
  ok "$varname = $val"
}

# Secret storage: a gitignored, chmod-600 state.env under $REPO_DIR (no keyring
# dependency — the target machine may not have Python `keyring`/Keychain wired up).
STATE_DIR=""
STATE_FILE=""
init_state_dir() {
  local base="${1:-${REPO_DIR:-$PWD}}"
  STATE_DIR="${base}/.firefly-bootstrap"
  STATE_FILE="${STATE_DIR}/state.env"
  mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
}

store_secret() {                      # store_secret KEY VALUE
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
  [[ -f "$STATE_FILE" ]] && source "$STATE_FILE" || true
}

ask_secret() {                        # ask_secret VARNAME <ignored> PROMPT
  local varname="$1" prompt="$3"
  local val=""
  while [[ -z "$val" ]]; do
    read -rsp "  ${bold}$prompt${reset} (hidden): " val; echo
    [[ -z "$val" ]] && warn "Required — cannot be empty."
  done
  store_secret "$varname" "$val"
}

read_secret() {                       # read_secret VARNAME <ignored> KEY
  local varname="$1" key="$3"
  load_secrets
  local val="${!key:-}"
  if [[ -z "$val" ]]; then
    fail "state.env: $key is empty (run the earlier phase that stores it first)"
    exit 1
  fi
  eval "$varname=\$val"
}

# ─── Input persistence + resume (#18) ─────────────────────────────────────────
# Non-secret answers persist in ~/.firefly-bootstrap/inputs.env so re-runs don't
# re-prompt. This lives in $HOME (not $REPO_DIR) because REPO_DIR is itself an
# answer we cache — it must survive before the repo is cloned.
INPUTS_DIR="$HOME/.firefly-bootstrap"
INPUTS_FILE="$INPUTS_DIR/inputs.env"
REUSE_INPUTS=0

init_inputs_dir() { mkdir -p "$INPUTS_DIR"; chmod 700 "$INPUTS_DIR"; }

store_input() {                       # store_input KEY VALUE
  local key="$1" val="$2"
  init_inputs_dir
  local tmp="${INPUTS_FILE}.tmp"
  touch "$INPUTS_FILE"
  grep -v "^export ${key}=" "$INPUTS_FILE" > "$tmp" 2>/dev/null || true
  printf 'export %s=%q\n' "$key" "$val" >> "$tmp"
  mv "$tmp" "$INPUTS_FILE"
  chmod 600 "$INPUTS_FILE"
}

load_inputs() { [[ -f "$INPUTS_FILE" ]] && source "$INPUTS_FILE" || true; }

mark_phase_done() { store_input LAST_COMPLETED_PHASE "$1"; }
phase_done()      { [[ "${LAST_COMPLETED_PHASE:-0}" -ge "$1" ]] 2>/dev/null; }

reset_inputs() { rm -f "$INPUTS_FILE"; unset LAST_COMPLETED_PHASE; }

# If a prior run left cached answers, show them and ask whether to reuse.
maybe_reuse_inputs() {
  [[ "$DRY_RUN" == "true" ]] && return 0
  [[ -f "$INPUTS_FILE" ]] || return 0
  load_inputs
  echo
  note "Found saved answers from a previous run (~/.firefly-bootstrap/inputs.env):"
  local shown=0
  for k in DATABRICKS_HOST UC_CATALOG UC_SCHEMA DATABRICKS_ACCOUNT_ID REPO_DIR VERCEL_TEAM VERCEL_PROJECT NEON_PROJECT_NAME; do
    local v="${!k:-}"; [[ -n "$v" ]] && { echo "    ${dim}$k = $v${reset}"; shown=1; }
  done
  [[ "${LAST_COMPLETED_PHASE:-0}" -gt 0 ]] && note "Last run completed through Phase ${LAST_COMPLETED_PHASE}."
  [[ "$shown" == "0" ]] && return 0
  echo
  read -rp "  ${bold}Reuse these saved answers?${reset} [Y/n]: " reuse_
  if [[ "$reuse_" =~ ^[Nn]$ ]]; then
    reset_inputs
    note "Starting fresh — you'll be asked for each value."
  else
    REUSE_INPUTS=1
    ok "Reusing saved answers (press Enter at any prompt to keep a value)."
  fi
}

confirm_phase() {
  local phase="$1"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  ${yellow}[DRY-RUN]${reset} Would execute Phase $phase"
    return 0
  fi
  echo
  read -rp "  Execute Phase $phase? [y/N]: " ok_
  [[ "$ok_" =~ ^[Yy]$ ]]
}

stop_if_done() {
  local phase="$1"
  [[ "$DRY_RUN" == "false" ]] && mark_phase_done "$phase"
  if [[ -n "$STOP_AFTER" && "$STOP_AFTER" == "$phase" ]]; then
    echo
    echo "${green}Stopped after Phase $phase.${reset}"
    exit 0
  fi
}

validate_url() {
  local url="$1"
  [[ "$url" =~ ^https?:// ]] || { fail "Must start with https://"; return 1; }
}

# ─── banner ───────────────────────────────────────────────────────────────────
echo
echo "${bold}╔══════════════════════════════════════════════════════════╗${reset}"
echo "${bold}║  Firefly Genie-Agent  —  Bootstrap Runner                ║${reset}"
echo "${bold}║  Implements BOOTSTRAP.md phases 0–9                     ║${reset}"
[[ "$DRY_RUN" == "true" ]] && \
echo "${bold}║  ${yellow}Mode: DRY-RUN  (no infra will be created)${reset}${bold}              ║${reset}" || \
echo "${bold}║  ${green}Mode: LIVE  (will create real resources)${reset}${bold}                ║${reset}"
[[ -n "$STOP_AFTER" ]] && \
echo "${bold}║  Stopping after Phase $STOP_AFTER                                   ║${reset}"
echo "${bold}╚══════════════════════════════════════════════════════════╝${reset}"

# ─── Phase 0: Collect inputs ─────────────────────────────────────────────────
header "Phase 0 — Collect inputs"
note "Answers persist in ~/.firefly-bootstrap/inputs.env; secrets in state.env (chmod 600)."
maybe_reuse_inputs
echo

ask DATABRICKS_HOST  "Databricks workspace URL (https://dbc-xxxx.cloud.databricks.com)"
validate_url "$DATABRICKS_HOST"

ask DB_PROFILE       "Databricks CLI profile name"      "firefly-deploy"
ask UC_CATALOG       "Unity Catalog catalog"            "workspace"
ask UC_SCHEMA        "Unity Catalog schema"             "default"
ask AGENT_APP_NAME        "Databricks App name"                        "firefly-openai-managed-mem-v2"
ask LAKEBASE_NAME         "Lakebase instance name"                     "firefly-lb"
ask DATABRICKS_ACCOUNT_ID "Databricks account ID (from accounts.cloud.databricks.com URL)"
ask REPO_DIR         "Local clone directory (default: current working directory)" "$PWD"
ask VERCEL_TEAM      "Vercel team slug (e.g. acme-corp — from vercel.com/<slug>/...)"
ask NEON_PROJECT_NAME "Neon project name"               "firefly-genie"
ask VERCEL_PROJECT   "Vercel project name"              "firefly-genie"

echo
# TLS trust for intercepting corporate proxies (Zscaler/etc.). Python (quickstart,
# Databricks SDK) and Node otherwise fail cert verification and hang until timeout.
if [[ -n "${TLS_PEM_PATH:-}" && -f "${TLS_PEM_PATH}" ]]; then
  export REQUESTS_CA_BUNDLE="$TLS_PEM_PATH" SSL_CERT_FILE="$TLS_PEM_PATH" NODE_EXTRA_CA_CERTS="$TLS_PEM_PATH"
  ok "TLS trust from TLS_PEM_PATH → REQUESTS_CA_BUNDLE / SSL_CERT_FILE / NODE_EXTRA_CA_CERTS"
elif [[ "$DRY_RUN" == "false" ]]; then
  read -rp "  ${bold}Behind an intercepting HTTPS proxy (Zscaler / corporate MITM)?${reset} [y/N]: " USE_PROXY
  if [[ "$USE_PROXY" =~ ^[Yy]$ ]]; then
    read -rp "  ${bold}Path to combined PEM/CA bundle:${reset} " TLS_PEM_PATH
    if [[ -f "$TLS_PEM_PATH" ]]; then
      export REQUESTS_CA_BUNDLE="$TLS_PEM_PATH" SSL_CERT_FILE="$TLS_PEM_PATH" NODE_EXTRA_CA_CERTS="$TLS_PEM_PATH"
      ok "TLS trust → REQUESTS_CA_BUNDLE / SSL_CERT_FILE / NODE_EXTRA_CA_CERTS"
    else
      fail "PEM file not found: $TLS_PEM_PATH"; exit 1
    fi
  fi
else
  run "# prompt: intercepting proxy? → export REQUESTS_CA_BUNDLE/SSL_CERT_FILE/NODE_EXTRA_CA_CERTS"
fi

note "All inputs collected. Summary:"
note "  DATABRICKS_HOST  = $DATABRICKS_HOST"
note "  DB_PROFILE       = $DB_PROFILE"
note "  UC_CATALOG       = $UC_CATALOG / $UC_SCHEMA"
note "  AGENT_APP_NAME        = $AGENT_APP_NAME"
note "  LAKEBASE_NAME         = $LAKEBASE_NAME"
note "  DATABRICKS_ACCOUNT_ID = $DATABRICKS_ACCOUNT_ID"
note "  REPO_DIR         = $REPO_DIR"
note "  VERCEL_TEAM      = $VERCEL_TEAM"
note "  NEON_PROJECT_NAME = $NEON_PROJECT_NAME"
note "  VERCEL_PROJECT   = $VERCEL_PROJECT"

stop_if_done "0"

# ─── Phase 1: Auth ────────────────────────────────────────────────────────────
header "Phase 1 — Auth"
confirm_phase "1" || { stop_if_done "1"; exit 0; }

echo
step "1a. pnpm (install first — later CLIs and the frontend build need it)"
if command -v pnpm &>/dev/null; then
  ok "pnpm already installed: $(pnpm --version 2>/dev/null || echo '?')"
else
  run "npm install -g pnpm"
fi

echo
step "1b. Vercel CLI OAuth (opens browser)"
if command -v vercel &>/dev/null; then
  ok "vercel already installed: $(vercel --version 2>/dev/null || echo '?')"
else
  run "npm install -g vercel"
fi
run "vercel login"
run "vercel whoami"

echo
step "1c. GitHub CLI"
if command -v gh &>/dev/null; then
  ok "gh already installed: $(gh --version 2>/dev/null | head -1)"
elif [[ "$DRY_RUN" == "true" ]]; then
  run "# download + install GitHub CLI (official release) to \$HOME/bin"
else
  note "Installing GitHub CLI (official release; no Homebrew required)..."
  GH_ARCH="$(uname -m)"; [[ "$GH_ARCH" == "arm64" ]] && GH_ARCH="macOS_arm64" || GH_ARCH="macOS_amd64"
  GH_TAG=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'].lstrip('v'))")
  GH_TMP=$(mktemp -d)
  curl -fsSL "https://github.com/cli/cli/releases/latest/download/gh_${GH_TAG}_${GH_ARCH}.zip" -o "$GH_TMP/gh.zip"
  unzip -q "$GH_TMP/gh.zip" -d "$GH_TMP"
  mkdir -p "$HOME/bin" && cp "$GH_TMP"/gh_*/bin/gh "$HOME/bin/gh"
  export PATH="$HOME/bin:$PATH"
  rm -rf "$GH_TMP"
  ok "gh installed to \$HOME/bin"
fi
if gh auth status &>/dev/null; then
  ok "gh already authenticated: $(gh auth status 2>&1 | head -1)"
else
  run "gh auth login"
fi

echo
step "1d. Neon CLI OAuth (opens browser)"
if command -v neonctl &>/dev/null; then
  ok "neonctl already installed: $(neonctl --version 2>/dev/null || echo '?')"
else
  run "npm install -g neonctl"
fi
run "neonctl auth"
run "neonctl me"

echo
step "1e. Databricks CLI OAuth (opens browser)"
if command -v databricks &>/dev/null; then
  ok "databricks already installed: $(databricks --version 2>/dev/null | head -1)"
elif [[ "$DRY_RUN" == "true" ]]; then
  run "# download + install Databricks CLI (official release) to \$HOME/bin"
else
  note "Installing Databricks CLI (official release; no Homebrew required)..."
  DB_ARCH="$(uname -m)"; [[ "$DB_ARCH" == "arm64" ]] && DB_ARCH="arm64" || DB_ARCH="amd64"
  DB_VER=$(curl -fsSL https://api.github.com/repos/databricks/cli/releases/latest \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'].lstrip('v'))")
  DB_TMP=$(mktemp -d)
  curl -fsSL "https://github.com/databricks/cli/releases/download/v${DB_VER}/databricks_cli_${DB_VER}_darwin_${DB_ARCH}.zip" -o "$DB_TMP/db.zip"
  unzip -q "$DB_TMP/db.zip" -d "$DB_TMP"
  mkdir -p "$HOME/bin" && cp "$DB_TMP/databricks" "$HOME/bin/databricks"
  export PATH="$HOME/bin:$PATH"
  rm -rf "$DB_TMP"
  ok "databricks installed to \$HOME/bin ($(databricks --version 2>/dev/null | head -1))"
fi
run "databricks auth login --host '$DATABRICKS_HOST' --profile '$DB_PROFILE'"
run "databricks workspace list / --profile '$DB_PROFILE' 2>&1 | head -3"

echo
step "1f. Python uv (used by the agent build in Phases 4–5)"
if command -v uv &>/dev/null; then
  ok "uv already installed: $(uv --version 2>/dev/null || echo '?')"
elif [[ "$DRY_RUN" == "true" ]]; then
  run "# install uv via astral.sh installer to \$HOME/.local/bin"
else
  note "Installing uv (astral.sh installer; no Homebrew required)..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  ok "uv installed to \$HOME/.local/bin ($(uv --version 2>/dev/null || echo '?'))"
fi

stop_if_done "1"

# ─── Phase 2: Clone and assemble ─────────────────────────────────────────────
header "Phase 2 — Clone and assemble"
confirm_phase "2" || { stop_if_done "2"; exit 0; }

run "git clone --branch genie-agent https://github.com/databrickslabs/firefly.git '$REPO_DIR'"
run "cd '$REPO_DIR'"

echo
step "Push to your GitHub fork (Vercel Git integration needs a repo you own)"
if [[ "${SKIP_GITHUB_PUSH:-0}" == "1" ]]; then
  warn "SKIP_GITHUB_PUSH=1 — skipping fork create/push"
elif [[ "$DRY_RUN" == "true" ]]; then
  run "gh repo create <you>/firefly --private --source '$REPO_DIR' --remote origin-fork --push"
else
  GH_USER=$(gh api user -q .login 2>/dev/null || echo "")
  if [[ -n "$GH_USER" ]]; then
    FORK_REPO="${GITHUB_FORK:-$GH_USER/firefly}"
    if gh repo view "$FORK_REPO" &>/dev/null; then
      git -C "$REPO_DIR" remote add origin-fork "https://github.com/${FORK_REPO}.git" 2>/dev/null || true
      git -C "$REPO_DIR" push -u origin-fork genie-agent
    else
      gh repo create "$FORK_REPO" --private --source "$REPO_DIR" --remote origin-fork --push
    fi
    ok "Vercel will link to github.com/$FORK_REPO"
  else
    warn "Could not detect GitHub user — set GITHUB_FORK=<owner>/firefly or run 'gh auth login'"
  fi
fi

echo
step "Submodule init (must run before assemble_agent.sh)"
run "git -C '$REPO_DIR' submodule update --init"

echo
step "First assemble (before quickstart)"
run "bash '$REPO_DIR/scripts/assemble_agent.sh'"

stop_if_done "2"

# ─── Phase 3: Provision Databricks resources ──────────────────────────────────
header "Phase 3 — Provision Databricks resources"
confirm_phase "3" || { stop_if_done "3"; exit 0; }

echo
step "3a. quickstart — MLflow experiment + Lakebase (--python 3.12 required)"
run "cd '$REPO_DIR/agent-build' && uv run --python 3.12 python scripts/quickstart.py \
  --profile '$DB_PROFILE' --lakebase-create-new '$LAKEBASE_NAME'"

echo
step "3b. Catalog/schema → bundle vars (applied at deploy; no yml edit)"
note "HOST/WORKSPACE_ID/GENIE_ONE_URL are injected by quickstart."
note "catalog=$UC_CATALOG schema=$UC_SCHEMA are passed via --var at deploy (Phase 4);"
note "DATABRICKS_MEMORY_STORE resolves to $UC_CATALOG.$UC_SCHEMA.firefly_managed_memory."

echo
step "3c. Create UC wheels volume"
run "databricks volumes create '$UC_CATALOG' '$UC_SCHEMA' firefly_wheels MANAGED \
  --profile '$DB_PROFILE'"

echo
step "3d. Vendor cp311 wheels (required for offline build)"
run "cd '$REPO_DIR/agent-build' && bash scripts/vendor_wheels.sh"

echo
step "3e. Verify sync.exclude rules"
if [[ "$DRY_RUN" == "false" ]]; then
  YML="$REPO_DIR/agent/databricks.yml"
  if grep -q 'pyproject.toml' "$YML"; then
    fail "pyproject.toml is in sync.exclude — remove it"
  else
    ok "pyproject.toml not in sync.exclude"
  fi
  if ! grep -q 'uv.lock' "$YML"; then
    warn "uv.lock is NOT in sync.exclude — add it so build runs plain uv sync"
  else
    ok "uv.lock is in sync.exclude"
  fi
  if grep -q 'vendor-wheels' "$YML"; then
    fail "vendor-wheels/** is in sync.exclude — remove it so wheels upload"
  else
    ok "vendor-wheels/** not in sync.exclude"
  fi
else
  run "grep -n 'exclude' '$REPO_DIR/agent/databricks.yml' || true"
fi

stop_if_done "3"

# ─── Phase 4: Deploy agent app ────────────────────────────────────────────────
header "Phase 4 — Deploy agent app"
confirm_phase "4" || { stop_if_done "4"; exit 0; }

step "Bundle deploy + run (from agent-build/; do NOT re-run assemble_agent.sh)"
note "assemble_agent.sh already ran in Phase 2; re-running would wipe quickstart's .env and wheels."
BUNDLE_VARS="--var catalog=$UC_CATALOG --var schema=$UC_SCHEMA"
run "cd '$REPO_DIR/agent-build' && databricks bundle deploy --profile '$DB_PROFILE' -t dev $BUNDLE_VARS"
run "cd '$REPO_DIR/agent-build' && databricks bundle run agent_openai_agents_sdk --profile '$DB_PROFILE' -t dev $BUNDLE_VARS"

echo
step "Poll until app_status.state = RUNNING (deployment state leads by ~44s)"
if [[ "$DRY_RUN" == "false" ]]; then
  for i in $(seq 1 24); do
    STATE=$(databricks apps get "$AGENT_APP_NAME" -o json --profile "$DB_PROFILE" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); \
          print(d['app_status']['state'])" 2>/dev/null || echo "UNKNOWN")
    echo "  [$i/24] app_status.state = $STATE"
    [[ "$STATE" == "RUNNING" ]] && { ok "App is RUNNING"; break; }
    [[ "$STATE" == "CRASHED" || "$STATE" == "UNAVAILABLE" ]] && \
      { fail "App $STATE — check: databricks apps logs $AGENT_APP_NAME --profile $DB_PROFILE"; exit 1; }
    sleep 30
  done
else
  run "databricks apps get '$AGENT_APP_NAME' -o json --profile '$DB_PROFILE' \
    | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['app_status']['state'])\""
fi

stop_if_done "4"

# ─── Phase 5: UC managed memory ───────────────────────────────────────────────
header "Phase 5 — UC managed memory"
confirm_phase "5" || { stop_if_done "5"; exit 0; }

capture SP_CLIENT_ID \
  "databricks apps get '$AGENT_APP_NAME' -o json --profile '$DB_PROFILE' \
    | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['service_principal_client_id'])\""
note "App service principal: $SP_CLIENT_ID"

run "cd '$REPO_DIR/agent-build' && \
  uv run --python 3.12 python scripts/setup_memory_store.py '$SP_CLIENT_ID' \
    --memory-store '$UC_CATALOG.$UC_SCHEMA.firefly_managed_memory' \
    --profile '$DB_PROFILE'"

stop_if_done "5"

# ─── Phase 6: Grant SP data access ────────────────────────────────────────────
header "Phase 6 — Grant agent SP access to data"
confirm_phase "6" || { stop_if_done "6"; exit 0; }

note "Granting USE CATALOG on $UC_CATALOG..."
run "databricks api patch '/api/2.1/unity-catalog/permissions/catalog/$UC_CATALOG' \
  --profile '$DB_PROFILE' \
  --json '{\"changes\":[{\"principal\":\"$SP_CLIENT_ID\",\"add\":[\"USE CATALOG\"]}]}'"

capture WAREHOUSE_ID \
  "databricks warehouses list -o json --profile '$DB_PROFILE' \
    | python3 -c \"import sys,json; ws=json.load(sys.stdin); print(ws[0]['id'] if ws else '')\""

if [[ -n "$WAREHOUSE_ID" && "$WAREHOUSE_ID" != "<WAREHOUSE_ID-placeholder>" ]]; then
  note "Granting CAN_USE on warehouse $WAREHOUSE_ID..."
  run "databricks api patch \
    \"/api/2.0/permissions/warehouses/$WAREHOUSE_ID\" \
    --profile '$DB_PROFILE' \
    --json '{\"access_control_list\":[{\"service_principal_name\":\"$SP_CLIENT_ID\", \
      \"permission_level\":\"CAN_USE\"}]}'"
else
  warn "No warehouse found. Create one and grant CAN_USE manually."
fi

note "Grant USE SCHEMA + SELECT on your data schemas via a SQL warehouse:"
note "  GRANT USE SCHEMA, SELECT ON SCHEMA $UC_CATALOG.your_schema TO \`$SP_CLIENT_ID\`;"

stop_if_done "6"

# ─── Phase 6b: Create guest SP with M2M credentials ──────────────────────────
header "Phase 6b — Create guest service principal"
confirm_phase "6b" || { stop_if_done "6b"; exit 0; }

step "Create workspace SP"
if [[ "$DRY_RUN" == "false" ]]; then
  GUEST_SP_RESP=$(databricks service-principals create \
    --display-name "firefly-guest-sp" \
    -o json \
    --profile "$DB_PROFILE")
  # CLI returns SCIM camelCase: applicationId, not application_id
  GUEST_SP_CLIENT_ID=$(echo "$GUEST_SP_RESP" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['applicationId'])")
  GUEST_SP_NUM_ID=$(echo "$GUEST_SP_RESP" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  ok "Guest SP client ID: $GUEST_SP_CLIENT_ID"
  ok "Guest SP numeric ID: $GUEST_SP_NUM_ID"
else
  run "databricks service-principals create --display-name 'firefly-guest-sp' -o json --profile '$DB_PROFILE'"
  GUEST_SP_CLIENT_ID="<guest-sp-client-id>"
  GUEST_SP_NUM_ID="<guest-sp-num-id>"
fi

echo
step "Generate OAuth M2M secret at workspace level (no account console needed)"
if [[ "$DRY_RUN" == "false" ]]; then
  GUEST_SP_SECRET=$(databricks service-principal-secrets-proxy create \
    "$GUEST_SP_NUM_ID" -o json --profile "$DB_PROFILE" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['secret'])")

  store_secret GUEST_SP_CLIENT_ID "$GUEST_SP_CLIENT_ID"
  store_secret GUEST_SP_SECRET "$GUEST_SP_SECRET"
else
  run "databricks service-principal-secrets-proxy create '\$GUEST_SP_NUM_ID' -o json --profile '$DB_PROFILE'"
  run "store_secret GUEST_SP_CLIENT_ID <id> && store_secret GUEST_SP_SECRET <secret>  # → state.env"
fi

echo
step "Grant guest SP warehouse + agent app CAN_USE"
if [[ -n "$WAREHOUSE_ID" && "$WAREHOUSE_ID" != "<WAREHOUSE_ID-placeholder>" ]]; then
  note "Granting CAN_USE on warehouse $WAREHOUSE_ID for guest SP..."
  run "databricks api patch \
    \"/api/2.0/permissions/warehouses/$WAREHOUSE_ID\" \
    --profile '$DB_PROFILE' \
    --json '{\"access_control_list\":[{\"service_principal_name\":\"$GUEST_SP_CLIENT_ID\", \
      \"permission_level\":\"CAN_USE\"}]}'"
else
  warn "WAREHOUSE_ID not set (run Phase 6 first). Grant guest SP warehouse CAN_USE manually."
fi

note "Granting CAN_USE on agent app $AGENT_APP_NAME for guest SP..."
run "databricks api patch \
  \"/api/2.0/permissions/apps/$AGENT_APP_NAME\" \
  --profile '$DB_PROFILE' \
  --json '{\"access_control_list\":[{\"service_principal_name\":\"$GUEST_SP_CLIENT_ID\", \
    \"permission_level\":\"CAN_USE\"}]}'"

note "Grant USE CATALOG / USE SCHEMA / SELECT via SQL warehouse if not already done:"
note "  GRANT USE CATALOG ON CATALOG $UC_CATALOG TO \`$GUEST_SP_CLIENT_ID\`;"
note "  GRANT USE SCHEMA, SELECT ON SCHEMA $UC_CATALOG.$UC_SCHEMA TO \`$GUEST_SP_CLIENT_ID\`;"

stop_if_done "6b"

# ─── Phase 7: Neon database ───────────────────────────────────────────────────
header "Phase 7 — Neon database"
confirm_phase "7" || { stop_if_done "7"; exit 0; }

note "Using neonctl credentials from Phase 1b (no API key needed)"

note "Fetching Neon org ID..."
if [[ "$DRY_RUN" == "false" ]]; then
  ORG_ID=$(neonctl orgs list --output json 2>/dev/null \
    | python3 -c "import sys,json; orgs=json.load(sys.stdin); print(orgs[0]['id'] if orgs else '')" \
    || echo "")
  note "Org ID: ${ORG_ID:-<personal account, no org>}"
else
  run "neonctl orgs list --output json"
  ORG_ID="<org-id>"
fi

note "Creating Neon project..."
if [[ "$DRY_RUN" == "false" ]]; then
  if [[ -n "$ORG_ID" ]]; then
    PROJECT_ID=$(neonctl projects create --name "$NEON_PROJECT_NAME" \
      --org-id "$ORG_ID" --output json \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('project',{}).get('id') or d.get('id',''))")
  else
    PROJECT_ID=$(neonctl projects create --name "$NEON_PROJECT_NAME" \
      --output json \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('project',{}).get('id') or d.get('id',''))")
  fi
  ok "Project created: $PROJECT_ID"

  DB_URL=$(neonctl connection-string --project-id "$PROJECT_ID" --pooled)
  store_secret DATABASE_URL "$DB_URL"
else
  run "neonctl projects create --name '$NEON_PROJECT_NAME' --output json"
  run "neonctl connection-string --project-id '<project-id>' --pooled"
fi

echo
step "Drizzle migrations"
if [[ "$DRY_RUN" == "false" ]]; then
  run "cd '$REPO_DIR' && pnpm install"
  read_secret DB_URL "firefly-bootstrap" "DATABASE_URL"
  run "cd '$REPO_DIR' && DATABASE_URL='$DB_URL' node_modules/.bin/drizzle-kit push"
else
  run "cd '$REPO_DIR' && pnpm install"
  run "cd '$REPO_DIR' && source .firefly-bootstrap/state.env && node_modules/.bin/drizzle-kit push"
fi

stop_if_done "7"

# ─── Phase 8: Vercel frontend ─────────────────────────────────────────────────
header "Phase 8 — Vercel frontend"
confirm_phase "8" || { stop_if_done "8"; exit 0; }

step "8a. Link Vercel project"
run "cd '$REPO_DIR' && vercel link --project '$VERCEL_PROJECT' --scope '$VERCEL_TEAM' --yes"

echo
step "8b. Generate secrets"
if [[ "$DRY_RUN" == "false" ]]; then
  BETTER_AUTH_SECRET=$(openssl rand -base64 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  GUEST_API_SECRET=$(openssl rand -hex 64)
  AGENT_APP_URL=$(databricks apps get "$AGENT_APP_NAME" -o json --profile "$DB_PROFILE" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))")
  read_secret DB_URL "firefly-bootstrap" "DATABASE_URL"
else
  BETTER_AUTH_SECRET="<random-base64>"
  ENCRYPTION_KEY="<random-hex>"
  GUEST_API_SECRET="<random-hex>"
  AGENT_APP_URL="<databricks-app-url>"
  DB_URL="<neon-connection-string>"
fi

step "8b. Tier 1 env vars — required for guest login"
note "DO NOT set NEXT_PUBLIC_BETTER_AUTH_URL — causes CORS failures on preview deployments"
note "Omit SPN_AUTH_OKTA_* entirely — the plugin is conditional; absent vars are skipped"

for SCOPE in preview production; do
  note "Setting tier-1 vars for scope: $SCOPE"
  run "vercel env add DATABRICKS_AGENT_APP_URL  $SCOPE <<< '$AGENT_APP_URL'"
  run "vercel env add DATABASE_URL              $SCOPE <<< '$DB_URL'"
  run "vercel env add BETTER_AUTH_SECRET        $SCOPE <<< '$BETTER_AUTH_SECRET'"
  # preview's BETTER_AUTH_URL is set AFTER deploy (step 8e) to the real serving
  # origin — a pre-deploy guess breaks guest one-time-token verification (#19).
  # production's canonical domain is stable, so set it here.
  [[ "$SCOPE" == "production" ]] && \
    run "vercel env add BETTER_AUTH_URL         $SCOPE <<< 'https://$VERCEL_PROJECT.vercel.app'"
  run "vercel env add ENCRYPTION_KEY            $SCOPE <<< '$ENCRYPTION_KEY'"
  run "vercel env add NEXT_PUBLIC_AGENT_ENABLED $SCOPE <<< 'true'"
  run "vercel env add GUEST_API_SECRET          $SCOPE <<< '$GUEST_API_SECRET'"
  run "vercel env add SPN_AUTH_DATABRICKS_ACCOUNTS_URL  $SCOPE <<< 'https://accounts.cloud.databricks.com'"
  run "vercel env add SPN_AUTH_DATABRICKS_WORKSPACE_URL $SCOPE <<< '$DATABRICKS_HOST'"
done

echo
step "8b. Tier 2 env vars — admin Databricks OAuth (placeholder is safe for guest-only)"
note "genericOAuth receives these as a plain object — undefined does NOT crash the build."
note "Admin login will 404 at runtime with placeholders, but guest flow is unaffected."
for SCOPE in preview production; do
  run "vercel env add DATABRICKS_U2M_CLIENT_ID     $SCOPE <<< 'placeholder'"
  run "vercel env add DATABRICKS_U2M_CLIENT_SECRET $SCOPE <<< 'placeholder'"
  run "vercel env add DATABRICKS_ACCOUNT_ID        $SCOPE <<< '$DATABRICKS_ACCOUNT_ID'"
  run "vercel env add SPN_AUTH_DATABRICKS_ACCOUNT_ID $SCOPE <<< '$DATABRICKS_ACCOUNT_ID'"
done
note "To enable admin login later: replace 'placeholder' with real OAuth app credentials"
note "from: accounts.cloud.databricks.com → App connections → Register an app"

echo
step "8c. Disable preview SSO protection"
run "vercel project protection disable '$VERCEL_PROJECT' --sso --scope '$VERCEL_TEAM'"

echo
step "8d. Deploy — phase 1 of 2: discover the real URL and pin a stable alias"
note "Vercel may serve at a suffixed domain if the project name was taken; never guess it (#19)."
STABLE_ALIAS="${VERCEL_PROJECT}.vercel.app"
if [[ "$DRY_RUN" == "false" ]]; then
  DEPLOY_URL=$(vercel deploy --scope "$VERCEL_TEAM" 2>&1 | grep -oE 'https://[^ ]*\.vercel\.app' | tail -1)
  ok "Deployment URL: $DEPLOY_URL"
  # Pin a stable alias so BETTER_AUTH_URL stays valid across the redeploy below.
  vercel alias set "$DEPLOY_URL" "$STABLE_ALIAS" --scope "$VERCEL_TEAM"
  PREVIEW_URL="https://$STABLE_ALIAS"
  ok "Stable alias: $PREVIEW_URL"
else
  run "vercel deploy --scope '$VERCEL_TEAM'                       # capture DEPLOY_URL"
  run "vercel alias set <DEPLOY_URL> '$STABLE_ALIAS' --scope '$VERCEL_TEAM'"
  PREVIEW_URL="https://$STABLE_ALIAS"
fi

echo
step "8e. Deploy — phase 2 of 2: set BETTER_AUTH_URL to the real URL, then redeploy"
note "BETTER_AUTH_URL is read at runtime; it must equal the origin the guest actually opens (#19)."
if [[ "$DRY_RUN" == "false" ]]; then
  vercel env rm  BETTER_AUTH_URL preview --yes --scope "$VERCEL_TEAM" 2>/dev/null || true
  vercel env add BETTER_AUTH_URL preview --scope "$VERCEL_TEAM" <<< "$PREVIEW_URL"
  # Redeploy so the running deployment serves BETTER_AUTH_URL=$PREVIEW_URL, then re-point the alias.
  DEPLOY_URL2=$(vercel deploy --scope "$VERCEL_TEAM" 2>&1 | grep -oE 'https://[^ ]*\.vercel\.app' | tail -1)
  vercel alias set "$DEPLOY_URL2" "$STABLE_ALIAS" --scope "$VERCEL_TEAM"
  ok "Redeployed; $PREVIEW_URL now serves BETTER_AUTH_URL=$PREVIEW_URL"
  store_secret PREVIEW_URL "$PREVIEW_URL"
  store_secret GUEST_API_SECRET "$GUEST_API_SECRET"
else
  run "vercel env rm BETTER_AUTH_URL preview --yes; vercel env add BETTER_AUTH_URL preview <<< '$PREVIEW_URL'"
  run "vercel deploy --scope '$VERCEL_TEAM'                       # capture DEPLOY_URL2"
  run "vercel alias set <DEPLOY_URL2> '$STABLE_ALIAS' --scope '$VERCEL_TEAM'"
  PREVIEW_URL="https://$STABLE_ALIAS"
fi

stop_if_done "8"

# ─── Phase 9: Verify ─────────────────────────────────────────────────────────
header "Phase 9 — Verify"
confirm_phase "9" || { stop_if_done "9"; exit 0; }

if [[ "$DRY_RUN" == "false" ]]; then
  read_secret PREVIEW_URL "firefly-bootstrap" "PREVIEW_URL" 2>/dev/null || {
    read -rp "  Paste the Vercel preview URL: " PREVIEW_URL
  }
fi

step "App health check"
run "databricks apps get '$AGENT_APP_NAME' -o json --profile '$DB_PROFILE' \
  | python3 -c \"import sys,json; d=json.load(sys.stdin); \
      state=d['app_status']['state']; \
      print('app_status:', state); \
      exit(0 if state=='RUNNING' else 1)\""

echo
step "Guest login smoke test"
if [[ "$DRY_RUN" == "false" ]]; then
  read_secret GUEST_API_SECRET_ "firefly-bootstrap" "GUEST_API_SECRET" 2>/dev/null || \
    GUEST_API_SECRET_="$GUEST_API_SECRET"
  read_secret GUEST_SP_CLIENT_ID "firefly-bootstrap" "GUEST_SP_CLIENT_ID"
  read_secret GUEST_SP_SECRET_VAL "firefly-bootstrap" "GUEST_SP_SECRET"
  WS=$(curl -sf -X POST "$PREVIEW_URL/api/guest/workspaces" \
    -H "X-API-Key: $GUEST_API_SECRET_" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Bootstrap test\",\"workspaceUrl\":\"$DATABRICKS_HOST\"}")
  WS_ID=$(echo "$WS" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace']['id'])")
  ok "Workspace record created: $WS_ID"

  SPN=$(curl -sf -X POST "$PREVIEW_URL/api/guest/spns" \
    -H "X-API-Key: $GUEST_API_SECRET_" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Bootstrap SPN\",\"clientId\":\"$GUEST_SP_CLIENT_ID\", \
         \"clientSecret\":\"$GUEST_SP_SECRET_VAL\",\"guestWorkspaceId\":\"$WS_ID\"}")
  SPN_ID=$(echo "$SPN" | python3 -c "import sys,json; print(json.load(sys.stdin)['spn']['id'])")
  ok "SPN record created: $SPN_ID"

  GU=$(curl -sf -X POST "$PREVIEW_URL/api/guest/users" \
    -H "X-API-Key: $GUEST_API_SECRET_" \
    -H "Content-Type: application/json" \
    -d "{\"orgName\":\"Bootstrap Org\",\"spnId\":\"$SPN_ID\"}")
  LOGIN_URL=$(echo "$GU" | python3 -c "import sys,json; print(json.load(sys.stdin)['guestUser']['loginUrl'])")
  ok "Guest login URL: $LOGIN_URL"
  echo
  note "Open this URL in a browser, sign in, open the Agent panel, and ask a question over your data."
  note "Then start a new chat and ask the same fact back — to verify cross-session memory recall."
else
  run "curl -s -X POST '$PREVIEW_URL/api/guest/workspaces' \
    -H 'X-API-Key: \$GUEST_API_SECRET' -H 'Content-Type: application/json' \
    -d '{\"name\":\"Test\",\"workspaceUrl\":\"$DATABRICKS_HOST\"}'"
  run "# → SPN → user → loginUrl"
fi

stop_if_done "9"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo
echo "${bold}${green}╔══════════════════════════════════════════════════════════╗${reset}"
echo "${bold}${green}║  Bootstrap complete.                                      ║${reset}"
echo "${bold}${green}╚══════════════════════════════════════════════════════════╝${reset}"
echo
[[ "$DRY_RUN" == "false" ]] && {
  note "Resources to clean up when done:"
  note "  databricks apps delete $AGENT_APP_NAME --profile $DB_PROFILE"
  note "  databricks bundle destroy --profile $DB_PROFILE -t dev"
  note "  vercel remove $VERCEL_PROJECT --scope $VERCEL_TEAM"
  note "  Neon project: console.neon.tech → delete project"
}

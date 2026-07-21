#!/usr/bin/env bash
# bootstrap.sh — Firefly Genie-Agent interactive setup runner
#
# Usage:
#   bash scripts/bootstrap.sh              # live mode (executes every command)
#   bash scripts/bootstrap.sh --dry-run   # prints commands, no infra touched
#   bash scripts/bootstrap.sh --dry-run --stop-after=3  # stop after Phase 3
#   bash scripts/bootstrap.sh --stop-after=1            # collect inputs + auth only
#   bash scripts/bootstrap.sh --trust-proxy-ca          # auto-trust a detected proxy CA
#
# Mirrors every phase in BOOTSTRAP.md exactly.
# Secrets go straight to macOS Keychain — never printed, never written to files.

set -euo pipefail

# ─── flags ────────────────────────────────────────────────────────────────────
DRY_RUN=false
STOP_AFTER=""
# Non-interactive trust of an auto-detected intercepting-proxy root CA (CI/automation).
# Also honored via env FIREFLY_TRUST_PROXY_CA=1. Off by default → we prompt with the
# root CA's fingerprint before trusting anything.
TRUST_PROXY_CA=false
[[ "${FIREFLY_TRUST_PROXY_CA:-}" == "1" ]] && TRUST_PROXY_CA=true

for arg in "$@"; do
  case $arg in
    --dry-run)         DRY_RUN=true ;;
    --stop-after=*)    STOP_AFTER="${arg#*=}" ;;
    --trust-proxy-ca)  TRUST_PROXY_CA=true ;;
    *) echo "Unknown flag: $arg  (use --dry-run, --stop-after=N, --trust-proxy-ca)"; exit 1 ;;
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
  ok "$varname = $val"
}

ask_secret() {
  local varname="$1" service="$2" prompt="$3"
  local val=""
  while [[ -z "$val" ]]; do
    read -rsp "  ${bold}$prompt${reset} (hidden): " val; echo
    [[ -z "$val" ]] && warn "Required — cannot be empty."
  done
  python3 -c "import keyring; keyring.set_password('$service', '$varname', '''$val''')"
  ok "$varname → keyring[$service]"
}

read_secret() {
  local varname="$1" service="$2" key="$3"
  local val
  val=$(python3 -c "import keyring; v=keyring.get_password('$service','$key'); print(v or '')")
  if [[ -z "$val" ]]; then
    fail "keyring[$service/$key] is empty"
    exit 1
  fi
  eval "$varname='$val'"
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
note "Secrets go directly to macOS Keychain. Nothing is written to disk."
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
# uv ships its OWN bundled cert store (rustls/webpki) and ignores the OS keychain by
# default, so it rejects an intercepting proxy's cert (UnknownIssuer) even when Node
# and keychain-backed tools succeed. UV_SYSTEM_CERTS=1 makes uv trust the platform
# store — harmless off-proxy (the store already trusts public CAs), required on-proxy.
export UV_SYSTEM_CERTS="${UV_SYSTEM_CERTS:-1}"

# TLS trust for intercepting corporate proxies (Zscaler / Databricks Forward Trust /
# etc.). Python (quickstart, Databricks SDK), Node, and uv otherwise reject the proxy's
# cert (UnknownIssuer / not-trusted) and fail or hang. Precedence:
#   1. TLS_PEM_PATH given          → use it verbatim.
#   2. Auto-detect a MITM by probing PyPI against the system trust store; if a PRIVATE
#      root CA is presented, extract it, show CN + SHA-256, confirm (or --trust-proxy-ca),
#      and build a LOCAL bundle (system roots + proxy CAs). System trust is never touched.
#   3. No MITM detected            → nothing to do.
apply_tls_bundle() {   # $1 = pem path — export the trust vars every toolchain reads
  export TLS_PEM_PATH="$1" REQUESTS_CA_BUNDLE="$1" SSL_CERT_FILE="$1" NODE_EXTRA_CA_CERTS="$1"
}

# On success sets PROXY_CA_BUNDLE / PROXY_CA_ADDED / PROXY_CA_ROOT_CN / PROXY_CA_ROOT_FP.
# Returns non-zero if TLS to PyPI already validates (no MITM) or no CA could be derived.
derive_proxy_ca_bundle() {
  local probe="pypi.org"
  # If the system store already validates PyPI, there's no untrusted MITM to handle.
  curl -sSf -o /dev/null --max-time 12 "https://${probe}/simple/" 2>/dev/null && return 1
  local chain tmpd sysbundle capem f added=0 lastca=""
  chain=$(printf '' | openssl s_client -connect "${probe}:443" -showcerts 2>/dev/null) || return 1
  tmpd=$(mktemp -d) || return 1
  awk -v d="$tmpd" '/-----BEGIN CERTIFICATE-----/{n++} n>0{print > (d"/c-" n ".pem")}' <<<"$chain"
  sysbundle=$(python3 -c 'import certifi;print(certifi.where())' 2>/dev/null || echo /etc/ssl/cert.pem)
  [[ -f "$sysbundle" ]] || sysbundle=/etc/ssl/cert.pem
  init_inputs_dir
  capem="$INPUTS_DIR/proxy-ca-bundle.pem"
  cat "$sysbundle" > "$capem"
  # c-1 is the server leaf; every cert after it is a CA in the presented chain.
  for f in "$tmpd"/c-*.pem; do
    [[ "$f" == "$tmpd/c-1.pem" ]] && continue
    openssl x509 -in "$f" -noout >/dev/null 2>&1 || continue
    cat "$f" >> "$capem"; added=$((added+1)); lastca="$f"
  done
  if [[ "$added" -eq 0 || -z "$lastca" ]]; then rm -f "$capem"; rm -rf "$tmpd"; return 1; fi
  PROXY_CA_ROOT_CN=$(openssl x509 -in "$lastca" -noout -subject 2>/dev/null | sed -E 's/.*CN ?= ?//; s#.*/CN=##')
  PROXY_CA_ROOT_FP=$(openssl x509 -in "$lastca" -noout -fingerprint -sha256 2>/dev/null | sed 's/.*=//')
  rm -rf "$tmpd"
  chmod 600 "$capem" 2>/dev/null || true
  PROXY_CA_BUNDLE="$capem"; PROXY_CA_ADDED="$added"
  return 0
}

# uv does NOT read pip.conf or PIP_INDEX_URL (verified). On corporate networks that block
# public PyPI and route pip through an internal mirror (Artifactory/Nexus/…), uv silently
# hits pypi.org and fails — even though the user's `pip` works. Bridge the user's OWN
# already-configured pip index into uv via UV_DEFAULT_INDEX. Never hardcode a mirror.
detect_pip_index() {
  local v f
  if command -v python3 >/dev/null 2>&1; then
    v=$(python3 -m pip config get global.index-url 2>/dev/null | tr -d '[:space:]')
    [[ -n "$v" && "$v" != "None" ]] && { echo "$v"; return; }
  fi
  for f in "${PIP_CONFIG_FILE:-}" "$HOME/.config/pip/pip.conf" "$HOME/.pip/pip.conf" /etc/pip.conf; do
    [[ -f "$f" ]] || continue
    v=$(awk -F= '/^[[:space:]]*index-url[[:space:]]*=/{gsub(/[[:space:]]/,"",$2);print $2; exit}' "$f")
    [[ -n "$v" ]] && { echo "$v"; return; }
  done
}

bridge_pip_index_to_uv() {
  # Respect an explicit uv config the user already set.
  [[ -n "${UV_DEFAULT_INDEX:-}${UV_INDEX_URL:-}" ]] && return 0
  [[ -f "$HOME/.config/uv/uv.toml" ]] && return 0
  local idx; idx=$(detect_pip_index)
  [[ -z "$idx" ]] && return 0
  case "$idx" in *pypi.org/simple*) return 0 ;; esac   # already public PyPI — nothing to bridge
  export UV_DEFAULT_INDEX="$idx"
  PIP_BRIDGED_INDEX="$idx"
}

# corepack fetches the repo's pinned package manager (packageManager: pnpm@10.x) from
# registry.npmjs.org by default. On corporate networks that block public npm this 503s —
# the same failure mode as uv hitting public PyPI. Bridge the user's OWN npm registry into
# corepack via COREPACK_NPM_REGISTRY, and disable the interactive download prompt. Needed
# because pnpm's npm "latest" dist-tag currently resolves to a 12.x ALPHA that ignores
# onlyBuiltDependencies (→ ERR_PNPM_IGNORED_BUILDS); the pin routes us to stable pnpm 10.
detect_npm_registry() {
  local v f
  if command -v npm >/dev/null 2>&1; then
    v=$(npm config get registry 2>/dev/null | tr -d '[:space:]')
    [[ -n "$v" && "$v" != "undefined" ]] && { echo "$v"; return; }
  fi
  for f in "$HOME/.npmrc" "${PREFIX:-/usr/local}/etc/npmrc" /etc/npmrc; do
    [[ -f "$f" ]] || continue
    v=$(awk -F= '/^[[:space:]]*registry[[:space:]]*=/{gsub(/[[:space:]]/,"",$2);print $2; exit}' "$f")
    [[ -n "$v" ]] && { echo "$v"; return; }
  done
}

bridge_npm_registry_to_corepack() {
  export COREPACK_ENABLE_DOWNLOAD_PROMPT="${COREPACK_ENABLE_DOWNLOAD_PROMPT:-0}"
  [[ -n "${COREPACK_NPM_REGISTRY:-}" ]] && return 0
  local reg; reg=$(detect_npm_registry)
  [[ -z "$reg" ]] && return 0
  case "$reg" in *registry.npmjs.org*) return 0 ;; esac   # already public npm — nothing to bridge
  export COREPACK_NPM_REGISTRY="$reg"
  NPM_BRIDGED_REGISTRY="$reg"
}

if [[ -n "${TLS_PEM_PATH:-}" && -f "${TLS_PEM_PATH}" ]]; then
  apply_tls_bundle "$TLS_PEM_PATH"
  ok "TLS trust from TLS_PEM_PATH → SSL_CERT_FILE / REQUESTS_CA_BUNDLE / NODE_EXTRA_CA_CERTS"
elif [[ "$DRY_RUN" == "true" ]]; then
  run "# detect intercepting proxy; if a private CA is presented, confirm + build a local bundle"
elif derive_proxy_ca_bundle; then
  warn "Intercepting HTTPS proxy detected — its chain terminates in a PRIVATE root CA:"
  note "  Root CN:    ${PROXY_CA_ROOT_CN:-<unknown>}"
  note "  SHA-256:    ${PROXY_CA_ROOT_FP:-<unknown>}"
  note "  Bundle:     $PROXY_CA_BUNDLE  (system roots + ${PROXY_CA_ADDED} proxy CA cert(s))"
  APPROVE_CA=n
  if [[ "$TRUST_PROXY_CA" == "true" ]]; then
    APPROVE_CA=y
    note "  --trust-proxy-ca set → trusting automatically."
  else
    echo "  ${bold}Trust this ONLY if the SHA-256 matches your organization's known root CA.${reset}"
    read -rp "  ${bold}Trust this CA for this setup? [y/N]:${reset} " APPROVE_CA
  fi
  if [[ "$APPROVE_CA" =~ ^[Yy]$ ]]; then
    apply_tls_bundle "$PROXY_CA_BUNDLE"
    ok "TLS trust → SSL_CERT_FILE / REQUESTS_CA_BUNDLE / NODE_EXTRA_CA_CERTS (+ UV_SYSTEM_CERTS)"
  else
    warn "Declined. If installs fail with cert errors, re-run with TLS_PEM_PATH=<your bundle>."
  fi
else
  ok "No intercepting proxy detected (TLS to PyPI validates against the system store)."
fi

# Bridge the user's existing pip index mirror into uv (uv ignores pip.conf).
if [[ "$DRY_RUN" == "true" ]]; then
  run "# if pip is configured with a custom index-url, export UV_DEFAULT_INDEX to match"
else
  bridge_pip_index_to_uv
  if [[ -n "${PIP_BRIDGED_INDEX:-}" ]]; then
    ok "uv index bridged from pip config → UV_DEFAULT_INDEX=$PIP_BRIDGED_INDEX"
  elif [[ -n "${UV_DEFAULT_INDEX:-}${UV_INDEX_URL:-}" ]]; then
    note "uv index already set via env — leaving as-is."
  fi
fi

# Bridge the user's existing npm registry mirror into corepack (for the repo's pinned pnpm).
if [[ "$DRY_RUN" == "true" ]]; then
  run "# if npm has a custom registry, export COREPACK_NPM_REGISTRY to match (+ disable download prompt)"
else
  bridge_npm_registry_to_corepack
  if [[ -n "${NPM_BRIDGED_REGISTRY:-}" ]]; then
    ok "corepack registry bridged from npm config → COREPACK_NPM_REGISTRY=$NPM_BRIDGED_REGISTRY"
  elif [[ -n "${COREPACK_NPM_REGISTRY:-}" ]]; then
    note "corepack registry already set via env — leaving as-is."
  fi
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
step "1a. Databricks CLI OAuth (opens browser)"
run "databricks auth login --host '$DATABRICKS_HOST' --profile '$DB_PROFILE'"
run "databricks workspace list / --profile '$DB_PROFILE' 2>&1 | head -3"

echo
step "1b. Neon CLI OAuth (opens browser)"
if command -v neonctl &>/dev/null; then
  ok "neonctl already installed: $(neonctl --version 2>/dev/null || echo '?')"
else
  run "brew install neonctl"
fi
run "neonctl auth"
run "neonctl me"

echo
step "1c. Vercel CLI OAuth (opens browser)"
run "vercel login"
run "vercel whoami"

echo
step "1d. pnpm (corepack-managed; repo pins pnpm 10 via packageManager)"
# pnpm's npm "latest" dist-tag currently resolves to a 12.x ALPHA that breaks installs
# (ignores onlyBuiltDependencies → ERR_PNPM_IGNORED_BUILDS). Prefer corepack, which honors
# the repo's `packageManager: pnpm@10.x` pin and fetches that exact version on demand
# (via COREPACK_NPM_REGISTRY + NODE_EXTRA_CA_CERTS set in Phase 0).
if command -v corepack &>/dev/null; then
  run "corepack enable --install-directory '$HOME/bin'"
  note "corepack enabled → pnpm version pinned by the repo's packageManager field."
elif command -v pnpm &>/dev/null; then
  ok "pnpm already installed: $(pnpm --version 2>/dev/null || echo '?')"
else
  run "npm install -g pnpm@10"   # avoid the 12.x alpha on the 'latest' tag
fi

echo
step "1d. GitHub CLI"
if gh auth status &>/dev/null; then
  ok "gh already authenticated: $(gh auth status 2>&1 | head -1)"
else
  run "gh auth login"
fi

stop_if_done "1"

# ─── Phase 2: Clone and assemble ─────────────────────────────────────────────
header "Phase 2 — Clone and assemble"
confirm_phase "2" || { stop_if_done "2"; exit 0; }

run "git clone --branch genie-agent https://github.com/databrickslabs/firefly.git '$REPO_DIR'"
run "cd '$REPO_DIR'"

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
step "3b. Check catalog/schema bundle variables"
note "HOST/WORKSPACE_ID/GENIE_ONE_URL are injected by quickstart — no manual edits needed."
if [[ "$UC_CATALOG" != "workspace" || "$UC_SCHEMA" != "default" ]]; then
  warn "UC_CATALOG=$UC_CATALOG UC_SCHEMA=$UC_SCHEMA differ from bundle defaults."
  warn "Edit agent-build/databricks.yml: update catalog/schema vars and DATABRICKS_MEMORY_STORE."
  [[ "$DRY_RUN" == "true" ]] && \
    run "# Edit catalog/schema in '$REPO_DIR/agent-build/databricks.yml'"
else
  ok "Catalog/schema match bundle defaults (workspace/default) — no yml edits needed."
fi

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
run "cd '$REPO_DIR/agent-build' && databricks bundle deploy --profile '$DB_PROFILE' -t dev"
run "cd '$REPO_DIR/agent-build' && databricks bundle run agent_openai_agents_sdk --profile '$DB_PROFILE' -t dev"

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

  python3 -c "import keyring; keyring.set_password('firefly-bootstrap','GUEST_SP_CLIENT_ID','$GUEST_SP_CLIENT_ID')"
  python3 -c "import keyring; keyring.set_password('firefly-bootstrap','GUEST_SP_SECRET','$GUEST_SP_SECRET')"
  ok "GUEST_SP_CLIENT_ID + GUEST_SP_SECRET → keyring[firefly-bootstrap]"
else
  run "databricks service-principal-secrets-proxy create '\$GUEST_SP_NUM_ID' -o json --profile '$DB_PROFILE'"
  run "keyring set firefly-bootstrap GUEST_SP_CLIENT_ID && keyring set firefly-bootstrap GUEST_SP_SECRET"
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
      | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  else
    PROJECT_ID=$(neonctl projects create --name "$NEON_PROJECT_NAME" \
      --output json \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  fi
  ok "Project created: $PROJECT_ID"

  DB_URL=$(neonctl connection-string --project-id "$PROJECT_ID" --pooled)
  python3 -c "import keyring; keyring.set_password('firefly-bootstrap', 'DATABASE_URL', '$DB_URL')"
  ok "DATABASE_URL → keyring[firefly-bootstrap]"
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
  run "cd '$REPO_DIR' && DATABASE_URL=\$(keyring get firefly-bootstrap DATABASE_URL) node_modules/.bin/drizzle-kit push"
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
  run "vercel env add BETTER_AUTH_URL           $SCOPE <<< 'https://$VERCEL_PROJECT.vercel.app'"
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
step "8d. Deploy"
if [[ "$DRY_RUN" == "false" ]]; then
  PREVIEW_URL=$(vercel deploy --scope "$VERCEL_TEAM" 2>&1 | grep -E 'https://' | tail -1)
  ok "Preview URL: $PREVIEW_URL"
  python3 -c "import keyring; keyring.set_password('firefly-bootstrap', 'PREVIEW_URL', '$PREVIEW_URL')"
  python3 -c "import keyring; keyring.set_password('firefly-bootstrap', 'GUEST_API_SECRET', '$GUEST_API_SECRET')"
else
  run "vercel deploy --scope '$VERCEL_TEAM'"
  PREVIEW_URL="<preview-url>"
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
  GUEST_SP_CLIENT_ID=$(python3 -c "import keyring; print(keyring.get_password('firefly-bootstrap','GUEST_SP_CLIENT_ID') or '')")
  GUEST_SP_SECRET_VAL=$(python3 -c "import keyring; print(keyring.get_password('firefly-bootstrap','GUEST_SP_SECRET') or '')")
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

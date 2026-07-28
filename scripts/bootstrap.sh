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
# Secrets persist in a gitignored, chmod-600 .firefly-bootstrap/state.env under the repo.

set -euo pipefail

# ─── flags ────────────────────────────────────────────────────────────────────
DRY_RUN=false
STOP_AFTER=""
CHECK_PYPI_PROXY=false
# Non-interactive trust of an auto-detected intercepting-proxy root CA (CI/automation).
# Also honored via env FIREFLY_TRUST_PROXY_CA=1. Off by default → we prompt with the
# root CA's fingerprint before trusting anything.
TRUST_PROXY_CA=false
[[ "${FIREFLY_TRUST_PROXY_CA:-}" == "1" ]] && TRUST_PROXY_CA=true
# Branch of databrickslabs/firefly to clone in Phase 2 (app code).
FIREFLY_BRANCH="${FIREFLY_BRANCH:-genie-agent}"

for arg in "$@"; do
  case $arg in
    --dry-run)         DRY_RUN=true ;;
    --stop-after=*)    STOP_AFTER="${arg#*=}" ;;
    --trust-proxy-ca)  TRUST_PROXY_CA=true ;;
    --check-pypi-proxy) CHECK_PYPI_PROXY=true ;;
    *) echo "Unknown flag: $arg  (use --dry-run, --stop-after=N, --trust-proxy-ca, --check-pypi-proxy)"; exit 1 ;;
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

BOOTSTRAP_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/corp-network.sh
source "$BOOTSTRAP_SCRIPT_DIR/lib/corp-network.sh"
# shellcheck source=scripts/lib/runbook.sh
source "$BOOTSTRAP_SCRIPT_DIR/lib/runbook.sh"

if [[ "$CHECK_PYPI_PROXY" == "true" ]]; then
  check_pypi_proxy_state "${REPO_DIR:-$PWD}"
  ok "PyPI proxy config and checked uv.lock files are safe"
  exit 0
fi

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

# Secret storage lives in scripts/lib/runbook.sh (store_secret / read_secret /
# require_secret / load_secrets / init_state_dir), sourced above. BOOTSTRAP.md
# sources the same file, so the runbook and this runner cannot drift apart —
# which is exactly how the markdown ended up calling helpers that existed only
# here, with a signature its own call sites could not use.

ask_secret() {                        # ask_secret VARNAME <ignored> PROMPT
  local varname="$1" prompt="$3"
  local val=""
  while [[ -z "$val" ]]; do
    read -rsp "  ${bold}$prompt${reset} (hidden): " val; echo
    [[ -z "$val" ]] && warn "Required — cannot be empty."
  done
  store_secret "$varname" "$val"
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

# Track completed phases as a set (handles non-numeric ids like "6b"). Used to reword a
# phase prompt as "Re-execute" on a resumed run, so a redeploy is a conscious choice.
phase_done() { case " ${COMPLETED_PHASES:-} " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
mark_phase_done() {
  phase_done "$1" || COMPLETED_PHASES="${COMPLETED_PHASES:+$COMPLETED_PHASES }$1"
  store_input COMPLETED_PHASES "$COMPLETED_PHASES"
  store_input LAST_COMPLETED_PHASE "$1"   # retained for backward-compatible state files
}

reset_inputs() { rm -f "$INPUTS_FILE"; unset LAST_COMPLETED_PHASE COMPLETED_PHASES; }

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
  [[ -n "${COMPLETED_PHASES:-}" ]] && note "Previously completed phases: ${COMPLETED_PHASES} (re-running any is a redeploy)."
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

# Returns 0 (true) when the user wants to EXECUTE the phase body, 1 (false) otherwise.
# Completed phases default to SKIP (Enter breezes past on a resumed run); pending phases
# default to EXECUTE. run_phase() interprets a false return as skip-vs-stop.
confirm_phase() {
  local phase="$1" ok_
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  ${yellow}[DRY-RUN]${reset} Would execute Phase $phase"
    return 0
  fi
  echo
  if phase_done "$phase"; then
    note "Phase $phase already completed in a previous run — Enter SKIPS it (resume forward); 'y' re-executes (idempotent redeploy)."
    read -rp "  ${bold}Re-execute Phase $phase?${reset} [y/N]: " ok_
    [[ "$ok_" =~ ^[Yy]$ ]]
  else
    read -rp "  Execute Phase $phase? [Y/n]: " ok_
    [[ ! "$ok_" =~ ^[Nn]$ ]]
  fi
}

# Phase gate with skip-forward resume (#18). Wrap each phase body as:
#     if run_phase "N"; then
#       <body>
#     fi
#     stop_if_done "N"
#   • execute (user accepts)                → run body
#   • completed + declined (default on re-run) → SKIP body, advance to next phase
#   • pending  + declined                   → deliberate STOP (exit; re-run resumes)
run_phase() {
  local phase="$1"
  if confirm_phase "$phase"; then
    return 0
  fi
  if phase_done "$phase"; then
    note "⏭  Skipping Phase $phase (already completed) — resuming forward."
    return 1
  fi
  echo
  echo "${yellow}Stopped at Phase $phase (declined). Re-run to resume from here.${reset}"
  exit 0
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
# Users often paste the full browser URL (…/?autoLogin=true&o=…&email=…). The Databricks
# SDK reads DATABRICKS_HOST with precedence over the profile, and a query/path on the host
# breaks host-metadata resolution ("Expecting value: line 1 column 1"). Keep only scheme://host.
DATABRICKS_HOST=$(printf '%s' "$DATABRICKS_HOST" | sed -E 's|^(https?://[^/?#]+).*|\1|')
store_input DATABRICKS_HOST "$DATABRICKS_HOST"
validate_url "$DATABRICKS_HOST"

ask DB_PROFILE       "Databricks CLI profile name"      "firefly-deploy"
ask UC_CATALOG       "Unity Catalog catalog"            "workspace"
ask UC_SCHEMA        "Unity Catalog schema"             "default"

# Phase 6c inputs. Asked here, with everything else, because Phase 0 is the only
# place the runbook is allowed to block on a question (#83). Seeding only ever
# acts on an EMPTY schema and never overwrites a table, which is what makes `yes`
# a safe default.
ask SEED_SAMPLE_DATA "Seed samples.wanderbricks if $UC_CATALOG.$UC_SCHEMA is empty? (yes/no)" "yes"
ask GENIE_SPACE_IDS  "Existing Genie space id(s) to use, comma-separated (None = create one)" "None"
case "$(printf '%s' "${GENIE_SPACE_IDS:-None}" | tr 'A-Z' 'a-z')" in
  none|null|"")
    GENIE_SPACE_IDS=""
    ask CREATE_GENIE_SPACE "Create a Genie space over $UC_CATALOG.$UC_SCHEMA? (yes/no)" "yes"
    GRANT_GUEST_SPACE_ACCESS="no"   # nothing of the user's to grant against
    ;;
  *)
    # Only meaningful when the user named spaces: these are the one set of spaces
    # bootstrap is permitted to touch, so granting on them is an explicit choice.
    CREATE_GENIE_SPACE="no"
    ask GRANT_GUEST_SPACE_ACCESS "Grant the guest SP CAN_RUN on those spaces + SELECT on their tables? (yes/no)" "yes"
    ;;
esac

ask AGENT_APP_NAME        "Databricks App name"                        "firefly-openai-managed-mem-v2"
ask LAKEBASE_NAME         "Lakebase instance name"                     "firefly-lb"
ask DATABRICKS_ACCOUNT_ID "Databricks account ID (from accounts.cloud.databricks.com URL)"
ask REPO_DIR         "Local clone directory (created if missing; must be new/empty, NOT your home dir)" "$HOME/firefly"
ask VERCEL_TEAM      "Vercel team slug (e.g. acme-corp — from vercel.com/<slug>/...)"
ask NEON_PROJECT_NAME "Neon project name"               "firefly-genie"
ask VERCEL_PROJECT   "Vercel project name"              "firefly-genie"

echo
# uv ships its OWN bundled cert store (rustls/webpki) and ignores the OS keychain by
# default, so it rejects an intercepting proxy's cert (UnknownIssuer) even when Node
# and keychain-backed tools succeed. UV_SYSTEM_CERTS=1 makes uv trust the platform
# store — harmless off-proxy (the store already trusts public CAs), required on-proxy.
export UV_SYSTEM_CERTS="${UV_SYSTEM_CERTS:-1}"

# The gh / databricks / uv installers drop binaries into these user-local bin dirs (Phase 1).
# Export them EVERY run at top level (not inside the Phase 1 body): with skip-forward resume
# (#18), a run that skips Phase 1 must still find `databricks`/`uv`/`gh` in later phases —
# otherwise Phase 8's `databricks apps get` fails with "command not found".
# Create them up front: they are on PATH from here on, and the Phase 1 installers assume
# the target directory already exists.
mkdir -p "$HOME/bin" "$HOME/.local/bin" 2>/dev/null || true
export PATH="$HOME/bin:$HOME/.local/bin:$PATH"

# Corporate-network handling (TLS proxy CA, uv←pip index bridge, corepack←npm registry
# bridge, npm reachability preflight) lives in a shared library that BOTH this runner and
# the Phase 0 block in BOOTSTRAP.md source. Keeping one implementation is what prevents the
# runbook and the runner from drifting — see ENV-0, where the bridges existed only here and
# the runbook merely described them, so following the doc skipped them entirely.
#
# TLS precedence (unchanged):
#   1. TLS_PEM_PATH given          → use it verbatim.
#   2. Auto-detect a MITM by probing PyPI against the system trust store; if a PRIVATE
#      root CA is presented, extract it, show CN + SHA-256, confirm (or --trust-proxy-ca),
#      and build a LOCAL bundle (system roots + proxy CAs). System trust is never touched.
#   3. No MITM detected            → nothing to do.
# Corporate-network helpers (TLS/CA, uv + corepack bridges, PyPI proxy policy) are sourced
# once near the top of this script, before flag handling.

if [[ -n "${TLS_PEM_PATH:-}" && -f "${TLS_PEM_PATH}" ]]; then
  apply_tls_bundle "$TLS_PEM_PATH"
  ok "TLS trust from TLS_PEM_PATH → SSL_CERT_FILE / REQUESTS_CA_BUNDLE / NODE_EXTRA_CA_CERTS"
elif [[ "$DRY_RUN" == "true" ]]; then
  run "# detect intercepting proxy; if a private CA is presented, confirm + build a local bundle"
elif derive_proxy_ca_bundle; then
  warn "Intercepting HTTPS proxy detected — its chain terminates in a PRIVATE root CA."
  note "  Root CN:    ${PROXY_CA_ROOT_CN:-<unknown>}"
  note "  SHA-256:    ${PROXY_CA_ROOT_FP:-<unknown>}"
  note "  Copied to:  $PROXY_CA_BUNDLE"
  note "              (system roots + ${PROXY_CA_ADDED} proxy CA cert(s); your system trust store is NOT modified)"
  if [[ "$TRUST_PROXY_CA" == "true" ]]; then
    apply_tls_bundle "$PROXY_CA_BUNDLE"
    ok "--trust-proxy-ca set → using the copied CA (SSL_CERT_FILE / REQUESTS_CA_BUNDLE / NODE_EXTRA_CA_CERTS / CURL_CA_BUNDLE + UV_SYSTEM_CERTS)."
  else
    echo "  ${bold}Only trust the copied CA if the SHA-256 above matches your organization's known root CA.${reset}"
    echo "    ${bold}1)${reset} Trust this CA for this setup  — use the copied bundle above"
    echo "    ${bold}2)${reset} Use my own PEM                — enter the path to a combined bundle"
    echo "    ${bold}3)${reset} Don't use a cert              — proceed untrusted (installs may fail on-proxy)"
    read -rp "  ${bold}Choose [1/2/3] (default 1):${reset} " TLS_CHOICE
    case "${TLS_CHOICE:-1}" in
      2)
        read -rp "  Path to your combined PEM: " TLS_OWN_PEM
        if [[ -n "$TLS_OWN_PEM" && -f "$TLS_OWN_PEM" ]]; then
          apply_tls_bundle "$TLS_OWN_PEM"
          ok "TLS trust from your PEM → SSL_CERT_FILE / REQUESTS_CA_BUNDLE / NODE_EXTRA_CA_CERTS / CURL_CA_BUNDLE"
        else
          warn "No readable PEM at '${TLS_OWN_PEM:-<empty>}' — proceeding untrusted. Re-run with TLS_PEM_PATH=<path> if installs fail."
        fi
        ;;
      3)
        warn "Proceeding without a proxy CA. If installs fail with cert errors, re-run and pick 1, or set TLS_PEM_PATH=<your bundle>."
        ;;
      *)
        apply_tls_bundle "$PROXY_CA_BUNDLE"
        ok "TLS trust → SSL_CERT_FILE / REQUESTS_CA_BUNDLE / NODE_EXTRA_CA_CERTS / CURL_CA_BUNDLE (+ UV_SYSTEM_CERTS)"
        ;;
    esac
  fi
else
  ok "No intercepting proxy detected (TLS to PyPI validates against the system store)."
fi

# Bridge the user's existing pip index mirror into uv (uv ignores pip.conf).
# Flag the unsanctioned .dev PyPI proxy before any uv lock/sync work (warn by default,
# fatal with FIREFLY_STRICT_PYPI_PROXY=1).
if [[ "$DRY_RUN" == "true" ]]; then
  run "# if pip is configured with a custom index-url, export UV_DEFAULT_INDEX to match"
  run "# refuse pypi-proxy.dev.databricks.com in env / pip / uv.toml"
else
  reject_dead_pypi_proxy_config
  bridge_pip_index_to_uv
  if [[ -n "${PIP_BRIDGED_INDEX:-}" ]]; then
    ok "uv index bridged from pip config → UV_DEFAULT_INDEX=$PIP_BRIDGED_INDEX"
  elif [[ -n "${UV_DEFAULT_INDEX:-}${UV_INDEX_URL:-}" ]]; then
    note "uv index already set via env — leaving as-is."
  fi
fi

# Bridge the user's existing npm registry mirror into corepack. Phase 1a installs pnpm via
# npm (which already honors that registry), so this is not required for the supported path
# — it is kept for parity with the uv bridge and for anyone who opts into corepack manually.
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
# Steps here are deliberately unlettered. This runner installs in a different order than
# BOOTSTRAP.md documents, so numbering both 1a..1f made "1b" mean the Vercel CLI in one
# file and the Databricks CLI in the other. The runbook owns the letters.
if run_phase "1"; then

echo
step "pnpm (pinned install via npm — deliberately NOT corepack; see ENV-0)"
# Two constraints, both load-bearing:
#   1. pnpm's npm "latest" dist-tag has shipped a 12.x ALPHA that ignores
#      onlyBuiltDependencies (→ ERR_PNPM_IGNORED_BUILDS), so the version must be pinned.
#   2. corepack fetches its package manager from registry.npmjs.org and ignores the npm
#      registry setting, so it hard-fails wherever public npm is blocked (ENV-0).
# `npm install -g pnpm@<pin>` satisfies both: npm honors the user's OWN configured
# registry, so the supported path needs no COREPACK_NPM_REGISTRY bridge at all.
if [[ "$DRY_RUN" != "true" ]] && ! firefly_preflight_npm_registry; then
  fail "Cannot install pnpm until the npm registry above is reachable."
  exit 1
fi
if command -v pnpm &>/dev/null && [[ "$(pnpm --version 2>/dev/null)" == "$PNPM_VERSION" ]]; then
  ok "pnpm already installed at the pinned version: $PNPM_VERSION"
else
  # An enabled corepack puts its own pnpm shim ahead of the npm-global binary on PATH,
  # which would shadow the version we just pinned. Drop the shim before installing.
  run "corepack disable >/dev/null 2>&1 || true"
  run "npm install -g pnpm@$PNPM_VERSION"
  note "pnpm pinned to $PNPM_VERSION (matches the repo's packageManager field)."
fi

echo
step "Vercel CLI OAuth (opens browser)"
# Best-effort: silence the CLI's update/telemetry check, which reaches public npm
# and fails behind a corp proxy, printing an "Error:" line before commands that
# then succeed. UNVERIFIED — reproduces only on a proxied network.
export VERCEL_TELEMETRY_DISABLED=1
note "the vercel dist-tags 'Error:' line is its update check, not a failure"
# Pin to a Tart-tested floor — do not chase npm `latest` (CLI deploy semantics move).
# Override with VERCEL_CLI_VERSION=x.y.z if you need to bump deliberately.
VERCEL_CLI_VERSION="${VERCEL_CLI_VERSION:-56.3.1}"
vercel_needs_install=true
if command -v vercel &>/dev/null; then
  VERCEL_CURRENT=$(vercel --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
  # sort -C -V: already-sorted means VERCEL_CLI_VERSION <= VERCEL_CURRENT.
  if [[ -n "$VERCEL_CURRENT" ]] && printf '%s\n%s\n' "$VERCEL_CLI_VERSION" "$VERCEL_CURRENT" | sort -C -V; then
    ok "vercel already installed: $VERCEL_CURRENT (>= $VERCEL_CLI_VERSION)"
    vercel_needs_install=false
  else
    note "vercel ${VERCEL_CURRENT:-unknown} is below required $VERCEL_CLI_VERSION — installing pin"
  fi
fi
if [[ "$vercel_needs_install" == "true" ]]; then
  run "npm install -g vercel@${VERCEL_CLI_VERSION}"
fi
if [[ "$DRY_RUN" == "false" ]] && vercel whoami &>/dev/null; then
  ok "vercel already authenticated: $(vercel whoami 2>/dev/null | tail -1)"
else
  run "vercel login"
fi
run "vercel whoami"

echo
step "GitHub CLI"
if command -v gh &>/dev/null; then
  ok "gh already installed: $(gh --version 2>/dev/null | head -1)"
elif [[ "$DRY_RUN" == "true" ]]; then
  run "# download + install GitHub CLI (official release) to \$HOME/bin"
else
  firefly_install_gh || exit 1
fi
if gh auth status &>/dev/null; then
  ok "gh already authenticated: $(gh auth status 2>&1 | head -1)"
else
  run "gh auth login"
fi

echo
step "Neon CLI OAuth (opens browser)"
if command -v neonctl &>/dev/null; then
  ok "neonctl already installed: $(neonctl --version 2>/dev/null || echo '?')"
else
  run "npm install -g neonctl"
fi
if [[ "$DRY_RUN" == "false" ]] && neonctl me &>/dev/null; then
  ok "neonctl already authenticated"
else
  run "neonctl auth"
fi
run "neonctl me"

echo
step "Databricks CLI OAuth (opens browser)"
if command -v databricks &>/dev/null; then
  ok "databricks already installed: $(databricks --version 2>/dev/null | head -1)"
elif [[ "$DRY_RUN" == "true" ]]; then
  run "# download + install Databricks CLI (official release) to \$HOME/bin"
else
  firefly_install_databricks_cli || exit 1
fi
run "databricks auth login --host '$DATABRICKS_HOST' --profile '$DB_PROFILE'"
run "databricks workspace list / --profile '$DB_PROFILE' 2>&1 | head -3"

echo
step "Python uv (used by the agent build in Phases 4–5)"
if command -v uv &>/dev/null; then
  ok "uv already installed: $(uv --version 2>/dev/null || echo '?')"
elif [[ "$DRY_RUN" == "true" ]]; then
  run "# install uv via astral.sh installer to \$HOME/.local/bin"
else
  note "Installing uv (astral.sh installer; no Homebrew required)..."
  # Stock macOS has no sha256sum, so the installer would skip verifying its own
  # download and install an unverified binary. Restore the check first.
  firefly_ensure_sha256sum
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  ok "uv installed to \$HOME/.local/bin ($(uv --version 2>/dev/null || echo '?'))"
fi

fi
stop_if_done "1"

# ─── Phase 2: Clone and assemble ─────────────────────────────────────────────
header "Phase 2 — Clone and assemble"
if run_phase "2"; then

step "Clone the app repo (idempotent — safe to re-run)"
if [[ "$DRY_RUN" == "true" ]]; then
  run "git clone --branch '$FIREFLY_BRANCH' https://github.com/databrickslabs/firefly.git '$REPO_DIR'"
elif [[ -d "$REPO_DIR/.git" ]]; then
  ok "Repo already present at $REPO_DIR — reusing it (skipping clone)."
elif [[ -e "$REPO_DIR" && -n "$(ls -A "$REPO_DIR" 2>/dev/null)" ]]; then
  fail "$REPO_DIR exists and is non-empty but is not a git repo."
  note "Pick a new REPO_DIR (re-run and decline reuse), or remove that directory, then re-run."
  exit 1
else
  run "git clone --branch '$FIREFLY_BRANCH' https://github.com/databrickslabs/firefly.git '$REPO_DIR'"
fi
run "cd '$REPO_DIR'"

# NOTE: no GitHub fork push. The frontend is deployed with the `vercel deploy` CLI (Phase 8),
# which uploads the local build directly — it does NOT use Vercel's Git integration, so a
# user-owned GitHub repo is unnecessary. (This also drops a `gh` auth dependency and a
# failure surface.) To enable push-to-deploy later, connect a repo in the Vercel dashboard:
# Project → Settings → Git.

echo
step "Submodule init (must run before assemble_agent.sh)"
run "git -C '$REPO_DIR' submodule update --init"

echo
step "First assemble (before quickstart)"
run "bash '$REPO_DIR/scripts/assemble_agent.sh'"

fi
stop_if_done "2"

# ─── Phase 3: Provision Databricks resources ──────────────────────────────────
header "Phase 3 — Provision Databricks resources"
if run_phase "3"; then

echo
step "3a. quickstart — MLflow experiment + Lakebase (--python 3.12 required)"
# Gate on index reachability first. Everything below this line is uv-driven, and an
# unreachable index otherwise surfaces as a raw uv stack trace with no cause named.
if [[ "$DRY_RUN" == "false" ]]; then
  firefly_preflight_pypi_index || exit 1
fi
# Lakebase create-vs-reuse: --lakebase-create-new is non-idempotent (fails with
# "project slug already exists" on re-run) AND it disables quickstart's own .env
# reuse path. quickstart names resources deterministically, so if the project's
# primary endpoint already exists, reuse it instead of trying to re-create.
LB_ENDPOINT_PATH="projects/${LAKEBASE_NAME}/branches/${LAKEBASE_NAME}-branch/endpoints/primary"
if [[ "$DRY_RUN" == "false" ]] \
   && databricks api get "/api/2.0/postgres/${LB_ENDPOINT_PATH}" --profile "$DB_PROFILE" &>/dev/null; then
  ok "Lakebase project '${LAKEBASE_NAME}' exists — reusing endpoint (idempotent re-run)."
  LB_ARG="--lakebase-autoscaling-endpoint '${LB_ENDPOINT_PATH}'"
else
  LB_ARG="--lakebase-create-new '${LAKEBASE_NAME}'"
fi
note "Lakebase provisioning takes several minutes; let this finish before Phase 4."
[[ "$DRY_RUN" == "false" ]] && firefly_warn_existing_app_wins "$AGENT_APP_NAME" "$DB_PROFILE"

run "cd '$REPO_DIR/agent-build' && uv run --python 3.12 python scripts/quickstart.py \
  --profile '$DB_PROFILE' ${LB_ARG} --app-name '$AGENT_APP_NAME'"

# An existing --app-name wins over --lakebase-create-new, so the requested project
# may never be created while the summary still names it. Let reality win.
[[ "$DRY_RUN" == "false" ]] && firefly_reconcile_lakebase "$REPO_DIR/agent-build"
# Completion test, not a formality: quickstart rewrites experiment_id in the bundle, so
# this is the one observable that distinguishes "finished" from "still running" or
# "exited early". A wrapper that backgrounds long commands returns 0 either way.
if [[ "$DRY_RUN" == "false" ]]; then
  assert_bundle_quickstart_ran "$REPO_DIR/agent-build/databricks.yml" || exit 1
fi

echo
step "3b. Catalog/schema → bundle vars (applied at deploy; no yml edit)"
note "HOST/WORKSPACE_ID are injected by quickstart (no GENIE_ONE_URL — the attribution link was removed)."
note "catalog=$UC_CATALOG schema=$UC_SCHEMA are passed via --var at deploy (Phase 4);"
note "DATABRICKS_MEMORY_STORE resolves to $UC_CATALOG.$UC_SCHEMA.firefly_managed_memory."

echo
step "3c. Create UC wheels volume"
# The schema is assumed to exist; on a fresh catalog it does not (the catalog can
# hold nothing but information_schema), and the volume create then fails with a
# message about the volume rather than the missing schema.
if [[ "$DRY_RUN" == "false" ]]; then
  databricks schemas create "$UC_SCHEMA" "$UC_CATALOG" --profile "$DB_PROFILE" &>/dev/null \
    && ok "created schema $UC_CATALOG.$UC_SCHEMA" \
    || note "schema $UC_CATALOG.$UC_SCHEMA already exists — continuing"
fi

if [[ "$DRY_RUN" == "false" ]] \
   && databricks volumes read "${UC_CATALOG}.${UC_SCHEMA}.firefly_wheels" --profile "$DB_PROFILE" &>/dev/null; then
  ok "UC volume ${UC_CATALOG}.${UC_SCHEMA}.firefly_wheels already exists — skipping create."
else
  run "databricks volumes create '$UC_CATALOG' '$UC_SCHEMA' firefly_wheels MANAGED \
  --profile '$DB_PROFILE'"
fi

echo
step "3d. Vendor cp311 wheels (required for offline build)"
run "cd '$REPO_DIR/agent-build' && bash scripts/vendor_wheels.sh"

echo
step "3e. Verify sync.exclude rules"
# Was three bare greps over the whole file, which matched the explanatory comment
# ("NOTE: pyproject.toml and vendor-wheels/ MUST sync") and reported two failures
# on a correct config. check_sync_exclude_rules parses the exclude list itself.
if [[ "$DRY_RUN" == "false" ]]; then
  check_sync_exclude_rules "$REPO_DIR/agent/databricks.yml" || exit 1
else
  run "# check_sync_exclude_rules '$REPO_DIR/agent/databricks.yml'"
fi

fi
stop_if_done "3"

# ─── Phase 4: Deploy agent app ────────────────────────────────────────────────
header "Phase 4 — Deploy agent app"
step "Preflight: uv.lock must not stamp the unsanctioned PyPI proxy (.dev)"
if [[ "$DRY_RUN" == "true" ]]; then
  run "# assert no ${FIREFLY_UNSANCTIONED_PYPI_HOST} in agent-build/guest-manager uv.lock"
else
  assert_uv_locks_not_dead_pypi_proxy \
    "$REPO_DIR/agent-build/uv.lock" \
    "$REPO_DIR/databricks-apps/guest-manager/uv.lock"
  ok "No ${FIREFLY_UNSANCTIONED_PYPI_HOST} in checked uv.lock files"
  # Deploying a bundle whose resource bindings quickstart never rewrote fails with
  # a 404 that names only the stale id. Say which phase to go back to instead.
  assert_bundle_quickstart_ran "$REPO_DIR/agent-build/databricks.yml" || exit 1
fi
if run_phase "4"; then

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


# The deploy's exit code is not evidence. CLI v1.9.0 can panic on bundle deploy
# and still exit 0, so a crashed deploy reads as success and Phases 5/6/9 then
# fail opaquely. Assert the app exists.
if [[ "$DRY_RUN" == "false" ]]; then
  if databricks apps get "$AGENT_APP_NAME" --profile "$DB_PROFILE" &>/dev/null; then
    ok "Phase 4 created $AGENT_APP_NAME"
  else
    fail "Phase 4 did not create the app $AGENT_APP_NAME (deploy exit code notwithstanding)"
    note "Check the deploy output for a panic or an env-var rejection."
    note "Stale bundle state also causes this: if the app was deleted but"
    note "/Workspace/Users/<you>/.bundle/firefly_openai_managed_mem survives, the CLI"
    note "diffs against an app that no longer exists. Delete that path and redeploy."
  fi
fi
fi
stop_if_done "4"

# ─── Phase 5: UC managed memory ───────────────────────────────────────────────
header "Phase 5 — UC managed memory"
if run_phase "5"; then

capture SP_CLIENT_ID \
  "databricks apps get '$AGENT_APP_NAME' -o json --profile '$DB_PROFILE' \
    | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['service_principal_client_id'])\""
note "App service principal: $SP_CLIENT_ID"

# The preview is enabled per-workspace by Databricks; without it this phase fails
# with NotImplemented and there is no local remedy. It was the most-reported gap
# in E2E runs (9 of 12) purely because the runbook charged ahead and failed
# opaquely. Say so up front, and let the rest of the bootstrap finish — only
# cross-session memory is lost.
# Attempt, then classify. An earlier version probed /api/2.0/memory-stores and
# read a clean response as "preview on" — that path returns `Error: Not Found`,
# which matched none of its patterns, so it declared the preview ENABLED on a
# workspace where setup then failed with NotImplemented. A preflight that cannot
# detect the state it exists to detect is worse than none. The operation itself
# is the only reliable signal.
if [[ "$DRY_RUN" == "true" ]]; then
  note "[DRY-RUN] setup_memory_store.py $SP_CLIENT_ID"
else
  MEM_LOG="$(mktemp)"
  if (cd "$REPO_DIR/agent-build" && \
        uv run --python 3.12 python scripts/setup_memory_store.py "$SP_CLIENT_ID" \
          --memory-store "$UC_CATALOG.$UC_SCHEMA.firefly_managed_memory" \
          --profile "$DB_PROFILE") >"$MEM_LOG" 2>&1; then
    ok "UC managed memory store configured"
  elif grep -qiE 'not enabled|NotImplemented|preview' "$MEM_LOG"; then
    warn "Managed Memory for Agents preview is NOT enabled on this workspace."
    note "Skipping Phase 5 — the preview is enabled per-workspace by Databricks."
    note "The agent still runs; it just has no cross-session memory."
  else
    fail "Phase 5 failed for a reason other than the preview:"
    sed 's/^/    /' "$MEM_LOG" >&2
  fi
  rm -f "$MEM_LOG"
fi

fi
stop_if_done "5"

# ─── Phase 6: Grant SP data access ────────────────────────────────────────────
header "Phase 6 — Grant agent SP access to data"
if run_phase "6"; then

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

# Executed, not described. These were `note` lines telling the operator to paste
# SQL by hand; the backquoted principal cannot survive `--json "..."`, so in
# practice the grants were skipped and Genie could not read the data.
if [[ -n "$WAREHOUSE_ID" && "$WAREHOUSE_ID" != "<WAREHOUSE_ID-placeholder>" && "$DRY_RUN" == "false" ]]; then
  firefly_sql "$WAREHOUSE_ID" "GRANT USE SCHEMA ON SCHEMA \`$UC_CATALOG\`.\`$UC_SCHEMA\` TO \`$SP_CLIENT_ID\`" >/dev/null \
    && ok "granted USE SCHEMA to agent SP" || warn "could not grant USE SCHEMA to agent SP"
  firefly_sql "$WAREHOUSE_ID" "GRANT SELECT ON SCHEMA \`$UC_CATALOG\`.\`$UC_SCHEMA\` TO \`$SP_CLIENT_ID\`" >/dev/null \
    && ok "granted SELECT to agent SP" || warn "could not grant SELECT to agent SP"
fi
note "Grant USE SCHEMA + SELECT on your data schemas via a SQL warehouse:"
note "  GRANT USE SCHEMA, SELECT ON SCHEMA $UC_CATALOG.your_schema TO \`$SP_CLIENT_ID\`;"

fi
stop_if_done "6"

# ─── Phase 6b: Create guest SP with M2M credentials ──────────────────────────
header "Phase 6b — Create guest service principal"
if run_phase "6b"; then

step "Create workspace SP"
if [[ "$DRY_RUN" == "false" ]]; then
  # SCIM display names are NOT unique: `service-principals create` on a re-run
  # makes a DUPLICATE SP (new client id + secret) and orphans the old one.
  # Reuse the existing firefly-guest-sp if one is already present.
  GUEST_SP_RESP=$(databricks service-principals list \
    --filter 'displayName eq "firefly-guest-sp"' -o json --profile "$DB_PROFILE" 2>/dev/null \
    | python3 -c "import sys,json
l=json.load(sys.stdin) or []
m=[s for s in l if s.get('displayName')=='firefly-guest-sp']
print(json.dumps(m[0]) if m else '')" 2>/dev/null || echo "")
  if [[ -n "$GUEST_SP_RESP" ]]; then
    ok "Guest SP 'firefly-guest-sp' already exists — reusing (idempotent re-run)."
  else
    GUEST_SP_RESP=$(databricks service-principals create \
      --display-name "firefly-guest-sp" \
      -o json \
      --profile "$DB_PROFILE")
  fi
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

if [[ -n "$WAREHOUSE_ID" && "$WAREHOUSE_ID" != "<WAREHOUSE_ID-placeholder>" && "$DRY_RUN" == "false" ]]; then
  firefly_sql "$WAREHOUSE_ID" "GRANT USE CATALOG ON CATALOG \`$UC_CATALOG\` TO \`$GUEST_SP_CLIENT_ID\`" >/dev/null \
    && ok "granted USE CATALOG to guest SP" || warn "could not grant USE CATALOG to guest SP"
  firefly_sql "$WAREHOUSE_ID" "GRANT USE SCHEMA ON SCHEMA \`$UC_CATALOG\`.\`$UC_SCHEMA\` TO \`$GUEST_SP_CLIENT_ID\`" >/dev/null \
    && ok "granted USE SCHEMA to guest SP" || warn "could not grant USE SCHEMA to guest SP"
  firefly_sql "$WAREHOUSE_ID" "GRANT SELECT ON SCHEMA \`$UC_CATALOG\`.\`$UC_SCHEMA\` TO \`$GUEST_SP_CLIENT_ID\`" >/dev/null \
    && ok "granted SELECT to guest SP" || warn "could not grant SELECT to guest SP"
fi
note "Grant USE CATALOG / USE SCHEMA / SELECT via SQL warehouse if not already done:"
note "  GRANT USE CATALOG ON CATALOG $UC_CATALOG TO \`$GUEST_SP_CLIENT_ID\`;"
note "  GRANT USE SCHEMA, SELECT ON SCHEMA $UC_CATALOG.$UC_SCHEMA TO \`$GUEST_SP_CLIENT_ID\`;"

fi
stop_if_done "6b"

# ─── Phase 6c: data + Genie space ─────────────────────────────────────────────
# The runner had no 6c at all, so a fresh workspace finished "successfully" with
# an empty schema and a Genie that could not answer anything (#83). One shared
# script does the work, called exactly as BOOTSTRAP.md calls it.
header "Phase 6c — Give Genie data, and a space, to work with"
if run_phase "6c"; then

step "Seed sample data and resolve a Genie space"
if [[ "$DRY_RUN" == "true" ]]; then
  note "[DRY-RUN] scripts/genie-data-setup.sh --catalog $UC_CATALOG --schema $UC_SCHEMA ..."
  GENIE_MCP_MODE="one"; GENIE_SPACE_ID=""
else
  # Progress goes to stderr, KEY=value to stdout, so eval only sees the contract.
  GENIE_SETUP_OUT="$(bash "$BOOTSTRAP_SCRIPT_DIR/genie-data-setup.sh" \
    --catalog "$UC_CATALOG" --schema "$UC_SCHEMA" --profile "$DB_PROFILE" \
    --warehouse-id "${WAREHOUSE_ID:-}" \
    --seed "${SEED_SAMPLE_DATA:-yes}" \
    --space-ids "${GENIE_SPACE_IDS:-}" \
    --create-space "${CREATE_GENIE_SPACE:-yes}" \
    --grant-guest "${GRANT_GUEST_SPACE_ACCESS:-yes}" \
    --guest-sp "${GUEST_SP_CLIENT_ID:-}" \
    --agent-sp "${SP_CLIENT_ID:-}")" || warn "Phase 6c setup reported a problem (continuing)"
  eval "$GENIE_SETUP_OUT"
  note "seed=${SEED_STATUS:-?} tables=${SEED_TABLE_COUNT:-?} mode=${GENIE_MCP_MODE:-one} space=${GENIE_SPACE_ID:-none}"
  [[ -n "${GENIE_SPACE_ID:-}" ]] && store_secret GENIE_SPACE_ID "$GENIE_SPACE_ID"
fi

# Phase 4 deployed the app before a space existed, so space mode needs a redeploy.
# Both --vars move together or neither does: agent.py raises ValueError on
# mode=space with an empty id, and the app then fails to boot.
if [[ "${GENIE_MCP_MODE:-one}" == "space" && -n "${GENIE_SPACE_ID:-}" ]]; then
  firefly_restore_phase6_context "$DB_PROFILE"
  step "Redeploy the agent app in Genie space mode"
  # Phase 4's deployment may still be pending; the Apps API rejects an overlapping
  # update with "Cannot update app ... as there is a pending deployment in progress".
  firefly_wait_app_deploy_settled "$AGENT_APP_NAME" "$DB_PROFILE"
  GENIE_VARS="--var catalog=$UC_CATALOG --var schema=$UC_SCHEMA \
--var genie_mcp_mode=space --var genie_space_id=$GENIE_SPACE_ID"
  run "cd '$REPO_DIR/agent-build' && databricks bundle deploy --profile '$DB_PROFILE' -t dev $GENIE_VARS"
  run "cd '$REPO_DIR/agent-build' && databricks bundle run agent_openai_agents_sdk --profile '$DB_PROFILE' -t dev $GENIE_VARS"
else
  warn "NOT redeploying in space mode: GENIE_MCP_MODE='${GENIE_MCP_MODE:-}' GENIE_SPACE_ID='${GENIE_SPACE_ID:-}'."
  note "The app stays on Genie One, which guest users cannot use. If a space was"
  note "created, the shell most likely lost these vars - see firefly_restore_phase6_context."
fi

fi
stop_if_done "6c"

# ─── Phase 7: Neon database ───────────────────────────────────────────────────
header "Phase 7 — Neon database"
if run_phase "7"; then

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
  ORG_FLAG=(); [[ -n "$ORG_ID" ]] && ORG_FLAG=(--org-id "$ORG_ID")
  # Neon project names are NOT unique (id-based): `projects create` on a re-run
  # makes a SECOND project, orphans the first, and can trip the project quota.
  # Reuse an existing project with the same name if present.
  PROJECT_ID=$(firefly_neon_project_id "${ORG_FLAG[@]}")
  if [[ -n "$PROJECT_ID" ]]; then
    ok "Neon project '$NEON_PROJECT_NAME' exists — reusing ($PROJECT_ID)."
  else
    # Resolve the id by re-listing rather than by parsing the create response.
    # `create` succeeds server-side before any parse of its output can fail, so
    # a parse bug there silently orphans a real project — which is how two
    # `firefly-genie` projects appeared on 2026-07-25. One lookup path, and a
    # create whose response we mis-read is still discoverable.
    neonctl projects create --name "$NEON_PROJECT_NAME" "${ORG_FLAG[@]}" --output json >/dev/null
    PROJECT_ID=$(firefly_neon_project_id "${ORG_FLAG[@]}")
    ok "Project created: $PROJECT_ID"
  fi
  if [[ -z "$PROJECT_ID" ]]; then
    fail "could not resolve a Neon project id for '$NEON_PROJECT_NAME'."
    note "An empty id makes the next call ambiguous ('Multiple projects found')."
    note "Check: neonctl projects list ${ORG_FLAG[*]}"
    exit 1
  fi

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
  require_secret DB_URL "DATABASE_URL" || exit 1
  run "cd '$REPO_DIR' && DATABASE_URL='$DB_URL' node_modules/.bin/drizzle-kit push"
else
  run "cd '$REPO_DIR' && pnpm install"
  run "cd '$REPO_DIR' && source .firefly-bootstrap/state.env && node_modules/.bin/drizzle-kit push"
fi

fi
stop_if_done "7"

# ─── Phase 8: Vercel frontend ─────────────────────────────────────────────────
header "Phase 8 — Vercel frontend"
if run_phase "8"; then

step "8a. Create + link Vercel project (no Git integration)"
# `vercel link` on a NON-EXISTENT project CREATES it and then tries to wire up Git
# auto-deploy — detecting the clone's `origin` remote (upstream databrickslabs/firefly),
# prompting "which remote?", and calling Vercel's Git connect, which needs a Vercel↔GitHub
# Login Connection many accounts lack (→ HTTP 400 "add a Login Connection"). We deploy via
# the `vercel deploy` CLI and need NO Git integration, so PRE-CREATE the project
# (idempotent) — then `vercel link` just ATTACHES to an existing project and never touches
# Git. (Enable push-to-deploy later from the dashboard: Project → Settings → Git.)
run "vercel project add '$VERCEL_PROJECT' --scope '$VERCEL_TEAM' 2>/dev/null || true"
run "cd '$REPO_DIR' && vercel link --project '$VERCEL_PROJECT' --scope '$VERCEL_TEAM' --yes --non-interactive"

# A Vercel project created without a framework preset (framework:null) builds `next build`
# but serves the output as STATIC → every route 404s despite a "Ready" deployment. Force
# the Next.js preset on the linked project via the API (verified: flips all routes 200).
if [[ "$DRY_RUN" == "false" ]]; then
  # Token sources in order: explicit env (CI / non-interactive), then the CLI's store on
  # macOS, then its XDG location. This is load-bearing twice — the framework preset below
  # (without it every route 404s) and the origin resolution in 8a-2 — so a single
  # hardcoded path made it a silent 404 or a hard stop for anyone storing auth elsewhere.
  V_TOKEN="${VERCEL_TOKEN:-}"
  for _v_auth in "$HOME/Library/Application Support/com.vercel.cli/auth.json" \
                 "$HOME/.local/share/com.vercel.cli/auth.json"; do
    [[ -n "$V_TOKEN" ]] && break
    [[ -f "$_v_auth" ]] || continue
    V_TOKEN=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("token",""))' "$_v_auth" 2>/dev/null || echo "")
  done
  V_ORG=$(python3 -c "import json;print(json.load(open('$REPO_DIR/.vercel/project.json'))['orgId'])" 2>/dev/null || echo "")
  V_PROJ=$(python3 -c "import json;print(json.load(open('$REPO_DIR/.vercel/project.json'))['projectId'])" 2>/dev/null || echo "")
  if [[ -n "$V_TOKEN" && -n "$V_PROJ" ]]; then
    curl -s -X PATCH "https://api.vercel.com/v9/projects/$V_PROJ?teamId=$V_ORG" \
      -H "Authorization: Bearer $V_TOKEN" -H "Content-Type: application/json" \
      -d '{"framework":"nextjs"}' -o /dev/null \
      && ok "Vercel project framework → nextjs (else Next.js routes 404)" \
      || warn "Couldn't PATCH framework=nextjs; if routes 404, set Framework Preset=Next.js in the dashboard."
  else
    warn "Couldn't read Vercel token/project id to set framework=nextjs; set it in the dashboard if routes 404."
  fi
else
  run "# PATCH Vercel project framework=nextjs via API (else Next.js routes 404 despite 'Ready')"
fi

echo
step "8a-2. Resolve the origin Vercel serves this project on (API, not the CLI's stdout)"
# `<name>.vercel.app` is globally unique across all Vercel accounts; when the name is
# taken Vercel assigns a RANDOM suffix (`demo` -> `demo-zeta-seven-61`), so the host is
# unguessable. Read it instead — and read it HERE, because the domain is allocated at
# project-creation time and is therefore known before the first deploy.
# Resolving pre-deploy is also what makes this correct on a RE-RUN: discovering the URL
# from `vercel deploy` output only yields the production domain on a project's FIRST
# deploy; on any later run a bare deploy is a preview with a per-deployment host, which
# silently becomes BETTER_AUTH_URL and reproduces #19 while reporting success.
if [[ "$DRY_RUN" == "false" ]]; then
  if [[ -z "$V_TOKEN" || -z "$V_PROJ" ]]; then
    fail "Cannot read the Vercel API token / project id — refusing to guess the app origin."
    note "Set VERCEL_TOKEN, or re-run 'vercel login' so the CLI writes its auth store."
    exit 1
  fi
  V_TMP=$(mktemp -d)
  curl -sf -H "Authorization: Bearer $V_TOKEN" \
    "https://api.vercel.com/v9/projects/$V_PROJ/domains?teamId=$V_ORG" > "$V_TMP/domains.json" || true
  curl -sf -H "Authorization: Bearer $V_TOKEN" \
    "https://api.vercel.com/v9/projects/$V_PROJ?teamId=$V_ORG" > "$V_TMP/project.json" || true
  APP_ORIGIN=$(python3 - "$V_TMP/domains.json" "$V_TMP/project.json" <<'PY' || true
import json, sys
try:
    domains = json.load(open(sys.argv[1])); project = json.load(open(sys.argv[2]))
except Exception:
    raise SystemExit
# Where production actually serves. Populated once a production deployment exists, and it
# can disagree with /domains, so it wins when present.
alias = [a for a in (((project.get("targets") or {}).get("production") or {}).get("alias") or []) if a]
if alias:
    print("https://" + alias[0]); raise SystemExit
# Pre-deploy: the single verified .vercel.app assigned when the project was created.
hosts = [d["name"] for d in (domains.get("domains") or [])
         if d.get("verified") and not d.get("gitBranch") and not d.get("redirect")
         and str(d.get("name", "")).endswith(".vercel.app")]
if len(hosts) == 1:
    print("https://" + hosts[0])
PY
)
  rm -rf "$V_TMP"
  if [[ -z "$APP_ORIGIN" ]]; then
    fail "No verified .vercel.app domain for '$VERCEL_PROJECT' — refusing to guess one (#19)."
    note "Inspect with: vercel project inspect '$VERCEL_PROJECT' --scope '$VERCEL_TEAM'"
    exit 1
  fi
  ok "App origin: $APP_ORIGIN"
  if [[ "$APP_ORIGIN" != "https://$VERCEL_PROJECT.vercel.app" ]]; then # fence-ok: detects the collision
    note "'$VERCEL_PROJECT.vercel.app' belongs to another account — using the assigned domain." # fence-ok: diagnostic
  fi
  store_secret APP_ORIGIN "$APP_ORIGIN"
else
  run "# GET /v9/projects/<id>/domains -> APP_ORIGIN (real serving host, never guessed)"
  APP_ORIGIN="<resolved-vercel-origin>"
fi

echo
step "8b. Generate secrets"
if [[ "$DRY_RUN" == "false" ]]; then
  BETTER_AUTH_SECRET=$(openssl rand -base64 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  GUEST_API_SECRET=$(openssl rand -hex 64)
  AGENT_APP_URL=$(databricks apps get "$AGENT_APP_NAME" -o json --profile "$DB_PROFILE" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))")
  require_secret DB_URL "DATABASE_URL" || exit 1
else
  BETTER_AUTH_SECRET="<random-base64>"
  ENCRYPTION_KEY="<random-hex>"
  GUEST_API_SECRET="<random-hex>"
  AGENT_APP_URL="<databricks-app-url>"
  DB_URL="<neon-connection-string>"
fi

step "8b-2. Clear stale JWKS (reused-DB safety for the freshly-minted BETTER_AUTH_SECRET)"
# Phase 7 REUSES a same-named Neon project, but we mint a NEW BETTER_AUTH_SECRET above on
# every run. Better Auth's jwt plugin stores a JWKS whose private key is encrypted under that
# secret; a jwks row left over from an earlier run (different secret) fails to decrypt, so
# EVERY GET /api/auth/get-session 500s — which silently bounces guest logins to the
# /sso-spn-login dead end. Clearing jwks makes Better Auth regenerate it under the current
# secret (its own recommended remediation). No-op on a fresh DB. Uses @neondatabase/serverless
# (already installed by Phase 7's pnpm install) so no psql dependency.
if [[ "$DRY_RUN" == "false" ]]; then
  ( cd "$REPO_DIR" && DATABASE_URL="$DB_URL" node --input-type=module -e \
      'import {neon} from "@neondatabase/serverless"; const sql=neon(process.env.DATABASE_URL); await sql.query("DELETE FROM jwks"); console.log("jwks cleared");' ) \
    && ok "Stale JWKS cleared (will regenerate under current BETTER_AUTH_SECRET)" \
    || warn "Could not clear jwks — if guest login 500s on /api/auth/get-session, run: DELETE FROM jwks;"
else
  run "cd '$REPO_DIR' && DATABASE_URL='<neon>' node --input-type=module -e '<delete-from-jwks>'"
fi

step "8b. Tier 1 env vars — required for guest login"
note "DO NOT set NEXT_PUBLIC_BETTER_AUTH_URL — causes CORS failures on preview deployments"
note "Omit SPN_AUTH_OKTA_* entirely — the plugin is conditional; absent vars are skipped"

for SCOPE in preview production; do
  note "Setting tier-1 vars for scope: $SCOPE"
  # Empty means Phase 4 never created the app. The env add succeeds anyway and
  # the frontend deploys pointing at nothing, which reads as a frontend bug.
  if [[ -z "${AGENT_APP_URL:-}" && "$DRY_RUN" == "false" ]]; then
    warn "AGENT_APP_URL is empty — Phase 4 produced no running app; the agent panel will not work."
  fi
  run "vercel env add DATABRICKS_AGENT_APP_URL  $SCOPE --value '$AGENT_APP_URL' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add DATABASE_URL              $SCOPE --value '$DB_URL' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add BETTER_AUTH_SECRET        $SCOPE --value '$BETTER_AUTH_SECRET' --force --non-interactive --scope '$VERCEL_TEAM'"
  # Production is the bootstrap's serving target and its origin is already known from
  # 8a-2, so set it now — one deploy, no second pass. Preview is deliberately left unset:
  # preview URLs are per-deployment, so pointing preview auth at production is wrong.
  [[ "$SCOPE" == "production" ]] && \
    run "vercel env add BETTER_AUTH_URL         $SCOPE --value '$APP_ORIGIN' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add ENCRYPTION_KEY            $SCOPE --value '$ENCRYPTION_KEY' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add NEXT_PUBLIC_AGENT_ENABLED $SCOPE --value 'true' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add GUEST_API_SECRET          $SCOPE --value '$GUEST_API_SECRET' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add SPN_AUTH_DATABRICKS_ACCOUNTS_URL  $SCOPE --value 'https://accounts.cloud.databricks.com' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add SPN_AUTH_DATABRICKS_WORKSPACE_URL $SCOPE --value '$DATABRICKS_HOST' --force --non-interactive --scope '$VERCEL_TEAM'"
  # Guest Catalog Explorer only lists catalogs whose name matches an allowed prefix
  # (app default "firefly"). Set it to the catalog the user chose in Phase 0 ($UC_CATALOG)
  # so guests can BROWSE the data provisioned there (#20) — the app's memory store lives in
  # $UC_CATALOG too, so there's no separate "firefly" catalog to keep. Browse-only; data
  # access is still governed by the guest SP's UC grants.
  run "vercel env add GUEST_ALLOWED_CATALOG_PREFIXES $SCOPE --value '$UC_CATALOG' --force --non-interactive --scope '$VERCEL_TEAM'"
done

echo
step "8b. Tier 2 env vars — admin Databricks OAuth (placeholder is safe for guest-only)"
note "genericOAuth receives these as a plain object — undefined does NOT crash the build."
note "Admin login will 404 at runtime with placeholders, but guest flow is unaffected."
for SCOPE in preview production; do
  run "vercel env add DATABRICKS_U2M_CLIENT_ID     $SCOPE --value 'placeholder' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add DATABRICKS_U2M_CLIENT_SECRET $SCOPE --value 'placeholder' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add DATABRICKS_ACCOUNT_ID        $SCOPE --value '$DATABRICKS_ACCOUNT_ID' --force --non-interactive --scope '$VERCEL_TEAM'"
  run "vercel env add SPN_AUTH_DATABRICKS_ACCOUNT_ID $SCOPE --value '$DATABRICKS_ACCOUNT_ID' --force --non-interactive --scope '$VERCEL_TEAM'"
done
note "To enable admin login later: replace 'placeholder' with real OAuth app credentials"
note "from: accounts.cloud.databricks.com → App connections → Register an app"

echo
step "8c. Disable preview SSO protection"
run "vercel project protection disable '$VERCEL_PROJECT' --sso --scope '$VERCEL_TEAM'"

echo
step "8d. Deploy (single pass — production env already points at the real origin)"
# Always --prod. A bare `vercel deploy` is production only on a project's FIRST deploy;
# on a re-run it produces a preview with a per-deployment host, which is how a
# discover-from-stdout flow silently sets BETTER_AUTH_URL to a dead origin (#19).
if [[ "$DRY_RUN" == "false" ]]; then
  DEPLOY_URL=$(vercel deploy --prod --scope "$VERCEL_TEAM" 2>&1 | grep -oE 'https://[^ ]*\.vercel\.app' | tail -1)
  ok "Deployed: ${DEPLOY_URL:-<none parsed>}"
  : "${APP_ORIGIN:=$(read_secret APP_ORIGIN 2>/dev/null || true)}"
  PREVIEW_URL="$APP_ORIGIN"   # Phase 9 guest-entry URL (historical var name)
  store_secret APP_ORIGIN  "$APP_ORIGIN"
  store_secret PREVIEW_URL "$PREVIEW_URL"
  store_secret GUEST_API_SECRET "$GUEST_API_SECRET"
else
  run "vercel deploy --prod --scope '$VERCEL_TEAM'"
  PREVIEW_URL="$APP_ORIGIN"
fi

echo
step "8e. Verify production serves the origin BETTER_AUTH_URL points at"
# #19 reports success at every earlier step and only surfaces later as "Invalid token"
# on the guest link, so the match is asserted here rather than assumed.
if [[ "$DRY_RUN" == "false" ]]; then
  SERVING=$(curl -sf -H "Authorization: Bearer $V_TOKEN" \
    "https://api.vercel.com/v9/projects/$V_PROJ?teamId=$V_ORG" \
    | python3 -c 'import json,sys; t=(json.load(sys.stdin).get("targets") or {}).get("production") or {}; print("\n".join(t.get("alias") or []))' 2>/dev/null || true)
  if grep -qxF "${APP_ORIGIN#https://}" <<<"$SERVING"; then
    ok "Production serves $APP_ORIGIN"
  else
    fail "Production does NOT serve $APP_ORIGIN (aliases: $(tr '\n' ' ' <<<"$SERVING"))"
    exit 1
  fi
else
  run "# assert targets.production.alias contains APP_ORIGIN"
fi

fi
stop_if_done "8"

# ─── Phase 9: Verify ─────────────────────────────────────────────────────────
header "Phase 9 — Verify"
if run_phase "9"; then

if [[ "$DRY_RUN" == "false" ]]; then
  require_secret PREVIEW_URL "PREVIEW_URL" 2>/dev/null || {
    read -rp "  Paste the Vercel production URL: " PREVIEW_URL
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
  require_secret GUEST_API_SECRET_ "GUEST_API_SECRET" 2>/dev/null || \
    GUEST_API_SECRET_="$GUEST_API_SECRET"
  require_secret GUEST_SP_CLIENT_ID "GUEST_SP_CLIENT_ID" || exit 1
  require_secret GUEST_SP_SECRET_VAL "GUEST_SP_SECRET" || exit 1
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

fi
stop_if_done "9"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo
echo "${bold}${green}╔══════════════════════════════════════════════════════════╗${reset}"
echo "${bold}${green}║  Bootstrap complete.                                      ║${reset}"
echo "${bold}${green}╚══════════════════════════════════════════════════════════╝${reset}"
echo
if [[ "$DRY_RUN" == "false" ]]; then
  # Lead the summary with the guest login URL — it's the one thing the user needs to open
  # the app, so surface it first (not buried under the cleanup list). One-time, ~10 min.
  echo "  ${bold}▶ OPEN THE APP — guest login (one-time link, valid ~10 min):${reset}"
  echo "      ${bold}${LOGIN_URL:-<not minted — re-run and execute Phase 9 to create one>}${reset}"
  echo
  note "Frontend (production): ${PREVIEW_URL:-<unknown>}"
  note "Agent app:          $AGENT_APP_NAME (RUNNING)"
  note "UC memory store:    $UC_CATALOG.$UC_SCHEMA.firefly_managed_memory"
  echo
  note "Link expired/used? Re-run and re-execute Phase 9 (Enter-skip through 0–8) to mint a"
  note "fresh one — it reads PREVIEW_URL / GUEST_API_SECRET / guest-SP creds from state.env."
  echo
  note "Resources to clean up when done:"
  note "  databricks apps delete $AGENT_APP_NAME --profile $DB_PROFILE"
  note "  databricks bundle destroy --profile $DB_PROFILE -t dev"
  note "  vercel remove $VERCEL_PROJECT --scope $VERCEL_TEAM"
  note "  Neon project: console.neon.tech → delete project"
fi

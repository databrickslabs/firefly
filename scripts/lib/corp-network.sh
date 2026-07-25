# shellcheck shell=bash
# corp-network.sh — corporate-network handling shared by scripts/bootstrap.sh and the
# Phase 0 block in BOOTSTRAP.md.
#
#   source scripts/lib/corp-network.sh
#   firefly_bridge_corp_network
#
# WHY THIS FILE EXISTS (ENV-0)
# The TLS trust and registry bridges used to live only in bootstrap.sh, while BOOTSTRAP.md
# merely *described* them in prose. Phase 0 of the runbook contained no runnable commands
# at all, so anyone following it top-to-bottom — which is exactly what the README's
# "Open in Cursor" badge instructs — reached the first install step with no bridge set and
# hit a blocked public registry. Keeping one implementation, sourced by both, is what stops
# the runbook and the runner from drifting apart again.
#
# Safe to source from an interactive shell: nothing here sets -e, and every bridge is a
# no-op when the corresponding public registry is already reachable. Never hardcode a
# mirror — every value is read from the user's own configuration.

# ─── minimal helpers (defined only if the caller hasn't already) ──────────────
declare -F note >/dev/null 2>&1 || note() { echo "  $*"; }
declare -F ok   >/dev/null 2>&1 || ok()   { echo "  ✓ $*"; }
declare -F warn >/dev/null 2>&1 || warn() { echo "  ⚠ $*"; }
declare -F fail >/dev/null 2>&1 || fail() { echo "  ✗ $*"; }

: "${INPUTS_DIR:=$HOME/.firefly-bootstrap}"
declare -F init_inputs_dir >/dev/null 2>&1 || \
  init_inputs_dir() { mkdir -p "$INPUTS_DIR"; chmod 700 "$INPUTS_DIR"; }

# Single source of truth for the pnpm version this project installs. Must match the
# `packageManager` field in package.json.
: "${PNPM_VERSION:=10.34.5}"

# ─── TLS trust for intercepting proxies ──────────────────────────────────────
# Python (quickstart, Databricks SDK), Node, curl and uv each consult a different trust
# store, so an intercepting proxy has to be bridged into all of them.

apply_tls_bundle() {   # $1 = pem path — export the trust vars every toolchain reads
  # CURL_CA_BUNDLE is required for the Phase 9 smoke-test curls: curl uses the system
  # store (/etc/ssl/cert.pem) by default and rejects the proxy's cert (000) otherwise.
  export TLS_PEM_PATH="$1" REQUESTS_CA_BUNDLE="$1" SSL_CERT_FILE="$1" \
         NODE_EXTRA_CA_CERTS="$1" CURL_CA_BUNDLE="$1"
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

# ─── uv ← pip index bridge ───────────────────────────────────────────────────
# uv does NOT read pip.conf or PIP_INDEX_URL (verified). On corporate networks that block
# public PyPI and route pip through an internal mirror (Artifactory/Nexus/…), uv silently
# hits pypi.org and fails — even though the user's `pip` works. Bridge the user's OWN
# already-configured pip index into uv via UV_DEFAULT_INDEX.
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

# ─── corepack ← npm registry bridge ──────────────────────────────────────────
# Kept for parity with the uv bridge and for anyone who opts into corepack manually.
# It is NOT part of the supported pnpm path: `npm install -g pnpm@$PNPM_VERSION` uses the
# user's configured registry directly and needs no bridge (see ENV-0 and
# firefly_preflight_npm_registry below).
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
  export COREPACK_NPM_REGISTRY="${reg%/}"   # strip trailing slash → avoid '//pnpm' 404s
  NPM_BRIDGED_REGISTRY="$reg"
}

# ─── npm reachability preflight ──────────────────────────────────────────────
# The bridges above can only forward a mirror the user has already configured. When npm
# still points at public npm AND public npm is blackholed (corp /etc/hosts sinkhole, DNS
# blackhole, firewall drop), every bridge legitimately no-ops and the first install fails
# with an opaque ECONNREFUSED / ETIMEDOUT / 503. Surface the remedy instead of the raw
# error. Returns non-zero if the pinned pnpm cannot be resolved.
#
# Probe with the EXACT operation the install performs — resolving pnpm@$PNPM_VERSION.
# Do NOT use `npm ping`: corporate mirrors commonly proxy package/tarball routes but not
# service endpoints, so `/-/ping` 404s on a mirror that serves installs perfectly well
# (verified against npm-proxy.dev.databricks.com: `npm ping` → 404, `npm view pnpm@10.34.5
# version` → 10.34.5). This is the same mirror behaviour that 404s the `pnpm/latest`
# dist-tag. A ping-based gate would falsely block exactly the users it exists to help.
firefly_preflight_npm_registry() {
  command -v npm >/dev/null 2>&1 || { fail "npm not found — install Node.js 18+ first."; return 1; }
  local reg; reg=$(detect_npm_registry); reg="${reg:-<unset>}"
  # Bound the failure path: npm's default retry/backoff takes ~70s against an unreachable
  # host, which reads as a hang. Fail fast — this is a preflight, not the install.
  if npm view "pnpm@${PNPM_VERSION}" version \
       --fetch-retries=0 --fetch-timeout=15000 >/dev/null 2>&1; then
    ok "npm registry serves pnpm@${PNPM_VERSION}: $reg"
    return 0
  fi
  fail "cannot resolve pnpm@${PNPM_VERSION} from npm registry: $reg"
  case "$reg" in
    *registry.npmjs.org*|'<unset>')
      note "Public npm appears blocked here and npm is not pointed at an approved mirror."
      note "Set your registry, then re-run this phase:"
      note "    npm config set registry <your-approved-mirror-url>"
      ;;
    *)
      note "npm is configured for a mirror but it did not answer. Check VPN/proxy reachability,"
      note "or that the intercepting-proxy CA is trusted (re-run bootstrap.sh --trust-proxy-ca)."
      ;;
  esac
  note "Do NOT work around this with --registry https://registry.npmjs.org or by disabling TLS."
  return 1
}

# ─── orchestrator ────────────────────────────────────────────────────────────
# Non-interactive by design, so it is safe to source from the runbook. bootstrap.sh calls
# the primitives directly instead, because it runs a richer 3-way TLS prompt.
#   FIREFLY_TRUST_PROXY_CA=1   auto-trust a detected proxy CA without prompting
#   TLS_PEM_PATH=<path>        use a CA bundle you already have
firefly_bridge_corp_network() {
  # $HOME/bin holds the gh / databricks / uv binaries installed in Phase 1, and $HOME/bin
  # is on PATH from Phase 0 onward — so it has to exist before anything writes to it.
  mkdir -p "$HOME/bin" "$HOME/.local/bin" 2>/dev/null || true

  # uv ships its OWN bundled cert store (rustls/webpki) and ignores the OS keychain by
  # default, so it rejects an intercepting proxy's cert (UnknownIssuer) even when Node
  # succeeds. Harmless off-proxy — the platform store already trusts public CAs.
  export UV_SYSTEM_CERTS="${UV_SYSTEM_CERTS:-1}"

  if [[ -n "${TLS_PEM_PATH:-}" && -f "${TLS_PEM_PATH}" ]]; then
    apply_tls_bundle "$TLS_PEM_PATH"
    ok "TLS trust from TLS_PEM_PATH → SSL_CERT_FILE / REQUESTS_CA_BUNDLE / NODE_EXTRA_CA_CERTS / CURL_CA_BUNDLE"
  elif derive_proxy_ca_bundle; then
    warn "Intercepting HTTPS proxy detected — its chain terminates in a PRIVATE root CA."
    note "  Root CN:   ${PROXY_CA_ROOT_CN:-<unknown>}"
    note "  SHA-256:   ${PROXY_CA_ROOT_FP:-<unknown>}"
    note "  Copied to: ${PROXY_CA_BUNDLE:-<none>}"
    if [[ "${FIREFLY_TRUST_PROXY_CA:-}" == "1" ]]; then
      apply_tls_bundle "$PROXY_CA_BUNDLE"
      ok "FIREFLY_TRUST_PROXY_CA=1 → proxy CA trusted for this session."
    else
      note "Trust it only if that SHA-256 matches your organization's known root CA. To trust:"
      note "    FIREFLY_TRUST_PROXY_CA=1 firefly_bridge_corp_network"
      note "  or, if you already have a bundle:  TLS_PEM_PATH=<path> firefly_bridge_corp_network"
    fi
  else
    ok "No intercepting proxy detected (TLS to PyPI validates against the system store)."
  fi

  bridge_pip_index_to_uv
  if [[ -n "${PIP_BRIDGED_INDEX:-}" ]]; then
    ok "uv index bridged from pip config → UV_DEFAULT_INDEX=$PIP_BRIDGED_INDEX"
  elif [[ -n "${UV_DEFAULT_INDEX:-}${UV_INDEX_URL:-}" ]]; then
    note "uv index already set via env — leaving as-is."
  else
    note "No pip mirror configured — uv will use public PyPI."
  fi

  bridge_npm_registry_to_corepack
  if [[ -n "${NPM_BRIDGED_REGISTRY:-}" ]]; then
    ok "corepack registry bridged from npm config → COREPACK_NPM_REGISTRY=$COREPACK_NPM_REGISTRY"
  elif [[ -n "${COREPACK_NPM_REGISTRY:-}" ]]; then
    note "corepack registry already set via env — leaving as-is."
  else
    note "No npm mirror configured — npm will use public npm."
  fi
}

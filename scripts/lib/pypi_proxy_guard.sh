#!/usr/bin/env bash
# Guardrails for the known-dead Databricks PyPI proxy.
# This file is sourceable so bootstrap and hermetic tests exercise the same code.

DEAD_PYPI_PROXY_HOST="${DEAD_PYPI_PROXY_HOST:-pypi-proxy.dev.databricks.com}"
CANONICAL_PYPI_PROXY_SIMPLE="${CANONICAL_PYPI_PROXY_SIMPLE:-https://pypi-proxy.cloud.databricks.com/simple}"

pypi_proxy_fail() {
  if declare -F fail >/dev/null 2>&1; then
    fail "$*"
  else
    printf 'FAIL: %s\n' "$*" >&2
  fi
}

pypi_proxy_note() {
  if declare -F note >/dev/null 2>&1; then
    note "$*"
  else
    printf '%s\n' "$*" >&2
  fi
}

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

assert_index_not_dead_pypi_proxy() {
  local label="$1" value="$2"
  [[ -z "$value" ]] && return 0
  case "$value" in
    *"${DEAD_PYPI_PROXY_HOST}"*)
      pypi_proxy_fail "$label uses dead host ${DEAD_PYPI_PROXY_HOST}"
      pypi_proxy_note "Set index to ${CANONICAL_PYPI_PROXY_SIMPLE}, then regenerate any uv.lock that stamped .dev."
      return 1
      ;;
  esac
}

reject_dead_pypi_proxy_config() {
  assert_index_not_dead_pypi_proxy "UV_DEFAULT_INDEX" "${UV_DEFAULT_INDEX:-}" || return 1
  assert_index_not_dead_pypi_proxy "UV_INDEX_URL" "${UV_INDEX_URL:-}" || return 1
  assert_index_not_dead_pypi_proxy "pip index-url" "$(detect_pip_index)" || return 1
  local uv_toml="$HOME/.config/uv/uv.toml"
  if [[ -f "$uv_toml" ]] && grep -q "$DEAD_PYPI_PROXY_HOST" "$uv_toml" 2>/dev/null; then
    pypi_proxy_fail "$uv_toml contains ${DEAD_PYPI_PROXY_HOST}"
    pypi_proxy_note "Replace with ${CANONICAL_PYPI_PROXY_SIMPLE}, then regenerate any uv.lock that stamped .dev."
    return 1
  fi
}

assert_uv_locks_not_dead_pypi_proxy() {
  local f bad=0
  for f in "$@"; do
    [[ -f "$f" ]] || continue
    if grep -q "$DEAD_PYPI_PROXY_HOST" "$f"; then
      pypi_proxy_fail "$f stamps ${DEAD_PYPI_PROXY_HOST} into package sources"
      bad=1
    fi
  done
  if [[ "$bad" -eq 1 ]]; then
    pypi_proxy_note "Fix: point pip/uv at ${CANONICAL_PYPI_PROXY_SIMPLE}, then: rm -f <lock> && uv lock"
    return 1
  fi
}

bridge_pip_index_to_uv() {
  # Respect explicit uv config after reject_dead_pypi_proxy_config validates it.
  [[ -n "${UV_DEFAULT_INDEX:-}${UV_INDEX_URL:-}" ]] && return 0
  [[ -f "$HOME/.config/uv/uv.toml" ]] && return 0
  local idx; idx=$(detect_pip_index)
  [[ -z "$idx" ]] && return 0
  case "$idx" in *pypi.org/simple*) return 0 ;; esac
  assert_index_not_dead_pypi_proxy "pip index-url (bridge)" "$idx" || return 1
  export UV_DEFAULT_INDEX="$idx"
  PIP_BRIDGED_INDEX="$idx"
}

check_pypi_proxy_state() {
  local repo_dir="$1"
  reject_dead_pypi_proxy_config || return 1
  assert_uv_locks_not_dead_pypi_proxy \
    "$repo_dir/agent-build/uv.lock" \
    "$repo_dir/databricks-apps/guest-manager/uv.lock"
}

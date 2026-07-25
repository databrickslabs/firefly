#!/usr/bin/env bash
# Check every tracked uv.lock for the known-dead Databricks PyPI proxy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/pypi_proxy_guard.sh
source "$ROOT/scripts/lib/pypi_proxy_guard.sh"

locks=()
while IFS= read -r lock; do
  locks+=("$ROOT/$lock")
done < <(git -C "$ROOT" ls-files '*uv.lock')

assert_uv_locks_not_dead_pypi_proxy "${locks[@]}"
printf 'OK: %s tracked uv.lock file(s) avoid %s\n' "${#locks[@]}" "$DEAD_PYPI_PROXY_HOST"

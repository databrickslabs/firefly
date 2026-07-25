#!/usr/bin/env bash
# Check every tracked uv.lock for the known-dead Databricks PyPI proxy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/corp-network.sh
source "$ROOT/scripts/lib/corp-network.sh"

locks=()
while IFS= read -r lock; do
  locks+=("$ROOT/$lock")
done < <(git -C "$ROOT" ls-files '*uv.lock')

assert_uv_locks_not_dead_pypi_proxy "${locks[@]}"
printf 'OK: %s tracked uv.lock file(s) avoid %s\n' "${#locks[@]}" "$FIREFLY_UNSANCTIONED_PYPI_HOST"

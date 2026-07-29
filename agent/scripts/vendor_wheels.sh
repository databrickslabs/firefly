#!/usr/bin/env bash
# Pre-fetch linux cp311 wheels so the Databricks Apps build never depends on the
# build container's PyPI egress (dead .dev host / lagging .cloud mirror / no offline
# fallback). Produces vendor-wheels/ that the build installs from via UV_FIND_LINKS.
#
# Run from agent-build/ (after assemble_agent.sh) BEFORE `databricks bundle deploy`.
set -euo pipefail
cd "$(dirname "$0")/.."                     # agent-build root

PY=3.11                                     # MUST match the Apps runtime (cp311), not 3.12
MAXBYTES=10485760                           # workspace-files per-file import cap (10 MB)

echo "==> Locking + exporting requirements for Python ${PY}"
uv lock --python "${PY}"

# Deterministic pins for the whole dependency graph (#64). The Apps build runs a plain
# `uv sync` (uv.lock is excluded from sync — GAP-15), which can otherwise re-resolve a
# transitive dep to a newer release with no Linux wheel (the greenlet 3.5.4 crash).
# UV_CONSTRAINT *bounds* versions without the exact-match rigidity that made
# `uv sync --locked` fail. agent/databricks.yml points UV_CONSTRAINT at this file.
#
# This lives here, not in assemble_agent.sh, because this is the first point at which
# agent-build/uv.lock exists: the template ships no lock and assemble starts by deleting
# the build directory. Exported from the universal lock with environment markers, which
# uv applies on the Linux/cp311 Apps host at install time. Non-fatal: absent file → uv
# ignores it, and the #63 greenlet override still guards the known crash.
if uv export --frozen --no-hashes --no-emit-project -o constraints.txt 2>/dev/null \
   && [[ -s constraints.txt ]]; then
  echo "==> Wrote constraints.txt ($(grep -c '==' constraints.txt) pins) → UV_CONSTRAINT (#64)"
else
  rm -f constraints.txt
  echo "==> WARN: 'uv export' failed; relying on the greenlet override only (#63)." >&2
fi

uv export --python "${PY}" --no-hashes --format requirements-txt --no-emit-project \
  | grep -v "python_full_version >= '3.12'" \
  | grep -v "sys_platform == 'win32'" \
  | sed -E 's/[[:space:]]*;.*$//' | sort -u > .vendor-req.txt

echo "==> Downloading linux cp311 wheels"
rm -rf vendor-wheels && mkdir -p vendor-wheels
python3 -m pip download -r .vendor-req.txt \
  --platform manylinux2014_x86_64 --platform manylinux_2_17_x86_64 \
  --platform manylinux_2_28_x86_64 --platform manylinux_2_27_x86_64 \
  --python-version "${PY}" --implementation cp --abi cp311 --abi none --abi abi3 \
  --only-binary=:all: --dest vendor-wheels

# Workspace files reject files > 10 MB; keep only small wheels in the synced source.
# The few large compiled wheels (pyarrow/scipy/numpy/pandas/mlflow) install from the
# index at build time (stable versions, present on the build mirror).
echo "==> Dropping wheels > 10 MB (installed from index instead):"
# BSD/macOS + GNU find compatible: print then delete
find vendor-wheels -name '*.whl' -size +"${MAXBYTES}"c -print -delete | sed 's#vendor-wheels/#   #'
echo "==> Vendored $(ls vendor-wheels | wc -l | tr -d ' ') wheels (<=10 MB) into vendor-wheels/"

#!/usr/bin/env bash
# Live regression test for Phase 8 app-origin resolution (issue #19).
#
# The hermetic suite (tests/test_phase8_origin.sh) checks the SHAPE of Phase 8. This one
# checks the BEHAVIOUR: it really deploys to Vercel and reads BETTER_AUTH_URL back out of
# the running deployment. It is the test that caught the re-run regression, which no
# static check would have found.
#
# It runs Phase 8 TWICE against the SAME project. That matters: a bare `vercel deploy` is
# production only on a project's FIRST deploy, so a create-and-destroy test — every run a
# first run — cannot see the bug where the second run points BETTER_AUTH_URL at a
# per-deployment preview host. Both of #19's earlier fixes passed exactly that kind of
# suite and shipped broken.
#
# It asserts, on each of the two runs:
#   - the collision path was exercised (Vercel assigned a suffixed domain);
#   - the final deployment is production;
#   - production BETTER_AUTH_URL exists;
#   - the DEPLOYED RUNTIME reports that same origin (via the fixture's /api/auth-url).
#
# Not runnable in GitHub Actions: needs a macOS host, Tart, and a Vercel login. Run it
# by hand before merging anything that touches Phase 8.
#
#   SOURCE_VM=<authed-vm> VERCEL_TEAM=<slug> bash tests/manual/test_phase8_origin_live.sh
#
# Requires:
#   tart + sshpass                    brew install cirruslabs/cli/tart hudochenkov/sshpass/sshpass
#   SOURCE_VM                         a stopped, authenticated macOS VM to clone per run
#   VERCEL_TEAM                       Vercel team slug to deploy into
#   a host Vercel login               ~/Library/Application Support/com.vercel.cli/auth.json
#
# Optional:
#   PHASE8_PROJECT=<name>   pin a project name known to be globally claimed by another
#                           account. The default candidate list is only a heuristic — a
#                           name stops being a valid fixture the moment its owner frees
#                           it, which happened to `firefly-genie` on 2026-07-25.
#   HOST_REPO=<path>        repo under test (default: this checkout)
#   KEEP_VM=1 KEEP_PROJECT=1  leave the VM / Vercel project behind for troubleshooting
#
# Side effects: one temporary Vercel project, removed on exit unless KEEP_PROJECT=1.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

HOST_REPO="${HOST_REPO:-$REPO_ROOT}"
SOURCE_VM="${SOURCE_VM:-}"
RUN_VM="${RUN_VM:-firefly-phase8-origin-live}"
VERCEL_TEAM="${VERCEL_TEAM:-}"
# Pinned rather than `latest`: deploy-target semantics differ across CLI versions, and
# this test is specifically about which target a deploy lands on.
VERCEL_VERSION="${VERCEL_VERSION:-56.3.1}"
KEEP_PROJECT="${KEEP_PROJECT:-0}"
PHASE8_PROJECT="${PHASE8_PROJECT:-}"
KEEP_VM="${KEEP_VM:-0}"
LOG="${LOG:-${TMPDIR:-/tmp}/phase8-origin-live-$(date +%Y%m%d-%H%M%S).log}"
TART_PID=""
HOST_VERCEL_AUTH="${HOME}/Library/Application Support/com.vercel.cli/auth.json"

export SCRIPT_DIR SOURCE_VM RUN_VM

# ── guest SSH helpers (inlined so this test carries no external dependency) ───
vm_ssh() {
  local ip="$1"; shift
  sshpass -p admin ssh \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o IdentitiesOnly=yes -o PreferredAuthentications=password \
    -o PubkeyAuthentication=no "admin@${ip}" "$@"
}

vm_scp() {
  local ip="$1" src="$2" dst="$3"
  sshpass -p admin scp \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o IdentitiesOnly=yes -o PreferredAuthentications=password \
    -o PubkeyAuthentication=no -r "$src" "admin@${ip}:${dst}"
}

vm_wait_ssh() {
  local ip="" _
  for _ in $(seq 1 36); do
    ip=$(tart ip "$RUN_VM" 2>/dev/null || true)
    [[ -n "$ip" ]] && break
    sleep 5
  done
  [[ -n "$ip" ]] || { echo "VM $RUN_VM never reported an IP"; return 1; }
  for _ in $(seq 1 30); do
    vm_ssh "$ip" "echo ready" &>/dev/null && break
    sleep 5
  done
  vm_ssh "$ip" "echo ready" &>/dev/null || { echo "SSH never came up on $ip"; return 1; }
  echo "$ip"
}

[[ -n "$SOURCE_VM" ]] || {
  echo "SOURCE_VM is required — the name of an authenticated macOS VM to clone."
  echo "It needs vercel/gh/neon/databricks CLIs present; see local bake tooling."
  exit 1
}
[[ -n "$VERCEL_TEAM" ]] || { echo "VERCEL_TEAM is required (Vercel team slug)."; exit 1; }
command -v sshpass &>/dev/null || { echo "sshpass is required."; exit 1; }

[[ -f "$HOST_REPO/scripts/bootstrap.sh" ]] || {
  echo "Missing $HOST_REPO/scripts/bootstrap.sh"
  exit 1
}
grep -q 'vercel deploy --prod' "$HOST_REPO/scripts/bootstrap.sh" || {
  echo "HOST_REPO's Phase 8 never deploys with --prod."
  exit 1
}
grep -qE '^[^#]*vercel alias set' "$HOST_REPO/scripts/bootstrap.sh" && {
  echo "HOST_REPO's Phase 8 still pins an alias it may not own (#19)."
  exit 1
}
if ! command -v tart &>/dev/null; then
  echo "Tart is required."
  exit 1
fi
if ! tart list 2>/dev/null | awk '{print $2}' | grep -qx "$SOURCE_VM"; then
  echo "Source VM '$SOURCE_VM' not found. Create a macOS VM with the CLIs installed and"
  echo "a Vercel login baked in, then pass its name as SOURCE_VM. See tests/manual/README.md."
  exit 1
fi
[[ -f "$HOST_VERCEL_AUTH" ]] || {
  echo "Host Vercel auth is missing. Run: vercel login"
  exit 1
}

cleanup() {
  local ec=$?
  set +e
  if [[ "$KEEP_PROJECT" != "1" ]] && tart list 2>/dev/null | awk '{print $2}' | grep -qx "$RUN_VM"; then
    tart exec "$RUN_VM" bash -lc '
      export PATH="$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
      if [[ -f "$HOME/phase8-project-name" ]]; then
        project=$(<"$HOME/phase8-project-name")
        vercel remove "$project" --yes --scope "'"$VERCEL_TEAM"'" >/dev/null 2>&1 || true
      fi
    '
  fi
  if [[ "$KEEP_VM" != "1" ]]; then
    tart stop "$RUN_VM" >/dev/null 2>&1 || true
    tart delete "$RUN_VM" >/dev/null 2>&1 || true
  fi
  [[ -n "$TART_PID" ]] && {
    kill "$TART_PID" >/dev/null 2>&1 || true
    wait "$TART_PID" >/dev/null 2>&1 || true
  }
  set -e
  if [[ $ec -ne 0 ]]; then
    echo "FAILED — log: $LOG"
    [[ "$KEEP_VM" == "1" ]] && echo "VM preserved: $RUN_VM"
  fi
  exit "$ec"
}
trap cleanup EXIT

{
  echo "=== Phase 8 BETTER_AUTH_URL Tart E2E: $(date) ==="
  echo "HOST_REPO=$HOST_REPO SOURCE_VM=$SOURCE_VM RUN_VM=$RUN_VM"

  tart stop "$RUN_VM" >/dev/null 2>&1 || true
  tart delete "$RUN_VM" >/dev/null 2>&1 || true
  tart clone "$SOURCE_VM" "$RUN_VM"
  tart run "$RUN_VM" --no-graphics >"/tmp/${RUN_VM}-tart.log" 2>&1 &
  TART_PID=$!
  disown "$TART_PID" 2>/dev/null || true
  IP=$(vm_wait_ssh)
  echo "VM IP: $IP"

  # bootstrap.sh is no longer self-contained: since #74 it sources lib/corp-network.sh
  # relative to its own directory, so the lib has to travel with it or the script aborts
  # on `source` under `set -euo pipefail`.
  # Rapid successive password logins get refused by the guest's sshd ("Permission
  # denied" / ssh_askpass), so back off and retry rather than assume the first attempt
  # lands. One recursive copy per destination, not one connection per file.
  vm_scp_retry() {
    local i
    for i in 1 2 3 4 5; do
      vm_scp "$@" && return 0
      echo "  scp attempt $i failed; retrying in $((i * 3))s"
      sleep $((i * 3))
    done
    echo "scp failed after 5 attempts: $2 -> $3"
    return 1
  }

  vm_scp_retry "$IP" "$HOST_REPO/scripts/bootstrap.sh" "~/phase8-bootstrap.sh"
  # bootstrap.sh is no longer self-contained: since #74 it sources lib/corp-network.sh
  # relative to its own directory, so the lib has to travel with it.
  [[ -d "$HOST_REPO/scripts/lib" ]] && vm_scp_retry "$IP" "$HOST_REPO/scripts/lib" "~/lib"
  vm_ssh "$IP" 'mkdir -p "$HOME/Library/Application Support/com.vercel.cli"'
  vm_scp "$IP" "$HOST_VERCEL_AUTH" "~/phase8-vercel-auth.json"
  vm_ssh "$IP" 'mv "$HOME/phase8-vercel-auth.json" "$HOME/Library/Application Support/com.vercel.cli/auth.json"'

  vm_ssh "$IP" bash -s -- "$VERCEL_TEAM" "$VERCEL_VERSION" "$PHASE8_PROJECT" <<'GUEST_SETUP'
set -euo pipefail
team="$1"
vercel_version="$2"
project_override="${3:-}"
export PATH="$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
[[ -f "$HOME/corp-ca.pem" ]] && export NODE_EXTRA_CA_CERTS="$HOME/corp-ca.pem" REQUESTS_CA_BUNDLE="$HOME/corp-ca.pem" SSL_CERT_FILE="$HOME/corp-ca.pem"

mkdir -p "$HOME/.npm-global"
npm config set prefix "$HOME/.npm-global"
npm install -g "vercel@$vercel_version"
vercel whoami >/dev/null

# Needs a name that is globally claimed by SOMEONE ELSE but absent from this team, so
# Vercel is forced to assign a suffix. The candidate list is a heuristic: a name is only
# a valid fixture while some other account still holds it, and that can change under us
# (firefly-genie was freed on 2026-07-25 when its project was deleted). Pin one with
# PHASE8_PROJECT when you need a specific, known-taken name.
project="$project_override"
if [[ -z "$project" ]]; then
  for candidate in next-demo starter-app sample-app demo-app; do
    if ! vercel project inspect "$candidate" --scope "$team" >/dev/null 2>&1; then
      project="$candidate"
      break
    fi
  done
fi
[[ -n "$project" ]] || { echo "No safe collision candidate was available"; exit 1; }
printf '%s\n' "$project" > "$HOME/phase8-project-name"

repo="$HOME/phase8-fixture"
rm -rf "$repo"
mkdir -p "$repo/app/api/auth-url" "$repo/node_modules/@neondatabase/serverless" "$repo/.firefly-bootstrap"

cat > "$repo/package.json" <<'EOF'
{
  "private": true,
  "scripts": {"build": "next build"},
  "dependencies": {
    "next": "15.5.7",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  }
}
EOF
cat > "$repo/app/layout.js" <<'EOF'
export default function RootLayout({children}) {
  return <html><body>{children}</body></html>
}
EOF
cat > "$repo/app/page.js" <<'EOF'
export default function Home() { return <main>phase8 fixture</main> }
EOF
cat > "$repo/app/api/auth-url/route.js" <<'EOF'
export async function GET() {
  return Response.json({betterAuthUrl: process.env.BETTER_AUTH_URL || null})
}
EOF
cat > "$repo/.vercelignore" <<'EOF'
node_modules
.firefly-bootstrap
EOF

# Phase 8b-2 imports this package only to clear stale JWKS. Keep that operation
# local and inert; this test targets Vercel deployment/environment behavior.
cat > "$repo/node_modules/@neondatabase/serverless/package.json" <<'EOF'
{"name":"@neondatabase/serverless","type":"module","exports":"./index.js"}
EOF
cat > "$repo/node_modules/@neondatabase/serverless/index.js" <<'EOF'
export function neon() {
  return {query: async () => ({rows: []})}
}
EOF

# Phase 8 asks Databricks only for the already-deployed agent app URL.
mkdir -p "$HOME/bin"
cat > "$HOME/bin/databricks" <<'EOF'
#!/usr/bin/env bash
printf '{"url":"https://agent-fixture.example"}\n'
EOF
chmod +x "$HOME/bin/databricks"

cat > "$HOME/.firefly-bootstrap/inputs.env" <<EOF
export DATABRICKS_HOST='https://dbc-fixture.cloud.databricks.com'
export DB_PROFILE='phase8-fixture'
export UC_CATALOG='workspace'
export UC_SCHEMA='default'
export AGENT_APP_NAME='phase8-fixture'
export LAKEBASE_NAME='phase8-fixture'
export DATABRICKS_ACCOUNT_ID='00000000-0000-0000-0000-000000000000'
export REPO_DIR='$repo'
export VERCEL_TEAM='$team'
export NEON_PROJECT_NAME='phase8-fixture'
export VERCEL_PROJECT='$project'
export COMPLETED_PHASES='1 2 3 4 5 6 6b 7 9'
export LAST_COMPLETED_PHASE='7'
EOF
chmod 600 "$HOME/.firefly-bootstrap/inputs.env"
cat > "$repo/.firefly-bootstrap/state.env" <<'EOF'
export DATABASE_URL='postgresql://fixture.invalid/fixture'
EOF
chmod 600 "$repo/.firefly-bootstrap/state.env"

echo "Collision candidate: $project"
GUEST_SETUP

  run_phase8() {
    echo "=== Execute Phase 8 ($1) ==="
  tart exec "$RUN_VM" bash -lc '
    set -euo pipefail
    export PATH="$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
    [[ -f "$HOME/corp-ca.pem" ]] && export NODE_EXTRA_CA_CERTS="$HOME/corp-ca.pem" REQUESTS_CA_BUNDLE="$HOME/corp-ca.pem" SSL_CERT_FILE="$HOME/corp-ca.pem"
    python3 -c "print(chr(10) * 30, end=\"\")" |
      bash "$HOME/phase8-bootstrap.sh" --trust-proxy-ca
  '
  }

  assert_phase8() {
    echo "=== Assert deployment target and runtime environment ($1) ==="
  tart exec "$RUN_VM" bash -lc '
    set -euo pipefail
    export PATH="$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
    [[ -f "$HOME/corp-ca.pem" ]] && export NODE_EXTRA_CA_CERTS="$HOME/corp-ca.pem" REQUESTS_CA_BUNDLE="$HOME/corp-ca.pem" SSL_CERT_FILE="$HOME/corp-ca.pem"
    project=$(<"$HOME/phase8-project-name")
    team="'"$VERCEL_TEAM"'"
    repo="$HOME/phase8-fixture"
    source "$repo/.firefly-bootstrap/state.env"
    final_url="$PREVIEW_URL"

    [[ "$final_url" == https://*.vercel.app ]] || {
      echo "Invalid final URL: $final_url"; exit 1;
    }
    [[ "$final_url" != "https://${project}.vercel.app" ]] || {
      echo "Collision was not exercised: Vercel assigned the guessed domain"; exit 1;
    }

    inspect=$(vercel inspect "$final_url" --scope "$team" 2>&1)
    printf "%s\n" "$inspect" | grep -qi "production" || {
      echo "Final deployment is not reported as production"; printf "%s\n" "$inspect"; exit 1;
    }

    prod_env=$(mktemp)
    cd "$repo"
    vercel env pull "$prod_env" --environment=production --yes --scope "$team" >/dev/null
    read_env() {
      python3 - "$1" <<'"'"'PY'"'"'
import sys
for line in open(sys.argv[1]):
    if line.startswith("BETTER_AUTH_URL="):
        print(line.split("=", 1)[1].strip().strip("\"").strip(chr(39)))
        break
PY
    }
    prod_auth=$(read_env "$prod_env")
    rm -f "$prod_env"

    runtime_auth=$(curl -fsS "$final_url/api/auth-url" |
      python3 -c "import json,sys; print(json.load(sys.stdin)[\"betterAuthUrl\"] or \"\")")

    [[ -n "$prod_auth" ]] || {
      echo "Production BETTER_AUTH_URL is missing"; exit 1;
    }
    # Vercel marks values supplied by `env add` as Sensitive and returns
    # [SENSITIVE] from `env pull`; the runtime endpoint below is the value proof.
    [[ "$prod_auth" == "[SENSITIVE]" || "$prod_auth" == "$final_url" ]] || {
      echo "Unexpected production BETTER_AUTH_URL representation: $prod_auth"; exit 1;
    }
    [[ "$runtime_auth" == "$final_url" ]] || {
      echo "Runtime BETTER_AUTH_URL mismatch: runtime=$runtime_auth final=$final_url"; exit 1;
    }

    echo "PASS: collision exercised ($project → $final_url)"
    echo "PASS: final deployment is production"
    echo "PASS: production BETTER_AUTH_URL exists"
    echo "PASS: deployed runtime observes final BETTER_AUTH_URL"
  '
  }

  run_phase8    "first run"
  assert_phase8 "first run"

  # Clear Phase 8 from the completed set so it executes again — the supported resume
  # path (issue #49), and the case a fresh-project-per-test can never reach.
  echo "=== Reset phase state and re-run Phase 8 against the SAME project ==="
  tart exec "$RUN_VM" bash -lc '
    sed -i "" "s/^export COMPLETED_PHASES=.*/export COMPLETED_PHASES=1\\\\ 2\\\\ 3\\\\ 4\\\\ 5\\\\ 6\\\\ 6b\\\\ 7\\\\ 9/" ~/.firefly-bootstrap/inputs.env
    grep COMPLETED_PHASES ~/.firefly-bootstrap/inputs.env
  '

  run_phase8    "re-run"
  assert_phase8 "re-run"

  echo "=== PASS: Phase 8 origin regression test (first run + re-run) ==="
} 2>&1 | tee "$LOG"

echo "Log: $LOG"

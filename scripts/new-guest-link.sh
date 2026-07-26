#!/usr/bin/env bash
# new-guest-link.sh — Mint a fresh guest login link for a deployed Firefly app.
#
# Guest links are single-use and expire ~10 minutes after they are minted; a
# refresh or back-navigation also consumes one. The link Phase 9 produces is
# therefore usually dead by the time anyone clicks it, and re-running bootstrap
# to get a live one is absurd. This replays only the three guest API calls.
#
# Usage:
#   bash scripts/new-guest-link.sh              # from $REPO_DIR
#   bash scripts/new-guest-link.sh --open       # also open it in a browser
#   bash scripts/new-guest-link.sh --state PATH # a different state.env
#
# Reads PREVIEW_URL, GUEST_API_SECRET, GUEST_SP_CLIENT_ID and GUEST_SP_SECRET
# from $REPO_DIR/.firefly-bootstrap/state.env, all written during bootstrap.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="${FIREFLY_STATE_ENV:-$ROOT/.firefly-bootstrap/state.env}"
OPEN_IT=0
APP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --state) STATE="$2"; shift 2 ;;
    --app)   APP="$2"; shift 2 ;;
    --open)  OPEN_IT=1; shift ;;
    -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -f "$STATE" ]]; then
  echo "ERROR: no state file at $STATE" >&2
  echo "       Run bootstrap first, or pass --state <path>." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$STATE"; set +a

APP="${APP:-${PREVIEW_URL:-}}"
[[ -n "$APP" ]] || { echo "ERROR: PREVIEW_URL not in $STATE (pass --app)" >&2; exit 1; }

for v in GUEST_API_SECRET GUEST_SP_CLIENT_ID GUEST_SP_SECRET; do
  [[ -n "${!v:-}" ]] || { echo "ERROR: $v missing from $STATE" >&2; exit 1; }
done

# A 128-char secret is a real `openssl rand -hex 64`. Anything short is the
# redacted placeholder `vercel env pull` hands back, which 401s every call.
if [[ ${#GUEST_API_SECRET} -ne 128 ]]; then
  echo "ERROR: GUEST_API_SECRET is ${#GUEST_API_SECRET} chars, expected 128." >&2
  echo "       That is the redacted placeholder, not the secret. See Phase 9." >&2
  exit 1
fi

post() { # path json
  curl -sS -X POST "$APP$1" \
    -H "X-API-Key: $GUEST_API_SECRET" \
    -H "Content-Type: application/json" \
    -d "$2"
}

die_with() { echo "ERROR: $1" >&2; [[ -n "${2:-}" ]] && echo "       response: ${2:0:300}" >&2; exit 1; }

WS_RESP="$(post /api/guest/workspaces \
  "{\"name\":\"Guest Access\",\"workspaceUrl\":\"${DATABRICKS_HOST:-$APP}\"}")"
WS_ID="$(printf '%s' "$WS_RESP" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['workspace']['id'])" 2>/dev/null)"
[[ -n "$WS_ID" ]] || die_with "could not create a guest workspace record" "$WS_RESP"

SPN_RESP="$(post /api/guest/spns \
  "{\"name\":\"Guest SPN\",\"clientId\":\"$GUEST_SP_CLIENT_ID\",\"clientSecret\":\"$GUEST_SP_SECRET\",\"guestWorkspaceId\":\"$WS_ID\"}")"
SPN_ID="$(printf '%s' "$SPN_RESP" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('spn') or d).get('id',''))" 2>/dev/null)"
[[ -n "$SPN_ID" ]] || die_with "could not attach the guest service principal" "$SPN_RESP"

GU_RESP="$(post /api/guest/users "{\"orgName\":\"Guest Org\",\"spnId\":\"$SPN_ID\"}")"
read -r EMAIL URL < <(printf '%s' "$GU_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin); g=d.get('guestUser',d)
print(g.get('email',''), g.get('loginUrl',''))
" 2>/dev/null)
[[ -n "${URL:-}" ]] || die_with "no loginUrl returned" "$GU_RESP"

echo "guest user: $EMAIL"
echo ""
echo "$URL"
echo ""
echo "Single use, valid ~10 minutes. Open it ONCE - a refresh or back-navigation"
echo "invalidates it. Re-run this script for another."

[[ "$OPEN_IT" == "1" ]] && { command -v open >/dev/null && open "$URL"; }
exit 0

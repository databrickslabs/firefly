#!/usr/bin/env bash
# genie-data-setup.sh — Phase 6c: make sure Genie has data, and a space, to work with.
#
# WHY THIS EXISTS
# Bootstrap used to finish "successfully" on a fresh workspace while Genie could
# not answer a single data question, because $UC_CATALOG.$UC_SCHEMA was empty.
# Phase 6c detected that and the runbook ended with homework. The user was never
# offered a way to fix it during the run (#83).
#
# This script is invoked identically from BOOTSTRAP.md and scripts/bootstrap.sh,
# for the same reason scripts/lib/runbook.sh exists: one implementation, so the
# runbook and the automated runner cannot drift.
#
# SAFETY RULES (do not relax these)
#   * Never clobber a table that already exists. CREATE TABLE IF NOT EXISTS only.
#   * Never touch a Genie space this script did not create, even one covering the
#     same schema. Create ours alongside it. The sole exception is a space the
#     user named explicitly in --space-ids.
#   * Never emit GENIE_MCP_MODE=space without a non-empty GENIE_SPACE_ID:
#     agent.py raises ValueError on that combination and the app fails to boot.
#   * Only switch to space mode after confirming the agent SP can actually run
#     the space. A working agent on Genie Agent beats a scoped-but-broken one.
#
# Output: `KEY=value` lines on stdout for the caller to capture. Everything
# human-facing goes to stderr, so `eval "$(genie-data-setup.sh ...)"` is safe.
set -uo pipefail

# Define the progress helpers BEFORE sourcing the lib, which only defines them if
# they are missing. The lib's versions print to stdout; here stdout is the machine
# contract, so every human-facing line has to go to stderr instead.
note() { echo "  $*" >&2; }
ok()   { echo "  ✓ $*" >&2; }
warn() { echo "  ⚠ $*" >&2; }
fail() { echo "  ✗ $*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/runbook.sh
. "$SCRIPT_DIR/lib/runbook.sh"

SEED_SOURCE="${FIREFLY_SEED_SOURCE:-samples.wanderbricks}"
# Ownership marker. A space is "ours" only if the title matches this exactly, so a
# re-run reuses it instead of creating a duplicate, and a foreign space covering
# the same schema is never mistaken for ours.
space_title_for() { printf 'Firefly Genie Agent — %s.%s' "$1" "$2"; }

CATALOG="" SCHEMA="" PROFILE="" WAREHOUSE_ID=""
SEED="yes" SPACE_IDS="" CREATE_SPACE="yes" GRANT_GUEST="no"
# This script is called by two phases. Hardcoding one of their names meant a reader in
# Phase 3f was told about "Phase 6c using warehouse ..." and sent looking for a phase they
# had not reached. The caller says who it is.
PHASE_LABEL="6c"
GUEST_SP="" AGENT_SP=""

usage() {
  cat >&2 <<'USAGE'
usage: genie-data-setup.sh --catalog C --schema S --profile P [options]

  --catalog C          UC catalog holding the agent's data
  --schema S           UC schema within that catalog
  --profile P          Databricks CLI profile
  --warehouse-id W     SQL warehouse (default: first available)
  --phase LABEL        Phase name to use in messages (default 6c), so a reader is not
                       pointed at a phase they are not in.
  --seed yes|no|skip   Seed sample data when the schema is empty (default yes). "skip"
                       means seeding is not this call's concern, as distinct from "no",
                       which is a decision not to seed and is reported as one.
  --space-ids a,b      Use these existing Genie space ids instead of creating one
  --create-space y|n   Create a space when --space-ids is empty (default yes)
  --defer-grants       The SPs do not exist yet, so make no grants and say where
                       they happen. Distinct from --grant-guest no, which is a
                       decision to withhold access.
  --grant-guest y|n    Grant the guest SP CAN_RUN on the space(s) + SELECT on
                       the tables they reference (default no)
  --guest-sp ID        Guest service principal application (client) id
  --agent-sp ID        Agent app service principal application (client) id

Emits: SEED_STATUS, SEED_TABLE_COUNT, GENIE_SPACE_ID, GENIE_SPACE_IDS,
       GENIE_SPACE_SOURCE, GENIE_MCP_MODE
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --catalog) CATALOG="${2:-}"; shift 2 ;;
    --schema) SCHEMA="${2:-}"; shift 2 ;;
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --warehouse-id) WAREHOUSE_ID="${2:-}"; shift 2 ;;
    --phase) PHASE_LABEL="${2:-6c}"; shift 2 ;;
    --seed) SEED="${2:-yes}"; shift 2 ;;
    --space-ids) SPACE_IDS="${2:-}"; shift 2 ;;
    --create-space) CREATE_SPACE="${2:-yes}"; shift 2 ;;
    --defer-grants) DEFER_GRANTS=yes; shift ;;
    --grant-guest) GRANT_GUEST="${2:-no}"; shift 2 ;;
    --guest-sp) GUEST_SP="${2:-}"; shift 2 ;;
    --agent-sp) AGENT_SP="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown flag: $1" >&2; usage; exit 2 ;;
  esac
done

[ -n "$CATALOG" ] && [ -n "$SCHEMA" ] && [ -n "$PROFILE" ] || { usage; exit 2; }

# Normalize the yes/no flags once; "None"/"none" is how Phase 0 spells "unset".
yn() { case "$(printf '%s' "${1:-}" | tr 'A-Z' 'a-z')" in y|yes|true|1) echo yes ;; *) echo no ;; esac; }
[ "$SEED" = "skip" ] || SEED="$(yn "$SEED")"; CREATE_SPACE="$(yn "$CREATE_SPACE")"; GRANT_GUEST="$(yn "$GRANT_GUEST")"
case "$(printf '%s' "$SPACE_IDS" | tr 'A-Z' 'a-z')" in none|null|"") SPACE_IDS="" ;; esac

dbx() { databricks "$@" --profile "$PROFILE"; }

# ─── warehouse ────────────────────────────────────────────────────────────────
if [ -z "$WAREHOUSE_ID" ]; then
  WAREHOUSE_ID="$(dbx warehouses list -o json 2>/dev/null | python3 -c 'import sys,json
try: ws = json.load(sys.stdin) or []
except Exception: ws = []
ws = ws.get("warehouses", ws) if isinstance(ws, dict) else ws
# Prefer a warehouse that is already RUNNING: a cold start adds minutes to Phase 6c.
for want in ("RUNNING", None):
    for w in ws:
        if want is None or w.get("state") == want:
            print(w.get("id","")); raise SystemExit
print("")' 2>/dev/null)"
fi
[ -n "$WAREHOUSE_ID" ] || { fail "no SQL warehouse available — Genie cannot run queries without one"; exit 1; }
note "Phase $PHASE_LABEL using warehouse $WAREHOUSE_ID"

sql()        { firefly_sql "$WAREHOUSE_ID" "$1" "$PROFILE"; }
sql_scalar() { firefly_sql_scalar "$WAREHOUSE_ID" "$1" "$PROFILE"; }

# ─── 1. seed ──────────────────────────────────────────────────────────────────
# The decision to seed is gated on the schema being empty (or holding nothing but
# our own seed tables — that is how a half-finished seed self-heals on a re-run).
# A schema with any foreign table is the user's data: report and leave it alone.
existing_tables() { sql "SHOW TABLES IN \`$CATALOG\`.\`$SCHEMA\`" 2>/dev/null | cut -f2 | sed '/^$/d'; }

SEED_STATUS="skipped"
SRC_CATALOG="${SEED_SOURCE%%.*}"; SRC_SCHEMA="${SEED_SOURCE#*.}"

# Newline-delimited strings, not arrays: `mapfile` is bash 4+ and the target is
# stock macOS bash 3.2 (SHELL-PORTABILITY).
EXISTING="$(existing_tables)"
EXISTING_COUNT="$(printf '%s\n' "$EXISTING" | sed '/^$/d' | wc -l | tr -d ' ')"

if [ "$SEED" != "yes" ]; then
  if [ "$SEED" = "skip" ]; then
    # The grants-only call passes --seed skip. It previously passed --seed no, and the run
    # then told the operator that seeding was "declined at Phase 0" when Phase 0 had in fact
    # answered yes and Phase 3f had already seeded 16 tables. Same defect as the grant
    # deferral above: a flag meaning "not here" was read back as a decision.
    SEED_STATUS="not-this-phase"
  else
    SEED_STATUS="declined"
    note "seeding declined at Phase 0 — leaving ${CATALOG}.${SCHEMA} as-is"
  fi
else
  # Probe the source, keeping stderr. The previous version discarded it with
  # 2>/dev/null and reported one message — "not readable from this workspace" —
  # for four different causes: the schema not existing yet, existing but empty, a
  # real permission denial, and a warehouse/SQL error. That reads as a permanent
  # entitlement problem when it is usually neither permanent nor permissions.
  #
  # On a BRAND-NEW workspace the real cause is a race: `samples` is provisioned
  # asynchronously and Phase 6c can run before it lands. Observed on a fresh
  # workspace — Phase 4 finished 12:04:46Z, Phase 6c probed ~12:05:00Z, and the
  # samples.wanderbricks schema was not created until 12:05:39Z. A re-run minutes
  # later seeded all 16 tables. So wait for it rather than declaring defeat 40
  # seconds early.
  SRC_TABLES=""
  SRC_ERR=""
  _src_out="$(mktemp)"; _src_err="$(mktemp)"
  _deadline=$(( $(date +%s) + ${FIREFLY_SEED_SOURCE_WAIT:-180} ))
  while :; do
    : > "$_src_out"; : > "$_src_err"
    sql "SHOW TABLES IN \`$SRC_CATALOG\`.\`$SRC_SCHEMA\`" >"$_src_out" 2>"$_src_err"
    SRC_TABLES="$(cut -f2 "$_src_out" 2>/dev/null | sed '/^$/d')"
    SRC_ERR="$(tr '\n' ' ' < "$_src_err")"
    [ -n "$SRC_TABLES" ] && break
    # A denial will not resolve by waiting; stop immediately and say so.
    case "$SRC_ERR" in
      *PERMISSION_DENIED*|*[Pp]ermission*|*[Ff]orbidden*|*UNAUTHORIZED*) break ;;
    esac
    [ "$(date +%s)" -ge "$_deadline" ] && break
    note "$SEED_SOURCE not populated yet — waiting 15s (a fresh workspace provisions it asynchronously)"
    sleep 15
  done
  rm -f "$_src_out" "$_src_err"

  if [ -z "$SRC_TABLES" ]; then
    # Say WHICH of the four it was, and show the server's own words.
    case "$SRC_ERR" in
      *PERMISSION_DENIED*|*[Pp]ermission*|*[Ff]orbidden*|*UNAUTHORIZED*)
        SEED_STATUS="source-denied"
        warn "no permission to read $SEED_SOURCE — grant SELECT on it, or set SEED_SAMPLE_DATA=no" ;;
      *SCHEMA_NOT_FOUND*|*does\ not\ exist*|*NOT_FOUND*|*[Nn]ot\ [Ff]ound*)
        SEED_STATUS="source-not-ready"
        warn "$SEED_SOURCE does not exist yet after ${FIREFLY_SEED_SOURCE_WAIT:-180}s."
        note "On a new workspace the samples catalog is provisioned asynchronously."
        note "Re-run this phase in a few minutes; the data is not missing, just late:"
        note "  databricks tables list $SRC_CATALOG $SRC_SCHEMA --profile $PROFILE" ;;
      "")
        SEED_STATUS="source-empty"
        warn "$SEED_SOURCE exists but reported no tables after ${FIREFLY_SEED_SOURCE_WAIT:-180}s."
        note "Re-run this phase once it is populated." ;;
      *)
        SEED_STATUS="source-error"
        warn "could not read $SEED_SOURCE: $SRC_ERR" ;;
    esac
  else
    # Is every existing table one of ours? Then a partial seed can be completed.
    foreign=0
    for t in $EXISTING; do
      printf '%s\n' "$SRC_TABLES" | grep -qxF "$t" || { foreign=1; break; }
    done
    # Which source tables are still missing? Distinguishing "nothing to do" from
    # "seeded 16" matters: a re-run that reports `seeded` looks like it rewrote
    # the schema when it did nothing at all.
    MISSING=""
    for t in $SRC_TABLES; do
      printf '%s\n' "$EXISTING" | grep -qxF "$t" || MISSING="${MISSING}${MISSING:+ }$t"
    done

    if [ "$EXISTING_COUNT" -gt 0 ] && [ "$foreign" = "1" ]; then
      SEED_STATUS="already-populated"
      note "${CATALOG}.${SCHEMA} already holds tables that are not ours — not seeding"
    elif [ -z "$MISSING" ]; then
      SEED_STATUS="already-seeded"
      ok "${CATALOG}.${SCHEMA} already holds all $EXISTING_COUNT seed table(s) — nothing to do"
    else
      [ "$EXISTING_COUNT" -gt 0 ] && note "completing a partial seed ($EXISTING_COUNT present, $(set -- $MISSING; echo $#) missing)"
      made=0 failed=0
      for t in $MISSING; do
        # IF NOT EXISTS is what makes this non-destructive and re-runnable.
        if sql "CREATE TABLE IF NOT EXISTS \`$CATALOG\`.\`$SCHEMA\`.\`$t\` AS SELECT * FROM \`$SRC_CATALOG\`.\`$SRC_SCHEMA\`.\`$t\`" >/dev/null 2>&1; then
          made=$((made + 1))
        else
          failed=$((failed + 1)); warn "could not seed $t"
        fi
      done
      SEED_STATUS="seeded"
      [ "$failed" -gt 0 ] && SEED_STATUS="seeded-partial"
      ok "seeded $made table(s) from $SEED_SOURCE into ${CATALOG}.${SCHEMA}"
    fi
  fi
fi

SEED_TABLE_COUNT="$(existing_tables | wc -l | tr -d ' ')"

# ─── 2. Genie space ───────────────────────────────────────────────────────────
# Table identifiers the space will reference. Sorted, because the API stores
# data_sources.tables sorted by identifier and an unsorted payload round-trips
# differently than it was sent.
space_tables() { existing_tables | sed "s/^/${CATALOG}.${SCHEMA}./" | LC_ALL=C sort; }

get_space() { dbx api get "/api/2.0/genie/spaces/$1?include_serialized_space=true" 2>/dev/null; }

# A space is readable, or we retried long enough to mean it. A single GET here abandoned
# a space this script had just created, round-tripped 16 tables through, and granted
# CAN_RUN on: one transient failure printed "not readable - staying on workspace-wide Genie",
# cleared GENIE_SPACE_ID, and shipped the app on Genie Agent. The same GET succeeded
# minutes later. Reads after a create are eventually consistent, so treat one failure as
# "not yet" rather than "not there", and keep stderr so a real error can be named --
# the discarded-stderr version could only ever say "not readable", whatever went wrong.
space_readable() {                     # space_readable <space_id> [budget_s]
  local sid="$1" budget="${2:-90}" waited=0 raw err=""
  while :; do
    raw="$(dbx api get "/api/2.0/genie/spaces/$sid?include_serialized_space=true" 2>&1 || true)"
    case "$raw" in
      *'"space_id"'*) return 0 ;;
    esac
    err="$(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-160)"
    [ "$waited" -ge "$budget" ] && break
    [ "$waited" -eq 0 ] && note "space $sid not readable yet; retrying for up to ${budget}s"
    sleep 10
    waited=$((waited + 10))
  done
  warn "space $sid still unreadable after ${budget}s. The API said:"
  warn "  ${err:-(no output)}"
  return 1
}

GENIE_SPACE_ID="" GENIE_SPACE_SOURCE="none" GENIE_MCP_MODE="one"
RESOLVED_IDS=""

if [ -n "$SPACE_IDS" ]; then
  # User-supplied ids: verify each is real and readable, then use them verbatim.
  # These are the only spaces this script is permitted to touch.
  for sid in $(printf '%s' "$SPACE_IDS" | tr ', ' '\n' | sed '/^$/d'); do
    if space_readable "$sid" 30; then
      RESOLVED_IDS="${RESOLVED_IDS}${RESOLVED_IDS:+ }$sid"
    else
      warn "skipping Genie space $sid — see the API message above"
    fi
  done
  if [ -n "$RESOLVED_IDS" ]; then
    GENIE_SPACE_ID="${RESOLVED_IDS%% *}"
    GENIE_SPACE_SOURCE="user-supplied"
    ok "using user-supplied Genie space(s): $RESOLVED_IDS"
  else
    warn "none of the supplied space ids were usable — falling back to workspace-wide Genie"
  fi
elif [ "$CREATE_SPACE" = "yes" ]; then
  WANT_TITLE="$(space_title_for "$CATALOG" "$SCHEMA")"
  # Ours = exact title match AND covers this schema. Anything else is off-limits.
  MINE="$(dbx api get "/api/2.0/genie/spaces?page_size=100" 2>/dev/null | FF_TITLE="$WANT_TITLE" python3 -c 'import sys,json,os
want = os.environ["FF_TITLE"]
try: d = json.load(sys.stdin) or {}
except Exception: d = {}
for s in d.get("spaces") or []:
    if (s.get("title") or "") == want:
        print(s.get("space_id","")); break' 2>/dev/null)"

  if [ -n "$MINE" ]; then
    GENIE_SPACE_ID="$MINE"; GENIE_SPACE_SOURCE="reused-ours"
    ok "reusing the Genie space this bootstrap created earlier ($MINE)"
  else
    TABLES="$(space_tables)"
    if [ -z "$TABLES" ]; then
      warn "no tables in ${CATALOG}.${SCHEMA} — not creating an empty Genie space"
    else
      REQ="$(mktemp -t ffgenie)"
      FF_TABLES="$TABLES" FF_TITLE="$WANT_TITLE" FF_WH="$WAREHOUSE_ID" \
      FF_DESC="Firefly agent data in ${CATALOG}.${SCHEMA}. Created by BOOTSTRAP.md Phase 6c." \
      python3 -c 'import json, os, sys
tables = [t for t in os.environ["FF_TABLES"].split("\n") if t.strip()]
space = {
    "version": 2,
    "data_sources": {"tables": [{"identifier": t} for t in sorted(tables)]},
    "instructions": {},
}
sys.stdout.write(json.dumps({
    "title": os.environ["FF_TITLE"],
    "description": os.environ["FF_DESC"],
    "warehouse_id": os.environ["FF_WH"],
    "serialized_space": json.dumps(space),
}))' > "$REQ"
      NEW="$(dbx api post /api/2.0/genie/spaces --json "@$REQ" 2>&1)"
      rm -f "$REQ"
      GENIE_SPACE_ID="$(printf '%s' "$NEW" | python3 -c 'import sys,json
try: print((json.load(sys.stdin) or {}).get("space_id") or "")
except Exception: print("")' 2>/dev/null)"
      if [ -n "$GENIE_SPACE_ID" ]; then
        GENIE_SPACE_SOURCE="created"
        ok "created Genie space $GENIE_SPACE_ID over $(printf '%s\n' "$TABLES" | sed '/^$/d' | wc -l | tr -d ' ') table(s)"
        # Round-trip verify: the stored space must hold the tables we sent.
        got="$(get_space "$GENIE_SPACE_ID" | python3 -c 'import sys,json
try: d = json.load(sys.stdin) or {}
except Exception: raise SystemExit
ss = d.get("serialized_space") or "{}"
ss = json.loads(ss) if isinstance(ss, str) else ss
print(len((ss.get("data_sources") or {}).get("tables") or []))' 2>/dev/null)"
        note "round-trip: space reports ${got:-0} table(s)"
      else
        warn "Genie space creation failed — staying on workspace-wide Genie"
        printf '%s\n' "$NEW" | head -3 >&2
      fi
    fi
  fi
else
  note "Genie space creation declined at Phase 0 — staying on workspace-wide Genie"
fi

[ -n "$RESOLVED_IDS" ] || RESOLVED_IDS="$GENIE_SPACE_ID"

# ─── 3. grants ────────────────────────────────────────────────────────────────
# CAN_RUN is "view and ask questions" — the level an SP needs to serve the agent.
grant_space_run() {                      # grant_space_run <space_id> <sp_client_id>
  local sid="$1" sp="$2" req
  [ -n "$sid" ] && [ -n "$sp" ] || return 0
  req="$(mktemp -t ffperm)"
  FF_SP="$sp" python3 -c 'import json,os,sys
sys.stdout.write(json.dumps({"access_control_list":[
    {"service_principal_name": os.environ["FF_SP"], "permission_level": "CAN_RUN"}]}))' > "$req"
  # PATCH adds to the ACL; PUT would replace it and drop the owner's CAN_MANAGE.
  if dbx api patch "/api/2.0/permissions/genie/$sid" --json "@$req" >/dev/null 2>&1; then
    ok "granted CAN_RUN on space $sid to $sp"
  else
    warn "could not grant CAN_RUN on space $sid to $sp"
  fi
  rm -f "$req"
}

# The tables a space actually references — the set that needs SELECT.
space_table_identifiers() {              # space_table_identifiers <space_id>
  get_space "$1" | python3 -c 'import sys,json
try: d = json.load(sys.stdin) or {}
except Exception: raise SystemExit
ss = d.get("serialized_space") or "{}"
ss = json.loads(ss) if isinstance(ss, str) else ss
for t in (ss.get("data_sources") or {}).get("tables") or []:
    ident = t.get("identifier")
    if ident: print(ident)' 2>/dev/null
}

grant_table_select() {                   # grant_table_select <sp_client_id> <space_id...>
  local sp="$1"; shift
  [ -n "$sp" ] || return 0
  local sid ident cat sch seen="" n=0 failed=0 first_err="" _gt_err
  local _covered _present _missing
  for sid in "$@"; do
    [ -n "$sid" ] || continue
    for ident in $(space_table_identifiers "$sid"); do
      cat="${ident%%.*}"; sch="${ident#*.}"; sch="${sch%%.*}"
      # USE CATALOG / USE SCHEMA once per namespace, then SELECT per table.
      case " $seen " in
        *" $cat.$sch "*) ;;
        *)
          sql "GRANT USE CATALOG ON CATALOG \`$cat\` TO \`$sp\`" >/dev/null 2>&1
          sql "GRANT USE SCHEMA ON SCHEMA \`$cat\`.\`$sch\` TO \`$sp\`" >/dev/null 2>&1
          seen="$seen $cat.$sch"
          ;;
      esac
      _gt_err="$(sql "GRANT SELECT ON TABLE $ident TO \`$sp\`" 2>&1 >/dev/null)" \
        && n=$((n + 1)) \
        || { failed=$((failed + 1))
             [ -z "$first_err" ] && first_err="$ident: $(printf '%s' "$_gt_err" | head -1)"; }
    done
  done
  [ "$n" -gt 0 ] && ok "granted SELECT on $n table(s) to $sp"
  # Failures used to go to /dev/null and only the success count was printed, so a table the
  # guest cannot read was indistinguishable from one it can. Say so.
  if [ "$failed" -gt 0 ]; then
    warn "$failed SELECT grant(s) FAILED for $sp - those tables will refuse guest queries"
    warn "  first failure: $first_err"
  fi

  # A count that disagrees with what was seeded is the reader's problem to explain unless we
  # explain it. A run seeded 16 tables and this reported 15 with no reason given; whether the
  # 16th belongs in the space is a real question, and it cannot be asked if nobody says which
  # table is absent. Compare the space's coverage against the schema and name the difference.
  _covered="$(for sid in "$@"; do [ -n "$sid" ] && space_table_identifiers "$sid"; done \
    | sed -E 's/.*\.//' | sort -u)"
  _present="$(existing_tables | sort -u)"
  _missing="$(comm -23 <(printf '%s\n' "$_present") <(printf '%s\n' "$_covered") 2>/dev/null)"
  if [ -n "$_missing" ]; then
    warn "these tables exist in ${CATALOG}.${SCHEMA} but are NOT in the Genie space, so"
    warn "  Genie cannot query them and they get no grant:"
    printf '%s\n' "$_missing" | sed 's/^/    - /' >&2
  fi
}

for sid in $RESOLVED_IDS; do
  [ -n "$AGENT_SP" ] && grant_space_run "$sid" "$AGENT_SP"
done

# The Phase 0 answer decides this, and it is honoured exactly.
#
# An earlier fix here forced the grant whenever bootstrap had created the space itself,
# on the reasoning that guests cannot use the space otherwise. That reasoning is right
# and the implementation was wrong: Phase 0 presents GRANT_GUEST_SPACE_ACCESS as a
# controlling input, so overriding it made the runbook do something other than what it
# told the operator -- the same defect as any misleading message, just with permissions.
# Two runs reported it independently. The ask now defaults to yes and is put for every
# path, so the guest flow works by default without anyone's answer being discarded.
#
# Saying no is legitimate, and its cost is stated rather than left to be discovered.
# "Not granting now" and "decided not to grant" are different facts, and collapsing them
# produced exactly the misleading message this comment block warns about. Phase 3f creates
# the space before any SP exists, so it cannot grant and deliberately passes no --grant-guest;
# a missing flag defaulted to no, and the run told the operator their yes meant the guest SP
# would get NO access -- while Phase 6c went on to grant it. The reader is left believing
# their Phase 0 answer was discarded. Deferral gets its own state and names where it lands.
if [ "${DEFER_GRANTS:-no}" = "yes" ]; then
  case "$GENIE_SPACE_SOURCE" in
    created|reused-ours)
      note "no grants here: the agent and guest service principals do not exist yet."
      note "  Phase 6c grants CAN_RUN on space $GENIE_SPACE_ID and SELECT on its tables,"
      note "  honouring GRANT_GUEST_SPACE_ACCESS." ;;
  esac
elif [ "$GRANT_GUEST" != "yes" ]; then
  case "$GENIE_SPACE_SOURCE" in
    created|reused-ours)
      warn "GRANT_GUEST_SPACE_ACCESS=no, so the guest SP gets NO access to space"
      warn "  $GENIE_SPACE_ID. Guest users will reach the app and be unable to ask"
      warn "  data questions. Re-run Phase 6c with GRANT_GUEST_SPACE_ACCESS=yes to"
      warn "  grant CAN_RUN on the space and SELECT on its tables." ;;
  esac
fi

if [ "${DEFER_GRANTS:-no}" = "yes" ]; then
  :
elif [ "$GRANT_GUEST" = "yes" ] && [ -n "$GUEST_SP" ]; then
  for sid in $RESOLVED_IDS; do grant_space_run "$sid" "$GUEST_SP"; done
  # shellcheck disable=SC2086
  grant_table_select "$GUEST_SP" $RESOLVED_IDS
elif [ "$GRANT_GUEST" = "yes" ]; then
  warn "no --guest-sp given, so the guest SP has NO access to the Genie space."
  warn "Guest users will not be able to ask data questions. Re-run Phase 6c after"
  warn "Phase 6b has created the guest SP, passing --guest-sp \$GUEST_SP_CLIENT_ID."
fi

# ─── 4. decide the app's Genie mode ───────────────────────────────────────────
# Only claim space mode if the space is really there. agent.py raises ValueError
# when GENIE_MCP_MODE=space and GENIE_SPACE_ID is empty, which fails the app boot.
if [ -n "$GENIE_SPACE_ID" ]; then
  if space_readable "$GENIE_SPACE_ID" 90; then
    GENIE_MCP_MODE="space"
  else
    # Falling back is a real cost: the app loses the curated space and lands on
    # Genie Agent, which guest users cannot use. Say what was given up and why, so
    # this is never mistaken for "no space was wanted".
    warn "abandoning space $GENIE_SPACE_ID (source: $GENIE_SPACE_SOURCE) — staying on workspace-wide Genie"
    case "$GENIE_SPACE_SOURCE" in
      created|reused-ours)
        warn "  this space WAS created and granted successfully in this run, so an"
        warn "  unreadable GET is more likely a transient API failure than a missing"
        warn "  space. Re-run Phase 6c: it reuses the space by title instead of"
        warn "  creating a second one, and the app then redeploys in space mode." ;;
    esac
    GENIE_SPACE_ID=""; GENIE_MCP_MODE="one"
  fi
fi
[ "$GENIE_MCP_MODE" = "space" ] || GENIE_SPACE_ID=""

printf 'SEED_STATUS=%s\n'         "$SEED_STATUS"
printf 'SEED_TABLE_COUNT=%s\n'    "$SEED_TABLE_COUNT"
printf 'GENIE_SPACE_ID=%s\n'      "$GENIE_SPACE_ID"
printf 'GENIE_SPACE_IDS=%s\n'     "$RESOLVED_IDS"
printf 'GENIE_SPACE_SOURCE=%s\n'  "$GENIE_SPACE_SOURCE"
printf 'GENIE_MCP_MODE=%s\n'      "$GENIE_MCP_MODE"

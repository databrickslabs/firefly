# BOOTSTRAP.md — Firefly Genie-Agent: End-to-End Setup Runbook

Harness-agnostic, interactive-auth bootstrap for a fresh deployment of the
Firefly frontend + Databricks managed-memory agent app. An AI agent should
work through this file top-to-bottom, prompting the user for each input marked
**[ASK]** and executing each command exactly as written unless a gap note says
otherwise.

---

## Phase 0 — Collect inputs

Prompt the user for the following values. Store secrets in macOS Keychain
(`keyring set <service> <key>`) — never in plaintext files.

| Variable | Default | How to get it |
|---|---|---|
| `DATABRICKS_HOST` | — | **[ASK]** `https://dbc-xxxx.cloud.databricks.com` |
| `DB_PROFILE` | `firefly-deploy` | **[ASK]** name for the local Databricks CLI profile |
| `UC_CATALOG` | `workspace` | **[ASK]** Unity Catalog catalog to use (must allow MANAGE) |
| `UC_SCHEMA` | `default` | **[ASK]** schema within that catalog |
| `AGENT_APP_NAME` | `firefly-agent` | **[ASK]** Databricks App name to deploy |
| `LAKEBASE_NAME` | `firefly-lb` | **[ASK]** name for the new Lakebase instance |
| `NEON_PROJECT_NAME` | `firefly-genie` | **[ASK]** name for the new Neon project |
| `VERCEL_TEAM` | — | **[ASK]** `acme-corp` (from `vercel.com/<team-slug>/...` in the dashboard) |
| `VERCEL_PROJECT` | `firefly-genie` | **[ASK]** new Vercel project name |
| `REPO_DIR` | `~/Projects/firefly` | **[ASK]** local directory to clone into |

---

## Phase 1 — Auth (interactive, no tokens stored in files)

### 1a. Databricks CLI OAuth
```bash
databricks auth login --host $DATABRICKS_HOST --profile $DB_PROFILE
# Opens browser → completes U2M OAuth → writes ~/.databricks/profiles
databricks workspace list --profile $DB_PROFILE   # smoke-test
```

### 1b. Neon CLI OAuth
```bash
brew install neonctl          # or: npm install -g neonctl
neonctl auth                  # opens browser → saves ~/.config/neonctl/credentials.json
neonctl me                    # smoke-test
```

### 1c. Vercel CLI OAuth
```bash
vercel login                     # opens browser → GitHub/email OAuth
vercel whoami                    # confirm identity
```

### 1d. pnpm (needed for Drizzle migrations and frontend dev)

```bash
# Do NOT use corepack — it hits registry.npmjs.org which corp networks block.
npm install -g pnpm    # uses npm's approved CDN
pnpm --version         # confirm
```

> **ENV-0**: `corepack enable pnpm` fails on corp networks (ECONNREFUSED to registry.npmjs.org).
> The `npm i -g pnpm` path uses a CDN that is typically allowed.

### 1e. GitHub (if needed for submodule)
```bash
gh auth login                    # opens browser or prompts for PAT
# Or confirm existing SSH/HTTPS creds:
ssh -T git@github.com 2>&1 | head -1
```

---

## Phase 2 — Clone and assemble

```bash
git clone --branch genie-agent \
  https://github.com/databrickslabs/firefly.git "$REPO_DIR"
cd "$REPO_DIR"

# Submodule is required for assemble_agent.sh; must run before it.
git submodule update --init
bash scripts/assemble_agent.sh
```

> **GAP-1**: submodule init is documented after the assemble step; run it first.

---

## Phase 3 — Provision Databricks resources

### 3a. Run quickstart (creates MLflow experiment + Lakebase)

```bash
cd "$REPO_DIR/agent-build"
uv run --python 3.12 python scripts/quickstart.py \
  --profile "$DB_PROFILE" \
  --lakebase-create-new "$LAKEBASE_NAME"
# quickstart writes agent-build/.env with PGHOST/PGUSER/PGDATABASE/LAKEBASE_*
```

> **GAP-2**: plain `uv run quickstart` picks Python 3.14 and fails on PyO3. Always
> pass `--python 3.12`. The `pyproject.toml` has `requires-python = ">=3.11"` with
> no `.python-version` pin.

### 3b. Edit agent-build/databricks.yml

Three values quickstart does NOT update — set them manually:

```bash
cd "$REPO_DIR"
WORKSPACE_ID=$(databricks workspace get-status / \
  --profile "$DB_PROFILE" 2>/dev/null | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('workspace_id',''))" \
  || databricks api get /api/2.0/accounts --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; print(json.load(sys.stdin))")
# If workspace ID is hard to get via CLI, read it from the workspace URL's
# Databricks UI: Settings → Workspace → Workspace ID.
```

Open `agent-build/databricks.yml` and set:
```yaml
DATABRICKS_HOST: "https://<your-workspace>.cloud.databricks.com"
DATABRICKS_WORKSPACE_ID: "<numeric-workspace-id>"
GENIE_ONE_URL: "https://<your-workspace>.cloud.databricks.com/one?o=<workspace-id>"
```

Also replace any hardcoded `main.default` references with `$UC_CATALOG.$UC_SCHEMA`:
```yaml
# wheels volume
catalog: workspace        # ← your UC_CATALOG
schema: default           # ← your UC_SCHEMA
volume_name: firefly_wheels

# memory store env var
DATABRICKS_MEMORY_STORE: "workspace.default.firefly_managed_memory"
```

> **GAP-3**: the bundle hardcodes `main` catalog, which doesn't exist on
> Default-Storage workspaces. Substitute your actual writable catalog.
> **GAP-4**: quickstart only rewrites experiment_id and postgres refs.

### 3c. Create the UC wheels volume

```bash
databricks volumes create "$UC_CATALOG" "$UC_SCHEMA" firefly_wheels MANAGED \
  --profile "$DB_PROFILE"
```

### 3d. Vendor Python wheels (build-time offline install)

```bash
cd "$REPO_DIR/agent-build"
bash scripts/vendor_wheels.sh
# Downloads ~144 cp311 wheels ≤10 MB into vendor-wheels/.
# Wheels >10 MB (pyarrow, scipy, numpy, pandas, mlflow) install from
# pypi-proxy.cloud.databricks.com at build time — ensure that host is
# reachable from within the Apps build environment.
```

> **GAP-7/11/12/14**: the Apps build container cannot install Python deps
> without pre-vendored wheels because: (a) sync.exclude previously excluded
> pyproject.toml; (b) uv.lock may reference an unreachable dev-proxy host;
> (c) the newest wheels 404 on the cloud mirror. vendor_wheels.sh resolves
> (c); the repo fix resolves (a) and (b).

### 3e. Confirm sync.exclude is correct in agent/databricks.yml

Three rules — all three must hold simultaneously:

| Path | Must be in sync.exclude? | Why |
|---|---|---|
| `pyproject.toml` | **No** — upload it | Apps build needs it to find the dep list |
| `uv.lock` | **Yes** — exclude it | Forces plain `uv sync` (not `--locked`), so `UV_FIND_LINKS` re-resolves with local wheels |
| `vendor-wheels/**` | **No** — upload it | Local wheels must be present for the build to use them |

> **GAP-7**: the shipped `sync.exclude` excluded `pyproject.toml` → "No dependencies file found".
> **GAP-15**: with `uv.lock` present, `uv sync --locked` rejects `UV_FIND_LINKS` → "lockfile needs to be updated". Solution: exclude `uv.lock`, not `pyproject.toml`.

---

## Phase 4 — Deploy the agent app

```bash
cd "$REPO_DIR"

# Re-assemble to pick up the yml edits (do NOT re-run quickstart — it
# overwrites the .env the grant step needs).
bash scripts/assemble_agent.sh

# Deploy bundle
databricks bundle deploy --profile "$DB_PROFILE" -t dev
databricks bundle run --profile "$DB_PROFILE" -t dev

# Watch until app_status.state = RUNNING (not deployment state):
databricks apps get "$AGENT_APP_NAME" --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    print(d['app_status']['state'], d.get('active_deployment',{}).get('status',{}).get('state',''))"
# Expected: RUNNING SUCCEEDED
# Deployment state flips SUCCEEDED ~44 s before the port binds; wait for
# app_status.state = RUNNING.
```

> **GAP-5**: re-assembling after quickstart wipes quickstart's .env. Run assemble
> once before quickstart, or edit agent-build/databricks.yml in-place and re-assemble
> without re-running quickstart.
> **GAP-10/GAP-11**: if the app times out at 10 min, the most likely cause is the
> PyPI proxy host in uv.lock. Verify uv.lock sources point to
> `pypi-proxy.cloud.databricks.com` (not `.dev.`).

---

## Phase 5 — Set up UC managed memory (required for the headline feature)

```bash
# Get the app service principal's client ID from the deployed app
SP_CLIENT_ID=$(databricks apps get "$AGENT_APP_NAME" \
  --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; \
    d=json.load(sys.stdin); \
    print(d['service_principal_client_id'])")

cd "$REPO_DIR/agent-build"
uv run --python 3.12 python scripts/setup_memory_store.py "$SP_CLIENT_ID" \
  --profile "$DB_PROFILE"
```

> **GAP-18**: the UC memory store (`/api/2.1/unity-catalog/memory-stores/…`)
> is a distinct securable — not Lakebase and not auto-created. Without this step
> the agent answers normally but memory saves silently fail. There is no CLI
> for memory-stores; `setup_memory_store.py` calls the REST API directly.

---

## Phase 6 — Grant agent SP access to your data

The agent answers Genie queries as its service principal. Grant it:

```bash
# 1. Unity Catalog access (run in a SQL warehouse or via CLI)
databricks api post /api/2.1/unity-catalog/permissions/catalog \
  --profile "$DB_PROFILE" \
  --json "{\"changes\":[{\"principal\":\"$SP_CLIENT_ID\",\"add\":[\"USE CATALOG\"]}], \
    \"securable_full_name\":\"$UC_CATALOG\"}"

# Then USE SCHEMA + SELECT on the schemas/tables you want Genie to answer over.
# The easiest path is a warehouse SQL session:
#   GRANT USE CATALOG ON CATALOG workspace TO `<sp-client-id>`;
#   GRANT USE SCHEMA, SELECT ON SCHEMA workspace.your_schema TO `<sp-client-id>`;

# 2. SQL warehouse CAN_USE (required for Genie to run queries)
WAREHOUSE_ID=$(databricks warehouses list --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; ws=json.load(sys.stdin).get('warehouses',[]); \
    print(ws[0]['id'] if ws else '')")
databricks api patch \
  "/api/2.0/preview/sql/permissions/warehouses/$WAREHOUSE_ID" \
  --profile "$DB_PROFILE" \
  --json "{\"access_control_list\":[{\"service_principal_name\":\"$SP_CLIENT_ID\", \
    \"permission_level\":\"CAN_USE\"}]}"
```

> **GAP-9**: neither the README nor the docs mention that a warehouse and at
> least one UC table (with grants) must exist for Genie to return answers.
> On a fresh workspace the panel looks broken until data + grants are in place.

---

## Phase 7 — Neon database

```bash
# Credentials from neonctl auth (Phase 1b) — no API key needed.

# Get org ID (if the account belongs to an org; skip --org-id if personal account)
ORG_ID=$(neonctl orgs list --output json 2>/dev/null \
  | python3 -c "import sys,json; orgs=json.load(sys.stdin); print(orgs[0]['id'] if orgs else '')" \
  || echo "")

# Create project
if [[ -n "$ORG_ID" ]]; then
  PROJECT_ID=$(neonctl projects create --name "$NEON_PROJECT_NAME" \
    --org-id "$ORG_ID" --output json | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
else
  PROJECT_ID=$(neonctl projects create --name "$NEON_PROJECT_NAME" \
    --output json | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
fi

# Get connection string (pooled, for serverless driver)
DB_URL=$(neonctl connection-string --project-id "$PROJECT_ID" --pooled)
```

> The Neon API requires `org_id` in the project create body if the account is
> org-scoped. `neonctl orgs list` handles detection; personal accounts skip it.

### Run Drizzle migrations

```bash
cd "$REPO_DIR"
DATABASE_URL=$(python3 -c "import keyring; print(keyring.get_password('firefly-bootstrap','DATABASE_URL'))")
DATABASE_URL="$DATABASE_URL" node_modules/.bin/drizzle-kit push
```

---

## Phase 8 — Vercel frontend

### 8a. Create and link project

```bash
cd "$REPO_DIR"
VERCEL_TOKEN=$(python3 -c "import keyring; print(keyring.get_password('firefly-bootstrap','VERCEL_TOKEN') or '')")
# If not stored, run: vercel login  (browser OAuth)

vercel link --project "$VERCEL_PROJECT" --scope "$VERCEL_TEAM" --yes
```

### 8b. Set environment variables

Minimum required set:

```bash
AGENT_APP_URL=$(databricks apps get "$AGENT_APP_NAME" --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))")
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
GUEST_API_SECRET=$(openssl rand -hex 64)

# Set each var (preview + production scopes):
for SCOPE in preview production; do
  vercel env add DATABRICKS_AGENT_APP_URL  "$SCOPE" <<< "$AGENT_APP_URL"
  vercel env add DATABASE_URL              "$SCOPE" <<< "$(python3 -c "import keyring; print(keyring.get_password('firefly-bootstrap','DATABASE_URL'))")"
  vercel env add BETTER_AUTH_SECRET        "$SCOPE" <<< "$BETTER_AUTH_SECRET"
  vercel env add BETTER_AUTH_URL           "$SCOPE" <<< "https://$VERCEL_PROJECT.vercel.app"
  vercel env add ENCRYPTION_KEY            "$SCOPE" <<< "$ENCRYPTION_KEY"
  vercel env add NEXT_PUBLIC_AGENT_ENABLED "$SCOPE" <<< "true"
  vercel env add GUEST_API_SECRET          "$SCOPE" <<< "$GUEST_API_SECRET"
  # Databricks OAuth (U2M) — required for admin login; guest path uses BYOD SPNs
  vercel env add DATABRICKS_U2M_CLIENT_ID     "$SCOPE" <<< "<your-u2m-client-id>"
  vercel env add DATABRICKS_U2M_CLIENT_SECRET "$SCOPE" <<< "<your-u2m-client-secret>"
  vercel env add DATABRICKS_ACCOUNT_ID        "$SCOPE" <<< "<your-account-id>"
  vercel env add SPN_AUTH_DATABRICKS_ACCOUNT_ID      "$SCOPE" <<< "<your-account-id>"
  vercel env add SPN_AUTH_DATABRICKS_ACCOUNTS_URL    "$SCOPE" <<< "https://accounts.cloud.databricks.com"
  vercel env add SPN_AUTH_DATABRICKS_WORKSPACE_URL   "$SCOPE" <<< "$DATABRICKS_HOST"
done

# DO NOT set NEXT_PUBLIC_BETTER_AUTH_URL — it is baked at build time and breaks
# preview deployments (CORS). The auth client falls back to window.location.origin.
# GAP-20: setting this to a static value was the original CORS blocker.

# SPN_AUTH_OKTA_* are optional. Omit entirely if not using Okta federation.
# GAP-19: the okta plugin is now conditional; absent vars no longer crash the build.
```

### 8c. Disable Vercel preview protection (needed for guest API calls)

```bash
# Vercel SSO protection is on by default for preview deployments.
vercel project protection disable "$VERCEL_PROJECT" --sso --scope "$VERCEL_TEAM"
# GAP-22: without this, /api/guest/* returns 401 "Protected deployment".
```

### 8d. Deploy

```bash
vercel deploy --scope "$VERCEL_TEAM"
# Capture the preview URL printed at the end.
```

---

## Phase 9 — Verify

### App running
```bash
databricks apps get "$AGENT_APP_NAME" --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    print('app_status:', d['app_status']['state'])"
# Expected: app_status: RUNNING
```

### Guest login
```bash
PREVIEW_URL="<paste Vercel preview URL>"
# 1. Create a workspace record
WS=$(curl -s -X POST "$PREVIEW_URL/api/guest/workspaces" \
  -H "X-API-Key: $GUEST_API_SECRET" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test\",\"workspaceUrl\":\"$DATABRICKS_HOST\"}")
WS_ID=$(echo "$WS" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace']['id'])")

# 2. Create a SPN record (use the app SP or any M2M SPN)
SPN=$(curl -s -X POST "$PREVIEW_URL/api/guest/spns" \
  -H "X-API-Key: $GUEST_API_SECRET" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test SPN\",\"clientId\":\"$SP_CLIENT_ID\", \
       \"clientSecret\":\"<sp-client-secret>\",\"guestWorkspaceId\":\"$WS_ID\"}")
SPN_ID=$(echo "$SPN" | python3 -c "import sys,json; print(json.load(sys.stdin)['spn']['id'])")

# 3. Create guest user → get login URL
GU=$(curl -s -X POST "$PREVIEW_URL/api/guest/users" \
  -H "X-API-Key: $GUEST_API_SECRET" -H "Content-Type: application/json" \
  -d "{\"orgName\":\"Test Org\",\"spnId\":\"$SPN_ID\"}")
echo "$GU" | python3 -c "import sys,json; print(json.load(sys.stdin)['guestUser']['loginUrl'])"
# Navigate to the loginUrl in a browser → agent panel should appear → ask a question.
```

### Memory round-trip
```bash
# In the agent panel, turn 1: state a distinctive fact.
# Open New Chat (turn 2): ask the fact back.
# The agent should recall from /memories/... without being told again.
# GAP-18 fix (setup_memory_store.py) is the prerequisite.
```

---

## Dependency map

| Concern | Tooling | Auth method |
|---|---|---|
| Databricks provisioning | `databricks` CLI + REST | `databricks auth login` (U2M OAuth, browser) |
| UC memory store | Python SDK / REST | same CLI profile |
| Neon DB | Neon REST API | NEON_API_KEY (keyring) |
| Neon runtime | `drizzle-orm`, `@neondatabase/serverless` | `DATABASE_URL` (Postgres) |
| Vercel deploy | `vercel` CLI | `vercel login` (browser OAuth) |
| Vercel runtime | none (host only) | — |
| GitHub / submodule | `git`, optionally `gh` | `gh auth login` or SSH |

---

## Gap reference (corrected commands address these)

| ID | Severity | One-line summary |
|---|---|---|
| ENV-0 | minor | `pnpm` via corepack blocked on corp networks; install via `npm i -g pnpm` instead |
| GAP-1 | minor | Submodule init must precede first `assemble_agent.sh` |
| GAP-2 | major | `uv run quickstart` needs `--python 3.12`; mechanism undocumented |
| GAP-3 | blocker | Bundle hardcodes `main` catalog; use your actual writable catalog |
| GAP-4 | major | HOST/WORKSPACE_ID/GENIE_ONE_URL not updated by quickstart |
| GAP-5 | major | Re-assembling after quickstart wipes quickstart's `.env` |
| GAP-7 | blocker | `sync.exclude` must not list `pyproject.toml`; must list `uv.lock` |
| GAP-9 | major | Warehouse + UC data + SP grants required before Genie answers |
| GAP-10 | blocker | Startup exceeds 10-min limit if Python install is slow (fix: vendor wheels) |
| GAP-11 | blocker | `uv.lock` must reference `pypi-proxy.cloud.` not `.dev.`; regenerate after fixing |
| GAP-12 | blocker | Newest wheels 404 on cloud mirror; vendor them locally |
| GAP-13 | major | Apps container is Python 3.11 (cp311), not 3.12 as README claims; vendor cp311 |
| GAP-14 | blocker | Wheels >10 MB exceed bundle upload limit; install from cloud mirror at build time |
| GAP-15 | major | `uv sync --locked` rejects `UV_FIND_LINKS`; exclude `uv.lock` so build re-resolves |
| GAP-17 | minor | `active_deployment.state=SUCCEEDED` fires ~44s before port binds; poll `app_status.state` |
| GAP-18 | blocker | UC memory store must be created + SP granted READ/WRITE; not auto-provisioned |
| GAP-19 | major | `SPN_AUTH_OKTA_*` missing crashes build; plugin now conditional (omit vars entirely) |
| GAP-20 | blocker | `NEXT_PUBLIC_BETTER_AUTH_URL` must not be set for preview deployments (CORS) |
| GAP-21 | major | Guest login API undocumented; 3-step sequence: workspace → spn → user |
| GAP-22 | minor | Vercel preview SSO protection blocks guest API; disable with `project protection` |

### Gaps refuted or superseded (not in happy path)

| ID | Original claim | Reality |
|---|---|---|
| GAP-6 | `grant_lakebase_permissions.py` required for migrations | Refuted (GAP-16): `CAN_CONNECT_AND_CREATE` binding in `databricks.yml` auto-provisions the SP's Postgres role; manual grant is not needed |
| GAP-8 | Online dep install is flaky | Superseded by GAP-11: root cause was dead proxy host in `uv.lock`, not network instability |
| GAP-16 | Drizzle migration needs manual Lakebase grant | Refuted: see GAP-6 row above |

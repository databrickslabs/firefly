# BOOTSTRAP.md — Firefly Genie-Agent: End-to-End Setup Runbook

Harness-agnostic, interactive-auth bootstrap for a fresh deployment of the
Firefly frontend + Databricks managed-memory agent app. An AI agent should
work through this file top-to-bottom, completing every
**[ASK — REQUIRED, BLOCKING]** item in Phase 0 before running any later
phase, then executing each command exactly as written.

---

## Phase 0 — Collect inputs

> **STOP. This is a blocking step.** Do not run any command from Phase 1
> onward — including read-only smoke tests, `whoami`, or profile probes —
> until the user has explicitly answered **every** `[ASK — REQUIRED, BLOCKING]` row below.
>
> Ask all `[ASK — REQUIRED, BLOCKING]` values in a single up-front prompt. The "Default" column
> is a *fallback offered to the user*, NOT permission to proceed silently.
> You MUST surface each value and get confirmation, even if you can infer it
> from the environment (e.g. an existing CLI profile, `whoami`, or env var).
> Detection ≠ consent: present what you detected as the suggested answer,
> but still require the user to confirm or override it.

**Secret storage:** secrets persist in a gitignored, `chmod 600` file at
`$REPO_DIR/.firefly-bootstrap/state.env` (sourced by later phases via
`store_secret`/`read_secret`). This intentionally does **not** use macOS Keychain
(`keyring`) — the target machine may not have Python `keyring`/Keychain wired up.
The file is `0600` and gitignored; never print its contents.

**Input persistence + resume:** non-secret answers persist to
`~/.firefly-bootstrap/inputs.env`, so a re-run offers to reuse them without
re-prompting. The runner tracks completed phases (`COMPLETED_PHASES`) and supports
**skip-forward resume**: on a re-run, an already-completed phase prompts
`Re-execute Phase N? [y/N]` and pressing Enter **skips** it and advances; a
not-yet-run phase prompts `Execute Phase N? [Y/n]` (Enter proceeds, `n` stops).

**Corporate networks (intercepting proxy / blocked public PyPI-npm):** Phase 0
auto-detects a TLS-intercepting proxy and, on confirmation (or `--trust-proxy-ca`),
builds a local CA bundle and exports `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` /
`NODE_EXTRA_CA_CERTS` / `CURL_CA_BUNDLE` (+ `UV_SYSTEM_CERTS=1`). It also bridges the
user's existing `pip` index into `uv` (`UV_DEFAULT_INDEX`) and the `npm` registry into
corepack (`COREPACK_NPM_REGISTRY`), so `uv`/corepack use the sanctioned mirrors instead
of blocked public registries. Off-proxy these are no-ops. Never hardcode a mirror.

### Required inputs — confirm each before proceeding to Phase 1

- [ ] **[ASK — REQUIRED, BLOCKING]** `DATABRICKS_HOST` — workspace URL (e.g. `https://dbc-xxxx.cloud.databricks.com`)
- [ ] **[ASK — REQUIRED, BLOCKING]** `DB_PROFILE` — name for the local Databricks CLI profile
- [ ] **[ASK — REQUIRED, BLOCKING]** `UC_CATALOG` — Unity Catalog catalog to use (must allow MANAGE)
- [ ] **[ASK — REQUIRED, BLOCKING]** `UC_SCHEMA` — schema within that catalog
- [ ] **[ASK — REQUIRED, BLOCKING]** `AGENT_APP_NAME` — Databricks App name (dev target; bundle hardcodes this)
- [ ] **[ASK — REQUIRED, BLOCKING]** `DATABRICKS_ACCOUNT_ID` — numeric account ID from `accounts.cloud.databricks.com` URL
- [ ] **[ASK — REQUIRED, BLOCKING]** `LAKEBASE_NAME` — name for the new Lakebase instance
- [ ] **[ASK — REQUIRED, BLOCKING]** `NEON_PROJECT_NAME` — name for the new Neon project
- [ ] **[ASK — REQUIRED, BLOCKING]** `VERCEL_TEAM` — team slug (e.g. `acme-corp` from `vercel.com/<team-slug>/...` in the dashboard)
- [ ] **[ASK — REQUIRED, BLOCKING]** `VERCEL_PROJECT` — new Vercel project name
- [ ] **[ASK — REQUIRED, BLOCKING]** `REPO_DIR` — local directory to clone into (created if missing; must be new/empty, **not** your home dir — default `$HOME/firefly`)

> **`DATABRICKS_HOST` is auto-sanitized to `scheme://host`.** Pasting the full browser
> URL (e.g. `…/?autoLogin=true&o=…&email=…`) is fine — everything after the host is
> stripped. A query/path on the host otherwise pollutes the `DATABRICKS_HOST` env var
> (which overrides the CLI profile) and breaks SDK host-metadata resolution.

| Variable | Default | How to get it |
|---|---|---|
| `DATABRICKS_HOST` | — | Workspace URL from the browser address bar |
| `DB_PROFILE` | `firefly-deploy` | Any name for the profile in `~/.databrickscfg` |
| `UC_CATALOG` | `workspace` | Writable catalog with MANAGE permission |
| `UC_SCHEMA` | `default` | Schema within that catalog |
| `AGENT_APP_NAME` | `firefly-openai-managed-mem-v2` | Dev target; bundle hardcodes this |
| `DATABRICKS_ACCOUNT_ID` | — | Numeric ID from `accounts.cloud.databricks.com` URL |
| `LAKEBASE_NAME` | `firefly-lb` | Name for the new Lakebase instance |
| `NEON_PROJECT_NAME` | `firefly-genie` | Name for the new Neon project |
| `VERCEL_TEAM` | — | Team slug from `vercel.com/<team-slug>/...` in the dashboard |
| `VERCEL_PROJECT` | `firefly-genie` | New Vercel project name |
| `REPO_DIR` | `$HOME/firefly` | New/empty dir to clone into — **not** `$PWD`/home (a non-empty non-git dir is refused) |

---

## Phase 1 — Auth + tooling (interactive, no tokens stored in files)

> Install pnpm **first** (later CLIs and the frontend build need it). All CLI installs
> use official releases into `$HOME/bin` / `$HOME/.local/bin` — **no Homebrew required**
> (the target may not have it). Those dirs are added to `PATH` in Phase 0 so every phase
> (including skip-forward resumes) finds the CLIs. Auth steps **skip if already logged in**.

### 1a. pnpm via corepack (needed for Drizzle migrations + frontend build)

```bash
# pnpm's npm "latest" dist-tag currently resolves to a 12.x ALPHA that breaks installs
# (ignores onlyBuiltDependencies → ERR_PNPM_IGNORED_BUILDS). Use corepack and pre-activate
# an exact stable version so it never resolves "latest" (a dist-tag corporate mirrors 404).
corepack enable --install-directory "$HOME/bin"
corepack prepare pnpm@10.34.5 --activate      # downloads the exact tarball from the mirror
# A repo `packageManager: pnpm@10.x` pin, if present, still takes precedence.
```

### 1b. Databricks CLI OAuth

```bash
command -v databricks || {  # install official release to $HOME/bin (no Homebrew)
  DB_VER=$(curl -fsSL https://api.github.com/repos/databricks/cli/releases/latest \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['tag_name'].lstrip('v'))")
  # download+unzip databricks_cli_${DB_VER}_darwin_<arch>.zip → $HOME/bin/databricks
}
databricks auth login --host "$DATABRICKS_HOST" --profile "$DB_PROFILE"
# Opens browser → U2M OAuth → ~/.databrickscfg. (databricks has no "already authed" guard;
# re-running just refreshes.) Smoke-test: databricks workspace list / --profile "$DB_PROFILE"
```

### 1c. Neon CLI OAuth (skip if already authed)

```bash
command -v neonctl || npm install -g neonctl
if ! neonctl me &>/dev/null; then neonctl auth; fi   # only opens browser if needed
neonctl me                                           # smoke-test / show identity
```

### 1d. Vercel CLI OAuth (skip if already authed)

```bash
command -v vercel || npm install -g vercel           # install BEFORE login
if ! vercel whoami &>/dev/null; then vercel login; fi
vercel whoami
```

### 1e. GitHub CLI (for the fork push in Phase 2 / submodule)

```bash
command -v gh || {  # install official gh release to $HOME/bin (no Homebrew)
  : ; }
if ! gh auth status &>/dev/null; then gh auth login; fi   # browser or PAT
```

### 1f. uv (Python package manager; installs to $HOME/.local/bin)

```bash
command -v uv || curl -LsSf https://astral.sh/uv/install.sh | sh
uv --version
```

---

## Phase 2 — Clone and assemble

```bash
# Idempotent clone: reuse an existing repo at $REPO_DIR if it's already a git checkout;
# clone if the dir is empty/absent; FAIL if it exists, is non-empty, and is not a git repo
# (so we never clobber e.g. your home dir — see the REPO_DIR guidance in Phase 0).
if [[ -d "$REPO_DIR/.git" ]]; then
  echo "Repo already present at $REPO_DIR — reusing (skip clone)."
elif [[ -e "$REPO_DIR" && -n "$(ls -A "$REPO_DIR" 2>/dev/null)" ]]; then
  echo "ERROR: $REPO_DIR is non-empty and not a git repo — pick a new REPO_DIR." >&2; exit 1
else
  git clone --branch genie-agent https://github.com/databrickslabs/firefly.git "$REPO_DIR"
fi
cd "$REPO_DIR"

# Push to your own GitHub fork. (Historically for Vercel's Git integration; the deploy now
# uses the `vercel deploy` CLI and needs no Git integration — this push is optional and may
# be removed. It requires `gh` auth from Phase 1e.)
GH_USER=$(gh api user -q .login 2>/dev/null || echo "")
if [[ -n "$GH_USER" ]]; then
  FORK="${GITHUB_FORK:-$GH_USER/firefly}"
  gh repo view "$FORK" &>/dev/null \
    && { git remote add origin-fork "https://github.com/${FORK}.git" 2>/dev/null || true; git push -u origin-fork genie-agent; } \
    || gh repo create "$FORK" --private --source "$REPO_DIR" --remote origin-fork --push
fi

# Submodule must be initialised before assemble_agent.sh runs.
git submodule update --init

# Assemble once here — do NOT run assemble_agent.sh again after quickstart (Phase 3a),
# as it wipes agent-build/ including quickstart's .env and vendored wheels.
bash scripts/assemble_agent.sh
```

---

## Phase 3 — Provision Databricks resources

### 3a. Run quickstart (creates MLflow experiment + Lakebase)

```bash
cd "$REPO_DIR/agent-build"

# Lakebase create-vs-reuse (idempotent): --lakebase-create-new fails on re-run
# ("project slug already exists") AND disables quickstart's own .env-reuse path.
# quickstart names resources deterministically, so if the project's primary endpoint
# already exists, REUSE it; otherwise create new.
LB_ENDPOINT="projects/${LAKEBASE_NAME}/branches/${LAKEBASE_NAME}-branch/endpoints/primary"
if databricks api get "/api/2.0/postgres/${LB_ENDPOINT}" --profile "$DB_PROFILE" &>/dev/null; then
  LB_ARG=(--lakebase-autoscaling-endpoint "$LB_ENDPOINT")   # reuse existing
else
  LB_ARG=(--lakebase-create-new "$LAKEBASE_NAME")           # create new
fi

# Pass --app-name so quickstart does NOT interactively prompt to bind an app.
uv run --python 3.12 python scripts/quickstart.py \
  --profile "$DB_PROFILE" "${LB_ARG[@]}" --app-name "$AGENT_APP_NAME"
# --python 3.12 is required; omitting it picks the latest Python and fails on PyO3.
# quickstart writes agent-build/.env with PGHOST/PGUSER/PGDATABASE/LAKEBASE_*
# and patches agent-build/databricks.yml with the new experiment ID and Lakebase refs.
```

### 3b. Verify bundle variables (catalog/schema only)

`DATABRICKS_HOST`, `DATABRICKS_WORKSPACE_ID`, and `GENIE_ONE_URL` are injected at
runtime by `quickstart.py` — **do not edit them manually**. The bundle also declares
`catalog` and `schema` variables that default to `workspace` and `default`.

`catalog` and `schema` are applied at **deploy time via `--var`** (Phase 4) — **do not
edit `databricks.yml` manually**. `DATABRICKS_MEMORY_STORE` resolves from them to
`$UC_CATALOG.$UC_SCHEMA.firefly_managed_memory`. Nothing to run here; the values you
entered in Phase 0 are passed as `--var catalog=$UC_CATALOG --var schema=$UC_SCHEMA`
on every `bundle deploy`/`bundle run`.

### 3c. Create the UC wheels volume

```bash
# Idempotent: create only if the volume doesn't already exist (create errors on re-run).
if databricks volumes read "${UC_CATALOG}.${UC_SCHEMA}.firefly_wheels" --profile "$DB_PROFILE" &>/dev/null; then
  echo "UC volume ${UC_CATALOG}.${UC_SCHEMA}.firefly_wheels already exists — skipping."
else
  databricks volumes create "$UC_CATALOG" "$UC_SCHEMA" firefly_wheels MANAGED --profile "$DB_PROFILE"
fi
```

### 3d. Vendor Python wheels (build-time offline install)

```bash
cd "$REPO_DIR/agent-build"
bash scripts/vendor_wheels.sh
# Downloads ~144 cp311 wheels ≤10 MB into vendor-wheels/.
# Wheels >10 MB (pyarrow, scipy, numpy, pandas, mlflow) install from
# pypi-proxy.cloud.databricks.com at build time — that host must be reachable
# from within the Apps build environment.
```

### 3e. Confirm sync.exclude rules in agent/databricks.yml

Three rules — all three must hold simultaneously:

| Path | Must be in sync.exclude? | Why |
|---|---|---|
| `pyproject.toml` | **No** — upload it | Apps build needs it to find the dep list |
| `uv.lock` | **Yes** — exclude it | Forces plain `uv sync` (not `--locked`), so `UV_FIND_LINKS` re-resolves with local wheels |
| `vendor-wheels/**` | **No** — upload it | Local wheels must be present for the build to use them |

---

## Phase 4 — Deploy the agent app

```bash
cd "$REPO_DIR/agent-build"

# Deploy bundle (do NOT re-run assemble_agent.sh here — it wipes quickstart's .env)
# Apply catalog/schema via --var (Phase 3b) — no databricks.yml edits.
BUNDLE_VARS=(--var "catalog=$UC_CATALOG" --var "schema=$UC_SCHEMA")
databricks bundle deploy --profile "$DB_PROFILE" -t dev "${BUNDLE_VARS[@]}"
databricks bundle run agent_openai_agents_sdk --profile "$DB_PROFILE" -t dev "${BUNDLE_VARS[@]}"

# Watch until app_status.state = RUNNING (deployment state leads by ~44s)
databricks apps get "$AGENT_APP_NAME" -o json --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    print(d['app_status']['state'], d.get('active_deployment',{}).get('status',{}).get('state',''))"
# Expected: RUNNING SUCCEEDED
# If the app times out at 10 min, verify uv.lock sources point to
# pypi-proxy.cloud.databricks.com (not .dev.) and re-run vendor_wheels.sh.
```

---

## Phase 5 — Set up UC managed memory (required for the headline feature)

```bash
# Get the app service principal's client ID from the deployed app
SP_CLIENT_ID=$(databricks apps get "$AGENT_APP_NAME" -o json \
  --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; \
    d=json.load(sys.stdin); \
    print(d['service_principal_client_id'])")

cd "$REPO_DIR/agent-build"
uv run --python 3.12 python scripts/setup_memory_store.py "$SP_CLIENT_ID" \
  --memory-store "$UC_CATALOG.$UC_SCHEMA.firefly_managed_memory" \
  --profile "$DB_PROFILE"
# The UC memory store is a distinct securable — not Lakebase, not auto-created.
# setup_memory_store.py calls the REST API directly (no CLI equivalent).
```

---

## Phase 6 — Grant agent SP access to your data

The agent answers Genie queries as its service principal. Grant it:

```bash
# 1. Unity Catalog — USE CATALOG
databricks api patch "/api/2.1/unity-catalog/permissions/catalog/$UC_CATALOG" \
  --profile "$DB_PROFILE" \
  --json "{\"changes\":[{\"principal\":\"$SP_CLIENT_ID\",\"add\":[\"USE CATALOG\"]}]}"

# Then USE SCHEMA + SELECT on the schemas/tables you want Genie to answer over.
# The easiest path is a warehouse SQL session:
#   GRANT USE SCHEMA, SELECT ON SCHEMA $UC_CATALOG.$UC_SCHEMA TO `$SP_CLIENT_ID`;

# 2. SQL warehouse CAN_USE (required for Genie to run queries)
WAREHOUSE_ID=$(databricks warehouses list -o json --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; ws=json.load(sys.stdin); \
    print(ws[0]['id'] if ws else '')")
databricks api patch \
  "/api/2.0/permissions/warehouses/$WAREHOUSE_ID" \
  --profile "$DB_PROFILE" \
  --json "{\"access_control_list\":[{\"service_principal_name\":\"$SP_CLIENT_ID\", \
    \"permission_level\":\"CAN_USE\"}]}"
```

---

## Phase 6b — Create guest service principal with M2M credentials

The guest login flow (`/api/guest/spns`) requires a Databricks Service Principal
with a known **client ID** and **client secret** (M2M OAuth credentials). The app SP
from Phase 5 does not expose a secret — create a dedicated guest SP.

The Firefly frontend proxies the agent panel with the guest SP's M2M token. Without
**`CAN_USE` on the agent app**, the Databricks Apps front door rejects that token and
the embedded panel redirects to Databricks OAuth instead of loading.

```bash
# 1. Create the service principal at workspace level — IDEMPOTENT: SCIM displayName is
#    NOT unique, so a plain `create` on re-run makes a DUPLICATE SP (new id + secret) and
#    orphans the old one. Reuse an existing firefly-guest-sp if present.
GUEST_SP_RESP=$(databricks service-principals list \
  --filter 'displayName eq "firefly-guest-sp"' -o json --profile "$DB_PROFILE" 2>/dev/null \
  | python3 -c "import sys,json;l=json.load(sys.stdin) or [];m=[s for s in l if s.get('displayName')=='firefly-guest-sp'];print(json.dumps(m[0]) if m else '')")
if [[ -z "$GUEST_SP_RESP" ]]; then
  GUEST_SP_RESP=$(databricks service-principals create \
    --display-name "firefly-guest-sp" -o json --profile "$DB_PROFILE")
fi

# Note: the CLI returns SCIM camelCase — use applicationId, not application_id
GUEST_SP_CLIENT_ID=$(echo "$GUEST_SP_RESP" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['applicationId'])")
GUEST_SP_NUM_ID=$(echo "$GUEST_SP_RESP" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Generate an OAuth M2M secret at workspace level (no account console needed)
GUEST_SP_SECRET=$(databricks service-principal-secrets-proxy create \
  "$GUEST_SP_NUM_ID" -o json --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['secret'])")

# 3. Store both values in $REPO_DIR/.firefly-bootstrap/state.env (0600, gitignored) — never print them
store_secret GUEST_SP_CLIENT_ID "$GUEST_SP_CLIENT_ID"
store_secret GUEST_SP_SECRET    "$GUEST_SP_SECRET"

# 4. Grant the guest SP data access (run in a SQL warehouse session):
#    GRANT USE CATALOG ON CATALOG $UC_CATALOG TO `$GUEST_SP_CLIENT_ID`;
#    GRANT USE SCHEMA, SELECT ON SCHEMA $UC_CATALOG.$UC_SCHEMA TO `$GUEST_SP_CLIENT_ID`;

# 5. SQL warehouse CAN_USE (required for Genie to run queries as the guest SP)
# Re-use WAREHOUSE_ID from Phase 6 if still in shell; otherwise list warehouses again.
databricks api patch \
  "/api/2.0/permissions/warehouses/$WAREHOUSE_ID" \
  --profile "$DB_PROFILE" \
  --json "{\"access_control_list\":[{\"service_principal_name\":\"$GUEST_SP_CLIENT_ID\", \
    \"permission_level\":\"CAN_USE\"}]}"

# 6. Agent app CAN_USE (required — without this the app rejects the guest M2M token)
databricks api patch \
  "/api/2.0/permissions/apps/$AGENT_APP_NAME" \
  --profile "$DB_PROFILE" \
  --json "{\"access_control_list\":[{\"service_principal_name\":\"$GUEST_SP_CLIENT_ID\", \
    \"permission_level\":\"CAN_USE\"}]}"
```

---

## Phase 6c — Confirm Genie has data to query

Phases 6 and 6b grant catalog, schema, and warehouse access. On a **fresh
workspace**, Genie One can still return empty or useless answers when the
granted schema has **no tables** — the agent and MCP plumbing work, but there
is nothing to query. Check now and record the result; do **not** create tables
on the user's behalf.

### Check

```bash
# Tables in the schema you granted in Phase 6?
databricks tables list "$UC_CATALOG" "$UC_SCHEMA" --profile "$DB_PROFILE"
# Empty output → note it and continue bootstrap. Tables present → proceed.
```

Or, in a SQL warehouse session:

```sql
SHOW TABLES IN $UC_CATALOG.$UC_SCHEMA;
```

If the check is empty, continue through Phases 7–9 (infra and guest login can
still verify). At the end of this runbook, follow **Next steps — no UC data**.

---

## Phase 7 — Neon database

```bash
# Credentials from neonctl auth (Phase 1b) — no API key needed.

# Get org ID (if the account belongs to an org; skip --org-id if personal account)
ORG_ID=$(neonctl orgs list --output json 2>/dev/null \
  | python3 -c "import sys,json; orgs=json.load(sys.stdin); print(orgs[0]['id'] if orgs else '')" \
  || echo "")

# Create project — IDEMPOTENT: Neon project names are NOT unique (id-based); a plain
# `create` on re-run makes a SECOND project, orphans the first, and can hit the quota.
# Reuse an existing project with the same name if present.
ORG_FLAG=(); [[ -n "$ORG_ID" ]] && ORG_FLAG=(--org-id "$ORG_ID")
PROJECT_ID=$(NEON_PROJECT_NAME="$NEON_PROJECT_NAME" neonctl projects list "${ORG_FLAG[@]}" --output json 2>/dev/null \
  | python3 -c "import os,sys,json;d=json.load(sys.stdin);ps=d.get('projects',d) if isinstance(d,dict) else d;print(next((p['id'] for p in ps if p.get('name')==os.environ['NEON_PROJECT_NAME']),''))")
if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID=$(neonctl projects create --name "$NEON_PROJECT_NAME" "${ORG_FLAG[@]}" --output json \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
fi

# Get pooled connection string and store in state.env (0600, gitignored)
DB_URL=$(neonctl connection-string --project-id "$PROJECT_ID" --pooled)
store_secret DATABASE_URL "$DB_URL"
```

> The Neon API requires `org_id` in the project create body if the account is
> org-scoped. `neonctl orgs list` handles detection; personal accounts skip it.

### Run Drizzle migrations

```bash
cd "$REPO_DIR"
pnpm install   # via corepack (pnpm 10.34.5 activated in Phase 1a); installs node_modules
DB_URL=$(read_secret DATABASE_URL)   # from .firefly-bootstrap/state.env
DATABASE_URL="$DB_URL" node_modules/.bin/drizzle-kit push
```

---

## Phase 8 — Vercel frontend

### 8a. Create + link project (no Git integration) + force Next.js preset

```bash
cd "$REPO_DIR"
# Pre-create the project (idempotent) so `vercel link` only ATTACHES. Creating a NEW
# project via link also tries to wire up Git auto-deploy — detecting the repo remotes,
# prompting "which remote?", and calling Git connect, which needs a Vercel↔GitHub Login
# Connection many accounts lack (→ HTTP 400). We deploy via the CLI and need NO Git
# integration. (Enable push-to-deploy later from the dashboard: Project → Settings → Git.)
vercel project add "$VERCEL_PROJECT" --scope "$VERCEL_TEAM" 2>/dev/null || true
vercel link --project "$VERCEL_PROJECT" --scope "$VERCEL_TEAM" --yes --non-interactive

# Force the Next.js framework preset. A project created with framework:null builds
# `next build` but Vercel serves the output as STATIC → every route 404s despite a
# "Ready" deployment. PATCH the preset via the API (flips all routes 200).
V_TOKEN=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/Library/Application Support/com.vercel.cli/auth.json")))["token"])')
V_ORG=$(python3 -c "import json;print(json.load(open('$REPO_DIR/.vercel/project.json'))['orgId'])")
V_PROJ=$(python3 -c "import json;print(json.load(open('$REPO_DIR/.vercel/project.json'))['projectId'])")
curl -s -X PATCH "https://api.vercel.com/v9/projects/$V_PROJ?teamId=$V_ORG" \
  -H "Authorization: Bearer $V_TOKEN" -H "Content-Type: application/json" \
  -d '{"framework":"nextjs"}' -o /dev/null
```

### 8b. Set environment variables

#### Tier 1 — required for guest login path (Phase 9 verification)

```bash
AGENT_APP_URL=$(databricks apps get "$AGENT_APP_NAME" -o json --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))")
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
GUEST_API_SECRET=$(openssl rand -hex 64)
DB_URL=$(read_secret DATABASE_URL)   # from state.env

# Use --value (no stdin) + --force (idempotent overwrite) + --non-interactive. A plain
# `vercel env add … <<< value` for PREVIEW scope stalls on a "? Git branch?" prompt.
for SCOPE in preview production; do
  add() { vercel env add "$1" "$SCOPE" --value "$2" --force --non-interactive --scope "$VERCEL_TEAM"; }
  add DATABRICKS_AGENT_APP_URL          "$AGENT_APP_URL"
  add DATABASE_URL                      "$DB_URL"
  add BETTER_AUTH_SECRET                "$BETTER_AUTH_SECRET"
  add ENCRYPTION_KEY                    "$ENCRYPTION_KEY"
  add NEXT_PUBLIC_AGENT_ENABLED         "true"
  add GUEST_API_SECRET                  "$GUEST_API_SECRET"
  add SPN_AUTH_DATABRICKS_ACCOUNTS_URL  "https://accounts.cloud.databricks.com"
  add SPN_AUTH_DATABRICKS_WORKSPACE_URL "$DATABRICKS_HOST"
  # Guest Catalog Explorer allowlist (#20): only lists catalogs matching an allowed prefix
  # (default "firefly"). Align with the chosen catalog so guests can BROWSE seeded data.
  add GUEST_ALLOWED_CATALOG_PREFIXES    "firefly,$UC_CATALOG"
  # production's canonical domain is stable → set now. preview's BETTER_AUTH_URL is set
  # AFTER deploy (8e) to the REAL serving origin — a pre-deploy guess breaks guest
  # one-time-token verification (#19).
  [[ "$SCOPE" == "production" ]] && add BETTER_AUTH_URL "https://$VERCEL_PROJECT.vercel.app"
done
```

> **DO NOT set `NEXT_PUBLIC_BETTER_AUTH_URL`** — it is baked at build time and causes
> CORS failures on preview deployments. The auth client falls back to `window.location.origin`.
>
> **Omit `SPN_AUTH_OKTA_*` entirely** — the plugin is conditional; absent vars are skipped.
>
> **`GUEST_ALLOWED_CATALOG_PREFIXES` (security note, #20):** the guest Catalog Explorer
> only lists catalogs whose name starts with one of these (comma-separated, case-insensitive;
> default `firefly`). Setting it to include your `UC_CATALOG` lets guests **browse** that
> catalog's tree — still scoped by the guest SP's UC grants, and browse-only (it does not
> affect Genie, which queries UC directly). If `UC_CATALOG` is the shared `workspace`
> catalog, guests can browse the whole `workspace` tree — fine for a demo; narrow it (or use
> a dedicated `firefly_*` catalog) if that's too broad.

#### Tier 2 — required only for admin Databricks OAuth login (not needed for guest path)

```bash
# These vars power the "Login with Databricks" button for workspace admins.
# For a guest-only verification (Phase 9), set placeholder values to satisfy
# the build; the auth routes will 404 at runtime if a user tries admin login,
# but the guest flow is unaffected.
#
# auth-dynamic.ts passes these to genericOAuth as a plain config object, so
# placeholder values do not crash the Next.js build — they only fail at runtime
# when the admin login route is actually invoked.
#
# To enable admin login: replace placeholders with real values from a Databricks
# OAuth app registered at accounts.cloud.databricks.com → App connections.

for SCOPE in preview production; do
  add() { vercel env add "$1" "$SCOPE" --value "$2" --force --non-interactive --scope "$VERCEL_TEAM"; }
  add DATABRICKS_U2M_CLIENT_ID      "${DATABRICKS_U2M_CLIENT_ID:-placeholder}"
  add DATABRICKS_U2M_CLIENT_SECRET  "${DATABRICKS_U2M_CLIENT_SECRET:-placeholder}"
  add DATABRICKS_ACCOUNT_ID         "$DATABRICKS_ACCOUNT_ID"
  add SPN_AUTH_DATABRICKS_ACCOUNT_ID "$DATABRICKS_ACCOUNT_ID"
done
```

### 8c. Disable Vercel preview protection (needed for guest API calls)

```bash
# Vercel SSO protection is on by default for preview deployments.
# Without this, /api/guest/* returns 401 "Protected deployment".
vercel project protection disable "$VERCEL_PROJECT" --sso --scope "$VERCEL_TEAM"
```

### 8d. Deploy — phase 1 of 2: discover the real URL, pin a stable alias

```bash
STABLE_ALIAS="${VERCEL_PROJECT}.vercel.app"
# Parse ONLY the .vercel.app URL — Vercel may serve a suffixed domain if the name was
# taken; never guess it (#15). Pin a stable alias so BETTER_AUTH_URL stays valid.
DEPLOY_URL=$(vercel deploy --scope "$VERCEL_TEAM" 2>&1 | grep -oE 'https://[^ ]*\.vercel\.app' | tail -1)
vercel alias set "$DEPLOY_URL" "$STABLE_ALIAS" --scope "$VERCEL_TEAM"
PREVIEW_URL="https://$STABLE_ALIAS"
```

### 8e. Deploy — phase 2 of 2: set preview `BETTER_AUTH_URL`, redeploy (#19)

```bash
# BETTER_AUTH_URL is read at runtime and must equal the origin the guest actually opens.
vercel env add BETTER_AUTH_URL preview --value "$PREVIEW_URL" --force --non-interactive --scope "$VERCEL_TEAM"
# Redeploy so the running deployment serves the correct BETTER_AUTH_URL, then re-point the alias.
DEPLOY_URL2=$(vercel deploy --scope "$VERCEL_TEAM" 2>&1 | grep -oE 'https://[^ ]*\.vercel\.app' | tail -1)
vercel alias set "$DEPLOY_URL2" "$STABLE_ALIAS" --scope "$VERCEL_TEAM"

# Store for Phase 9 (survives shell restart)
store_secret PREVIEW_URL "$PREVIEW_URL"
store_secret GUEST_API_SECRET "$GUEST_API_SECRET"
```

---

## Phase 9 — Verify

### App running

```bash
databricks apps get "$AGENT_APP_NAME" -o json --profile "$DB_PROFILE" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    print('app_status:', d['app_status']['state'])"
# Expected: app_status: RUNNING
```

### Guest login

```bash
# Load everything from state.env — no values needed from memory.
# (Behind an intercepting proxy, the CURL_CA_BUNDLE exported in Phase 0 makes these curls
# trust the proxy CA; without it curl returns 000 on the *.vercel.app origin.)
PREVIEW_URL=$(read_secret PREVIEW_URL)
GUEST_API_SECRET=$(read_secret GUEST_API_SECRET)
# Guest SP credentials (created in Phase 6b)
GUEST_SP_CLIENT_ID=$(read_secret GUEST_SP_CLIENT_ID)
GUEST_SP_SECRET=$(read_secret GUEST_SP_SECRET)

# 1. Create a workspace record
WS=$(curl -s -X POST "$PREVIEW_URL/api/guest/workspaces" \
  -H "X-API-Key: $GUEST_API_SECRET" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test\",\"workspaceUrl\":\"$DATABRICKS_HOST\"}")
WS_ID=$(echo "$WS" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace']['id'])")

# 2. Register the guest SP (clientId = applicationId from Phase 6b)
SPN=$(curl -s -X POST "$PREVIEW_URL/api/guest/spns" \
  -H "X-API-Key: $GUEST_API_SECRET" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test SPN\",\"clientId\":\"$GUEST_SP_CLIENT_ID\", \
       \"clientSecret\":\"$GUEST_SP_SECRET\",\"guestWorkspaceId\":\"$WS_ID\"}")
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
# Requires Phase 5 (setup_memory_store.py) to have run successfully.
```

---

## Next steps — no UC data

Apply this section **only if Phase 6c found no tables** in `$UC_CATALOG.$UC_SCHEMA`.
Bootstrap can complete successfully — app, guest login, and memory may all work —
but Genie will not answer data questions until queryable tables exist in a schema
the agent SP can read.

**Recommended next steps for the user:**

1. **Choose a data source** — ingest production/analytics data, copy a slice from
   the workspace `samples` catalog, or use your team's standard demo dataset.
2. **Place tables in a granted schema** — the agent SP needs `USE CATALOG`,
   `USE SCHEMA`, and `SELECT` on whatever schema holds the data (Phase 6).
   Grant the guest SP the same if guest users will ask data questions (Phase 6b).
3. **Confirm warehouse access** — a running SQL warehouse with `CAN_USE` for the
   agent SP (Phase 6) is required for Genie to execute queries.
4. **Re-check** — re-run the Phase 6c `tables list` / `SHOW TABLES` check.
5. **Verify in the agent panel** — ask a question that requires real data (not just
   "does the panel load?"). Empty or evasive answers after data is loaded usually
   mean missing grants on the new schema/tables, not a broken deploy.

Do not auto-create seed tables during bootstrap unless the user explicitly asks.

---

## Dependency map

| Concern | Tooling | Auth method |
|---|---|---|
| Databricks provisioning | `databricks` CLI + REST | `databricks auth login` (U2M OAuth, browser) |
| UC memory store | Python SDK / REST | same CLI profile |
| Neon DB | `neonctl` CLI | `neonctl auth` (browser OAuth) |
| Neon runtime | `drizzle-orm`, `@neondatabase/serverless` | `DATABASE_URL` (Postgres) |
| Vercel deploy | `vercel` CLI | `vercel login` (browser OAuth) |
| Vercel runtime | none (host only) | — |
| GitHub / submodule | `git`, optionally `gh` | `gh auth login` or SSH |

---

## Report bootstrap issues

If anything fails, behaves unexpectedly, or required a workaround during this
runbook, **construct and file a GitHub issue on the user's behalf** so the
bootstrap can be improved. Do not tell the user to "go file an issue" and stop —
you draft it, they confirm, you submit.

### When to file

- A phase command failed or needed a manual fix not documented here
- Phase 9 verification failed (or passed only after an undocumented workaround)
- Phase 6c was empty and Genie could not answer data questions after the user loaded data
- Any `[ASK — REQUIRED, BLOCKING]` value had to be overridden because the runbook was wrong

### What you do

1. **Collect during the run** — note phase, command, stderr/stdout (redact secrets),
   non-default inputs (`$UC_CATALOG`, `$AGENT_APP_NAME`, etc.), and expected vs actual.
2. **Draft the issue** — fill the template below from the session. Omit sections that
   don't apply; never paste tokens, client secrets, or URLs with embedded credentials.
3. **Show the user** — present the title and body; ask for a one-line confirmation or
   edits.
4. **File it** — write the body to a temp file, then create the issue from `$REPO_DIR`
   (or this repo root) with `gh` authenticated:

**Title:** `bootstrap(genie-agent): <short summary>`

**Body template:**

```markdown
## Summary
<one paragraph>

## Phase / step
<e.g. Phase 6b — agent app CAN_USE grant>

## Commands run
    <exact commands, secrets redacted — indent as a code block>

## Error output
    <stderr / API response, redacted>

## Environment
- Bootstrap branch: genie-agent
- DATABRICKS_HOST: <host>
- UC_CATALOG / UC_SCHEMA: <values>
- AGENT_APP_NAME: <value>
- Fresh workspace: yes / no

## Expected vs actual
- Expected: …
- Actual: …

## Workaround used (if any)
…

## Suggested runbook fix
…
```

```bash
ISSUE_BODY=$(mktemp)
cat > "$ISSUE_BODY" <<'EOF'
<paste filled-in body from template above>
EOF

gh issue create \
  --repo databrickslabs/firefly \
  --title "bootstrap(genie-agent): <short summary>" \
  --body-file "$ISSUE_BODY"

rm -f "$ISSUE_BODY"
```

5. **Return the issue URL** to the user.

Do not open Databricks support tickets for bootstrap/runbook problems — use the
repo issue tracker instead (see README project support note).

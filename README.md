# FireFly Analytics - Databricks Custom Frontend

[![Open in Cursor](https://img.shields.io/badge/Open%20in-Cursor-black?logo=cursor)](https://cursor.com/link/prompt?text=Clone%20https%3A%2F%2Fgithub.com%2Fdatabrickslabs%2Ffirefly%20and%20open%20it%20in%20this%20workspace.%20Work%20through%20BOOTSTRAP.md%20top%20to%20bottom%2C%20running%20the%20Phase%200a%20corporate-network%20setup%20commands%20before%20any%20Phase%201%20command.%20If%20BOOTSTRAP.md%20is%20not%20present%20on%20the%20default%20branch%2C%20check%20out%20the%20genie-agent%20branch%2C%20which%20has%20it.) [![Start here: BOOTSTRAP.md](https://img.shields.io/badge/Start%20here-BOOTSTRAP.md-black?logo=markdown)](./BOOTSTRAP.md)

A Next.js application that provides a customized frontend for Databricks with multiple authentication strategies and embedded Databricks apps.

## Quick Start (AI-assisted)

For a fully automated, interactive-auth bootstrap — no manual token wrangling — use:

| File | Purpose |
|---|---|
| [`BOOTSTRAP.md`](./BOOTSTRAP.md) | Harness-agnostic runbook; an AI agent works through it top-to-bottom, prompting for each value |
| [`scripts/bootstrap.sh`](./scripts/bootstrap.sh) | Executable version of the same runbook with `--dry-run` and `--stop-after <phase>` flags |

```bash
# Dry run — see every command without executing anything
bash scripts/bootstrap.sh --dry-run

# Full interactive run (opens browser for each auth step)
bash scripts/bootstrap.sh
```

The runbook covers all nine phases end-to-end: Databricks provisioning, Neon DB,
Vercel deploy, guest service principal, and end-to-end verification. Manual setup
instructions follow below.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [Databricks OAuth Configuration](#databricks-oauth-configuration)
- [Go Proxy Setup (VSCode Editor)](#go-proxy-setup-vscode-editor)
- [Agent Panel (Managed-Memory Agent)](#agent-panel-managed-memory-agent)
- [Local Development](#local-development)
- [Deployment to Vercel](#deployment-to-vercel)
- [Architecture](#architecture)

## Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database (we recommend [Neon](https://neon.tech))
- Databricks account with admin access
- Go 1.21+ (for the proxy server)
- Vercel account (for deployment)

> **Installing pnpm — use npm, not corepack (ENV-0).** Node ships pnpm via `corepack`, but
> `corepack enable` / `corepack prepare` fetch the pnpm release from `registry.npmjs.org`
> and ignore your configured npm registry, so they fail on corporate networks that block or
> blackhole public npm (`ECONNREFUSED` / `ETIMEDOUT` / `503`, and the `pnpm` shim never
> works). Install from your approved registry instead, pinning the version:
>
> ```bash
> corepack disable >/dev/null 2>&1 || true   # an enabled shim shadows the install below
> npm install -g pnpm@10.34.5                # uses your configured (approved) npm registry
> pnpm --version                             # must print 10.34.5
> ```
>
> The pin matters: pnpm's `latest` dist-tag has shipped a 12.x alpha that ignores
> `onlyBuiltDependencies` and fails with `ERR_PNPM_IGNORED_BUILDS`. This is the same step as
> [`BOOTSTRAP.md`](./BOOTSTRAP.md) Phase 1a, and it is enforced by
> `scripts/check-runbook-invariants.sh`. On macOS, `brew install pnpm` is another
> approved-CDN option. Do **not** work around a block with
> `--registry https://registry.npmjs.org` or by disabling TLS.

## Environment Setup

### 1. Copy Environment Variables

```bash
cp .env.example .env.local
```

### 2. Configure Environment Variables

Edit `.env.local` and fill in the required values:

#### Databricks OAuth Configuration
```env
DATABRICKS_U2M_CLIENT_ID=your_u2m_client_id_here
DATABRICKS_U2M_CLIENT_SECRET=your_u2m_client_secret_here
DATABRICKS_ACCOUNT_ID=your_account_id_here
```

#### Database Configuration
```env
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

#### Authentication & Security
```env
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your_better_auth_secret_here

BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000

# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your_64_character_hex_encoded_encryption_key_here
```

#### Proxy & Application Configuration
```env
NEXT_PUBLIC_PROXY_URL=https://your-proxy-url.com
DATABRICKS_APP_URL=https://your-code-editor-app.databricksapps.com
```

## Database Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Push Drizzle Schema to Database

The database schema is defined using Drizzle ORM. To push the schema to your database:

```bash
# Push schema to database
pnpm drizzle-kit push

# Or generate and run migrations
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### 3. Verify Schema

You can open Drizzle Studio to verify your schema:

```bash
pnpm drizzle-kit studio
```

This will open a web interface at `https://local.drizzle.studio` where you can view and manage your database.

## Databricks OAuth Configuration

### Creating a Databricks OAuth App

1. **Log in to Databricks Account Console**
   - Navigate to your Databricks account console
   - You must be a Databricks account administrator

2. **Navigate to OAuth Settings**
   - Click the Settings icon in the sidebar
   - Select the "App connections" tab
   - Click "Add connection"

3. **Configure OAuth App**
   - **Name**: Give your app a descriptive name (e.g., "FireFly Analytics")
   - **Redirect URLs**: Add your callback URLs:
     ```
     http://localhost:3000/api/oauth/databricks/callback
     https://your-domain.com/api/oauth/databricks/callback
     ```
   - **Scopes**: Select the following scopes:
     - `all-apis` (required for full Databricks API access)
     - `offline_access` (required for refresh tokens)
     - `openid`
     - `profile`
     - `email`
   - **Client Type**: Select "Confidential" (generates a client secret)
   - **Token TTL**: Set access token TTL (default: 60 minutes)
   - **Refresh Token TTL**: Set refresh token TTL (default: 90 days)

4. **Save Credentials**
   - Copy the **Client ID** to `DATABRICKS_U2M_CLIENT_ID`
   - Copy the **Client Secret** to `DATABRICKS_U2M_CLIENT_SECRET`
   - Copy your **Account ID** to `DATABRICKS_ACCOUNT_ID`
     - Find this in your Databricks account console URL: `https://accounts.cloud.databricks.com/accounts/{ACCOUNT_ID}`

### Alternative: Using Databricks CLI

You can also create an OAuth app using the Databricks CLI:

```bash
databricks account custom-app-integration create \
  --confidential \
  --json '{
    "name":"FireFly Analytics",
    "redirect_urls":["http://localhost:3000/api/oauth/databricks/callback"],
    "scopes":["all-apis", "offline_access", "openid", "profile", "email"]
  }'
```

## Go Proxy Setup (VSCode Editor)

The Go proxy enables embedding Databricks Lakehouse Apps (like the VSCode editor) without exposing Databricks SSO to end users. It handles OAuth token encryption/decryption and proxies HTTP/WebSocket requests.

### 1. Navigate to Go Directory

```bash
cd go
```

### 2. Install Dependencies

```bash
go mod tidy
```

### 3. Configure Environment

Create a `.env` file in the `go` directory:

```env
ENCRYPTION_KEY=same_64_character_hex_key_from_main_env
APP_DOMAIN_SUFFIX=com
PORT=8090
```

**Important**: The `ENCRYPTION_KEY` must be the same as in your main `.env.local` file.

### 4. Build the Proxy

```bash
make build
```

### 5. Run the Proxy

```bash
make run
```

The proxy will start on `http://localhost:8090`.

### How It Works

1. **Token Encryption**: Next.js encrypts OAuth tokens server-side using AES-256-GCM
2. **URL Embedding**: Encrypted tokens are embedded in proxy URLs sent to the browser
3. **Token Decryption**: The Go proxy decrypts tokens and injects them as Authorization headers
4. **Request Proxying**: HTTP and WebSocket requests are proxied to Databricks apps
5. **No SSO Exposure**: Users never see Databricks login screens

### Deployment

For production, deploy the Go proxy to:
- **Docker**: Build a container and deploy to ECS, Kubernetes, or Cloud Run
- **VM**: Run directly on a VM with systemd service
- **Serverless**: Deploy to AWS Lambda or Google Cloud Functions

Update `NEXT_PUBLIC_PROXY_URL` in your environment to point to the deployed proxy.

## Agent Panel (Managed-Memory Agent)

The optional **Agent panel** is a slide-out chat assistant (Genie + long-term
memory) available in the SSO-SPN organization view. It embeds a Databricks App
built from the [`databricks/app-templates`](https://github.com/databricks/app-templates)
`agent-openai-agents-sdk` template, vendored here as a git submodule under
`vendor/app-templates`.

### How the agent uses Genie

The agent answers data questions over the **Genie MCP** endpoint
(`/api/2.0/mcp/genie`). The `ask_genie_one` tool
(`agent/agent_server/genie_tools.py`) calls `genie_ask` and polls
`genie_poll_response` until completion, authenticating with the agent App's
service principal.

Two backends are supported, chosen by `GENIE_MCP_MODE`:

- **`one` (default)** — the **workspace-wide unified Genie**. Not
  scoped to any space; it discovers whatever the agent SP can read. Works on any
  workspace with no extra setup.
- **`space`** — a single Genie space named by `GENIE_SPACE_ID`. Answers are scoped
  to that space's curated tables, joins, and instructions. BOOTSTRAP.md Phase 6c
  sets this up when the user opts in, either creating a space over the agent's
  schema or using space ids the user supplied at Phase 0.

Genie is configured at the **agent App layer** in `agent/databricks.yml` (not the
frontend `.env.local`):

| Env var | Purpose |
| --- | --- |
| `GENIE_MCP_MODE` | `one` for workspace-wide Genie, `space` for a single curated space. Bundle variable `genie_mcp_mode`, default `one` |
| `GENIE_SPACE_ID` | Required when `GENIE_MCP_MODE=space`, empty otherwise. Bundle variable `genie_space_id`, default empty. **Move it with the mode**: `agent.py` raises `ValueError` on `space` + empty id and the app fails to boot |
| `DATABRICKS_HOST`, `DATABRICKS_WORKSPACE_ID` | **Auto-injected** by the Databricks Apps runtime — never set in the bundle. Used to identify the workspace; **no attribution link is built from them** (see below) |

The panel shows plain-text "Powered by Genie" attribution with **no link**. There
was one, pointing at workspace-wide Genie, and it was wrong in two ways at once: the audience
for this panel is guest users who have no Databricks workspace access, so the link
led somewhere they could not open; and once `GENIE_MCP_MODE` defaults to a space,
its "Genie One" label named a backend that never saw the question. `GENIE_ONE_URL` no longer
exists.

Switching an existing deployment to a space means passing **both** variables:

```bash
databricks bundle deploy -t dev --profile "$DB_PROFILE" \
  --var catalog="$UC_CATALOG" --var schema="$UC_SCHEMA" \
  --var genie_mcp_mode=space --var genie_space_id=<space-id>
```

The `GENIE_INSTRUCTIONS` prompt (composed onto the agent's memory instructions in
`agent/agent_server/agent.py`) forces Genie-first behavior for any question about
tables, catalogs, dashboards, or "my data".

> Note: the tool currently **hardcodes** the MCP path `/api/2.0/mcp/genie` rather
> than reading `GENIE_MCP_URL`, so that env var only feeds the attribution-link
> fallback today.

### Grant the agent's service principal access to your data

The agent queries Genie Agent as the **agent App's service principal** (see above), not
the signed-in user. Genie only returns Unity Catalog data that this service principal can
access, so on a workspace where the SP has no grants, data questions come back empty even
though the agent and Genie are otherwise working. Grant the app's service principal access
to the catalogs/schemas you want it to answer over:

- `USE CATALOG` on the catalog and `USE SCHEMA` on the schema,
- `SELECT` on the tables (or on the schema), and
- access to a SQL warehouse Genie can execute against.

> **A fresh workspace has no data and no running warehouse — Genie will answer
> "empty" until you provide both.** This repo ships no dataset. Before the first
> demo, start a (serverless) SQL warehouse and create at least one UC schema with a
> few tables (copy a slice from the built-in `samples` catalog or generate synthetic
> rows), then apply the grants above to the app's SP. Without seeded data + a
> warehouse the Agent panel looks broken even though the agent, Genie, and memory
> are all working.

<!-- UNVERIFIED: the exact minimal privilege set — and whether Genie Agent requires an
explicit SQL-warehouse grant for the service principal — has not yet been confirmed on a
clean workspace. -->

### How it differs from the Go proxy

Unlike the VSCode/notebook editors (which use the Go proxy), the agent is embedded
through a **Vercel-native reverse proxy** — a Next.js route at
`src/app/api/agent-proxy/[[...path]]/route.ts`. That route:

- resolves the current user's (or guest's) mapped **service principal** and mints
  a Databricks bearer token via M2M OAuth (`src/lib/databricks-spn-authtoken.ts`),
  so guests never hit the Databricks OAuth wall;
- forwards HTTP + SSE (streaming chat) to `DATABRICKS_AGENT_APP_URL`, injecting the
  bearer and relaxing frame headers for same-origin embedding;
- rewrites the app's HTML (`<base href>` + forced light theme) so relative assets
  resolve under `/api/agent-proxy` and the chat UI matches Firefly's light UI.

**No Go proxy or Cloud Run is required for the agent.** The Go proxy is only for the
code/notebook editors.

### Enable it

1. Set the environment variables (see `.env.example`):
   ```env
   NEXT_PUBLIC_AGENT_ENABLED=true
   DATABRICKS_AGENT_APP_URL=https://your-agent-app.databricksapps.com
   ```
2. Ensure SPN auth is configured (`SPN_AUTH_*` and `FIREFLY_SPN_*`), since the proxy
   reuses the same SSO→SPN mapping used elsewhere.
3. Make sure the runtime prerequisites are met for the signed-in (or guest) user,
   or `/api/agent-proxy` returns `400`/`401`:
   - the user's **active organization** has a `workspaceUrl` set, and
   - there is an **SPN mapping** (`userSpns` row) for that user's email in that org
     (the proxy mints the workspace bearer from this mapping).

### Provision the agent's Databricks resources (prerequisite)

`agent/databricks.yml` binds the app to three workspace-specific resources that
**must exist before `databricks bundle deploy`**:

- an **MLflow experiment** (agent tracing),
- a **Lakebase (Databricks Postgres)** autoscaling instance — backs the frontend's
  chat persistence (`ai_chatbot` schema) and the OpenAI Agents SDK session store.
  This is **not** the durable-memory store (see below); the two are often confused.
- a **UC volume** — default `workspace.default.firefly_wheels` (the bundle grants the
  app `READ_VOLUME` on it). The catalog/schema/name are bundle variables
  (`catalog`/`schema`/`wheels_volume_name`), so on a workspace whose catalog is
  `main` you pass `--var catalog=main` instead of editing the YAML.

A fourth resource — the **UC memory store** for durable cross-session memory — is
created *after* the app exists (it needs the app SP for its grant), so it is not in
this pre-deploy list; see "Deploy → run → enable memory" below. It is a distinct UC
securable (`DATABRICKS_MEMORY_STORE`, default `workspace.default.firefly_managed_memory`),
**not** the Lakebase instance above.

For a fresh workspace, create them as follows.

**1. Experiment + Lakebase (one command).** First fetch the submodule and assemble
`agent-build/` (both are prerequisites of this step, even though the full build is
documented later):

```bash
git submodule update --init          # empty on a fresh clone; assemble fails without it
bash scripts/assemble_agent.sh
cd agent-build

# Creates the MLflow experiment AND a new autoscaling Lakebase project+branch in
# one pass, and writes their IDs into agent-build/databricks.yml + .env.
# --python 3.12 is REQUIRED: the dep tree (whenever/PyO3) caps at 3.13, so a bare
# `uv run` that picks 3.14 fails to build. <lakebase-name> must be new/unique
# (no reuse — an existing name errors). Use lowercase alphanumerics + hyphens.
uv run --python 3.12 quickstart --profile <your-cli-profile> --lakebase-create-new <lakebase-name>
```

> **Do not re-run `assemble_agent.sh` after `quickstart` in a single deploy pass.**
> Assemble does `rm -rf agent-build`, which wipes the `.env` (Lakebase creds) and
> the resource IDs quickstart just wrote — and the SP-grant step below reads that
> `.env`. Order that avoids the trap: assemble once → quickstart → (mirror IDs to the
> overlay) → vendor → deploy. If you must re-assemble, first copy the quickstart IDs
> into the tracked overlay `agent/databricks.yml` (next note).

**2. Wheels volume.** Create the UC volume the bundle grants read on (matches the
`catalog`/`schema`/`wheels_volume_name` bundle-variable defaults):

```bash
databricks volumes create workspace default firefly_wheels MANAGED -p <your-cli-profile>
```

> **The volume must _exist_ for the resource binding; the build reads wheels from
> synced source, not the volume.** UC volumes are **not mounted during the Apps
> build**, so dependencies install from the pre-vendored `vendor-wheels/` directory
> (synced with the source) via `UV_FIND_LINKS` — see "Vendor the build wheels"
> below. An empty volume satisfies the `READ_VOLUME` grant.

> **Copy only the quickstart-managed IDs into the tracked overlay.** `quickstart`
> writes the new `experiment_id` and `postgres` (`branch`/`database`) into
> **`agent-build/databricks.yml`**, which is gitignored and rebuilt from scratch by
> `scripts/assemble_agent.sh`. Copy those two resource blocks into the tracked overlay
> **`agent/databricks.yml`**, or they are lost on the next assemble. You do **not**
> edit `DATABRICKS_HOST` or `DATABRICKS_WORKSPACE_ID` any more — they are
> auto-injected at runtime (see "Derive — don't store"), and `GENIE_ONE_URL` no
> longer exists. And you do
> **not** edit the memory-store / wheels-volume namespace unless overriding the
> `workspace.default` default via `--var`.

### Build & deploy the agent app

The deployable app is assembled from the pristine submodule plus the local overlay
in `agent/` (agent code, chat-UI patches, bundle config):

```bash
# Fetch the submodule (first time only) — pulls vendor/app-templates
git submodule update --init

# Merge vendor submodule + agent/ overlay into ./agent-build (gitignored).
# The script also runs a local-only `git init` on agent-build so the bundle
# picks it up (the parent repo gitignores agent-build/, and `databricks bundle`
# respects the enclosing repo's ignore rules — without its own git boundary the
# sync would find "no files to sync" and deploy an empty app).
bash scripts/assemble_agent.sh

cd agent-build

# Vendor the build wheels (once, before deploy). Pre-fetches linux/cp311 wheels
# into vendor-wheels/ so the Apps build installs offline via UV_FIND_LINKS and
# never depends on the build container's PyPI egress (an unsanctioned .dev proxy, a lagging
# .cloud mirror, and no offline fallback are what made online installs flaky and
# blow past the 10-min startup limit). Requires local `uv` + `pip`.
bash scripts/vendor_wheels.sh

# Validate first. A healthy bundle reports 0 "no files to sync" warnings; if you
# see that warning, agent-build is missing its git boundary (re-run the script).
databricks bundle validate -p <your-cli-profile>

# Deploy: one command does deploy -> run -> enable-memory (see below).
# On a non-default catalog, pass it through: ... <profile> --var catalog=main
bash scripts/deploy_agent.sh <your-cli-profile>
```

> **On a non-default namespace** (e.g. a workspace whose catalog is `main`), append
> `--var catalog=main` (and/or `--var schema=...`) to `deploy_agent.sh` (it forwards
> them to every `bundle` command) so the wheels-volume binding and
> `DATABRICKS_MEMORY_STORE` line up. You can also set `BUNDLE_VAR_catalog=main`.

Then point `DATABRICKS_AGENT_APP_URL` at the deployed app URL.

#### Deploy → run → enable memory

`scripts/deploy_agent.sh` runs three steps; here is what it does by hand, and why:

```bash
# From agent-build/:
databricks bundle deploy -p <your-cli-profile>          # create app + SP, upload source
databricks bundle run agent_openai_agents_sdk -p <your-cli-profile>   # build + start

# Resolve the SP (exists after create) and enable durable memory:
SP=$(databricks apps get <your-app-name> -p <your-cli-profile> \
       --output json | jq -r '.service_principal_client_id')
uv run --python 3.12 python scripts/setup_memory_store.py "$SP" --profile <your-cli-profile>
```

**No manual Lakebase grant is required for the app to come up.** The frontend *does*
run Drizzle DB migrations during its first build, but the bundle binds the
Postgres/Lakebase resource with `CAN_CONNECT_AND_CREATE` (`agent/databricks.yml`),
applied at `bundle deploy`. That binding auto-provisions the app SP's Postgres login
role, so the migrations connect as the SP, `CREATE` their own schema/tables (the SP
becomes **owner** → full DML), and succeed. A no-grant deploy comes up `RUNNING` with
`ai_chatbot.{Chat,Message,Vote}` present and owned by the SP — verified end-to-end.
(`scripts/grant_lakebase_permissions.py` exists for a *different* topology — a
Lakebase-backed session/checkpoint store — and is **not** needed here; this app's
managed memory is a UC memory store, below.)

**Durable memory is a Unity Catalog memory store — you MUST create it and grant the
SP.** The `save_memory`/`get_memory` tools call the UC memory-store API
(`/api/2.1/unity-catalog/memory-stores/<catalog.schema.name>/entries`), not Lakebase.
That store is **not** created by quickstart or the bundle, and the app SP has no
rights on it by default, so a fresh deploy answers but silently fails to persist
("memory store not found", then "does not have READ/WRITE MEMORY STORE"). The last
line above fixes both — it creates `DATABRICKS_MEMORY_STORE` (default
`workspace.default.firefly_managed_memory`) and grants the SP
`READ_MEMORY_STORE`+`WRITE_MEMORY_STORE`. It is idempotent. There is no `databricks`
CLI for memory stores (CLI v0.298.0); the script uses the REST API via the SDK.

**Operational notes**

- **First request returns HTTP 503.** After `bundle run`, the container runs
  `uv sync`, `npm install`, and the Vite build for the chat UI before it serves
  traffic (can take a few minutes) — the 503 is normal, not a failure. Note the
  app is behind Databricks app auth, so an unauthenticated request 302-redirects
  to OIDC rather than returning `200`.
- **Deploy state ≠ health; read the *live* app state.** The platform marks the
  deployment `SUCCEEDED` the moment the container command *starts* — before the
  build finishes or the port binds (observed: `SUCCEEDED` ~45s before the backend
  bound `:8000`). So `active_deployment.status.state` is always green and is not a
  health signal. Judge health from the **live `app_status.state`** (`RUNNING`) or
  the **runtime logs** — wait for `Both frontend and backend are ready!`.
  `start_app.py` builds the frontend *before* the backend binds the port, so a
  frontend/migration failure takes the whole container down (honest `app_status`)
  rather than leaving the backend serving behind a broken UI.
- **Two different Python versions are in play.** `uv run quickstart` runs locally
  and needs **3.12** (its dependency tree uses PyO3 capped at 3.13, so `uv` picking
  3.14 fails — pass `--python 3.12`). The **Apps runtime is 3.11 (cp311)**, not 3.12
  as older docs claimed, so `scripts/vendor_wheels.sh` pins `PY=3.11` and downloads
  cp311 wheels. If you regenerate `uv.lock`, make sure the configured PyPI proxy is
  `pypi-proxy.cloud.databricks.com` (the `.dev` host is unsanctioned and stamping it into
  the lock is what caused the original install timeouts). `bootstrap.sh` Phase 4
  fails if `agent-build/uv.lock` or `databricks-apps/guest-manager/uv.lock` still
  contain `.dev`. From the workspace root you can also run
  `bash scripts/check-no-dev-pypi-proxy.sh`. Bootstrap also refuses to bridge
  pip → uv when the index is `pypi-proxy.dev.databricks.com`.
- **Verify the overlay applied** before deploying (quick sanity check):
  `agent-build/agent_server/agent.py` contains `GENIE_INSTRUCTIONS`,
  `e2e-chatbot-app-next/client/vite.config.ts` has `base: "./"`, and
  `client/src/main.tsx` contains `__FIREFLY_PROXY_BASENAME__`.
- **Genie/memory config lives in the bundle**, not the frontend — see
  `agent/databricks.yml` (`GENIE_MCP_MODE`, and `DATABRICKS_MEMORY_STORE` built
  from the `catalog`/`schema` bundle variables). `DATABRICKS_HOST` and
  `DATABRICKS_WORKSPACE_ID` are intentionally absent (auto-injected at runtime);
  `GENIE_ONE_URL` was removed along with the attribution link.

Re-run `bash scripts/assemble_agent.sh` after any change under `agent/` (overlay)
or a submodule bump; it rebuilds `agent-build/` from scratch each time.

## Local Development

### 1. Start the Development Server

```bash
pnpm dev
```

### 2. Start the Go Proxy (in a separate terminal)

```bash
cd go
make run
```

### 3. Open Your Browser

Navigate to [http://localhost:3000](http://localhost:3000)

### 4. Available Scripts

```bash
# Run development server
pnpm dev

# Build for production
pnpm build

# Test build (uses .next-test directory)
pnpm testBuild

# Start production server
pnpm start

# Run linter
pnpm lint

# Format code
pnpm format
```

## Deployment to Vercel

### 1. Install Vercel CLI (Optional)

```bash
pnpm install -g vercel
```

### 2. Connect to Vercel

```bash
vercel login
vercel link
```

### 3. Set Environment Variables in Vercel

Navigate to your project in the Vercel dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add all environment variables from `.env.example`:
   - Set variables for **Production**, **Preview**, and **Development** environments
   - Use `NEXT_PUBLIC_` prefix for client-side variables
3. Important variables to set:
   ```
   DATABRICKS_U2M_CLIENT_ID
   DATABRICKS_U2M_CLIENT_SECRET
   DATABRICKS_ACCOUNT_ID
   DATABASE_URL
   BETTER_AUTH_SECRET
   BETTER_AUTH_URL (use your production URL)
   # NEXT_PUBLIC_BETTER_AUTH_URL — omit for preview/dynamic URLs; see .env.example
   ENCRYPTION_KEY
   NEXT_PUBLIC_PROXY_URL
   DATABRICKS_APP_URL
   # Agent panel (optional; see "Agent Panel" below)
   NEXT_PUBLIC_AGENT_ENABLED
   DATABRICKS_AGENT_APP_URL
   # The Agent panel also needs the SSO->SPN mapping vars below (the proxy mints
   # the signed-in/guest user's mapped SPN token — see "Enable it"). Omit these
   # and /api/agent-proxy returns 400/401 at runtime:
   SPN_AUTH_DATABRICKS_ACCOUNT_ID
   SPN_AUTH_DATABRICKS_ACCOUNTS_URL
   SPN_AUTH_DATABRICKS_WORKSPACE_URL
   SPN_AUTH_OKTA_CLIENT_ID
   SPN_AUTH_OKTA_CLIENT_SECRET
   SPN_AUTH_OKTA_ISSUER
   FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID
   FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET
   FIREFLY_WORKSPACE_SPN_SECRET_SCOPE_NAME
   # ...and, to create/manage guest users for the panel:
   GUEST_API_SECRET
   ```

**Important**: For production deployment, you must use your actual domain name for certain URLs:

- **BETTER_AUTH_URL**: Use your production domain (e.g., `https://www.firefly-analytics.com`). This is server-side only and must match the Databricks OAuth redirect URI.
- **NEXT_PUBLIC_BETTER_AUTH_URL**: **Do not set this unless you have a stable custom domain attached to every deployment.** This variable is baked in at Next.js build time. If it points to a different origin than the URL serving the page (e.g. a Vercel preview URL), the browser will block auth API calls with a CORS error. Leave it unset — the auth client automatically uses `window.location.origin`, which is always correct.
- **NEXT_PUBLIC_PROXY_URL**: Use your deployed Go proxy URL (e.g., `https://proxy.firefly-analytics.com`)

For production with a custom domain:
```env
BETTER_AUTH_URL=https://www.firefly-analytics.com
# NEXT_PUBLIC_BETTER_AUTH_URL — only set if using a custom domain on all deployments
# NEXT_PUBLIC_BETTER_AUTH_URL=https://www.firefly-analytics.com
NEXT_PUBLIC_PROXY_URL=https://app-proxy.firefly-analytics.com
```

Replace `www.firefly-analytics.com` with your own domain name.

### 4. Update OAuth Redirect URLs

In your Databricks OAuth app configuration, add your production deployment URL:

**If using a custom domain:**
```
https://www.firefly-analytics.com/api/oauth/databricks/callback
```

**If using Vercel's default domain:**
```
https://your-app.vercel.app/api/oauth/databricks/callback
```

Replace with your actual production domain. For our deployment, we use:
```
https://www.firefly-analytics.com/api/oauth/databricks/callback
```

### 5. Disable Vercel Preview Deployment Protection (if using preview URLs)

Vercel projects have **SSO protection enabled by default** for preview deployments. This blocks unauthenticated requests — including the guest provisioning API (`/api/guest/*`) and any programmatic calls — with a `401 Protected deployment` response.

To disable it for a project:

```bash
# Via Vercel CLI (Vercel CLI 54+)
vercel project protection disable <project-name> --sso

# Or via Vercel API
curl -X PATCH "https://api.vercel.com/v9/projects/<project-id>" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ssoProtection": null}'
```

This only affects preview deployments. Production deployments with a custom domain are not protected by default.

### 6. Deploy

#### Option A: Deploy via Git

1. Push your code to GitHub/GitLab/Bitbucket
2. Import the repository in Vercel dashboard
3. Vercel will automatically deploy on every push

#### Option B: Deploy via CLI

```bash
# Deploy to production
vercel --prod

# Deploy to preview
vercel
```

### 6. Verify Deployment

After deployment:
- Check that all environment variables are set correctly
- Test the OAuth flow
- Verify database connectivity
- Ensure the Go proxy is accessible

### 7. Deploy Go Proxy Separately

The Go proxy should be deployed separately (not on Vercel):

**Recommended Options:**
- **Docker on Cloud Run/ECS**: Containerize and deploy to managed container platforms
- **VM with systemd**: Deploy to a dedicated VM for maximum control
- **AWS Lambda/Cloud Functions**: Deploy as a serverless function

Update `NEXT_PUBLIC_PROXY_URL` in Vercel environment variables to point to your deployed proxy.

## Guest User Provisioning

The guest login path lets external users access a specific Databricks workspace via a pre-provisioned service principal, without going through the Databricks OAuth wall. Provisioning is a three-step API sequence secured by `GUEST_API_SECRET` (`X-API-Key` header).

### Prerequisites

- `GUEST_API_SECRET` set in Vercel env (64-char hex, `openssl rand -hex 64`)
- A Databricks M2M service principal with client-id + client-secret that has access to the target workspace
- Vercel preview protection disabled if testing against a preview URL (see step 5 above)

### Step 1 — Register the guest workspace

```bash
curl -X POST https://<your-app>/api/guest/workspaces \
  -H "X-API-Key: $GUEST_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp Workspace", "workspaceUrl": "https://dbc-xxxx.cloud.databricks.com"}'
# Response: { "workspace": { "id": "<workspaceId>", "name": "...", "workspaceUrl": "..." } }
```

### Step 2 — Register the guest service principal

```bash
curl -X POST https://<your-app>/api/guest/spns \
  -H "X-API-Key: $GUEST_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Guest SPN",
    "clientId": "<m2m-client-id>",
    "clientSecret": "<m2m-client-secret>",
    "guestWorkspaceId": "<workspaceId from step 1>"
  }'
# Response: { "spn": { "id": "<spnId>", "name": "...", "clientId": "...", "guestWorkspaceId": "..." } }
```

### Step 3 — Create the guest user and get a login URL

```bash
curl -X POST https://<your-app>/api/guest/users \
  -H "X-API-Key: $GUEST_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"orgName": "Acme Corp", "spnId": "<spnId from step 2>"}'
# Response: { "guestUser": { "id": "...", "email": "...", "loginUrl": "https://<BETTER_AUTH_URL>/guest-login?token=<ott>", "expiresAt": "...", ... } }
```

Send the `loginUrl` to your end-user. It contains a one-time token valid for 10 minutes. The user clicks it, the token is verified, and they are redirected to their organization's dashboard — no Databricks SSO required.

> **Note**: The `loginUrl` hostname comes from the server-side `BETTER_AUTH_URL` env var. The auth client verifies the token against `window.location.origin` (or `NEXT_PUBLIC_BETTER_AUTH_URL` if set). These two must match, so `BETTER_AUTH_URL` should be set to the URL where the app is served. Do not set `NEXT_PUBLIC_BETTER_AUTH_URL` to a different origin (see `.env.example`).

## Architecture

### Authentication Strategies

This application supports multiple authentication strategies:

1. **Login With Databricks**: Per-workspace authentication using Databricks native OAuth
2. **Custom Federation**: Multi-tenant authentication with custom identity providers
3. **Login With Okta**: Tenant-based authentication with service principal identity mapping
4. **Login With Guest User**: Provisioned via a private REST API secured with `GUEST_API_SECRET`. See [Guest User Provisioning](#guest-user-provisioning) below.

### Key Features

- **Organization Support**: Multi-tenant architecture with organization management
- **Embedded Databricks Apps**: VSCode editor embedded without SSO exposure
- **Agent Panel**: Slide-out Genie + managed-memory chat assistant, embedded via a Vercel-native SPN proxy (see [Agent Panel](#agent-panel-managed-memory-agent))
- **Notebooks**: Interactive notebooks with full Databricks functionality
- **SQL Editor**: Advanced SQL editor with visual query builder
- **Data Catalog**: Browse Unity Catalog with a modern interface
- **Pipeline Editor**: Visual node-based pipeline design with Delta Live Tables integration

### Technology Stack

- **Frontend**: Next.js 15 with App Router, React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better Auth with OAuth integration
- **Proxy**: Go reverse proxy for secure token handling
- **Deployment**: Vercel (frontend), Cloud platform of choice (proxy)

## Documentation

### Solutions

- [All Solutions](/docs/solutions)
- [Embedding Databricks Apps w/o SSO](/docs/solutions/embedding-apps)
- [Notebook Editor](/docs/solutions/notebook-editor)
- [Code Editor](/docs/solutions/code-editor)
- [Agent Panel](/docs/solutions/agent)
- [SQL Editor](/docs/solutions/sql-editor)
- [Data Catalog](/docs/solutions/data-catalog)
- [Pipeline Editor](/docs/solutions/pipeline-editor)

### Architecture

- [Embedding Databricks Apps via Proxy (hub)](/docs/architecture/lakehouse-apps-proxy)
- [Architecture Overview](/docs/architecture/overview)
- [Login With Databricks Authentication](/docs/architecture/authentication/databricks-identity)

## Project Support

Please note that this project is provided for your exploration only and is not formally supported by Databricks with Service Level Agreements (SLAs). They are provided AS-IS, and we do not make any guarantees. Please do not submit a support ticket relating to any issues arising from the use of this project.

Any issues discovered through the use of this project should be filed as GitHub Issues on this repository. They will be reviewed as time permits, but no formal SLAs for support exist.

## License

This project is licensed under the Databricks License. See the [LICENSE](LICENSE) file for details.

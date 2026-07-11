# FireFly Analytics - Databricks Custom Frontend


A Next.js application that provides a customized frontend for Databricks with multiple authentication strategies and embedded Databricks apps.

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

### How the agent uses Genie One

The agent answers data questions with **Genie One** — the workspace-wide unified
Genie — served over the **Genie MCP** endpoint (`/api/2.0/mcp/genie`). The
`ask_genie_one` tool (`agent/agent_server/genie_tools.py`) calls `genie_ask` and
polls `genie_poll_response` until completion, authenticating with the agent App's
service principal. It is **not** scoped to a single Genie space
(`GENIE_MCP_MODE=one`; there is no `GENIE_SPACE_ID`).

Genie is configured at the **agent App layer** in `agent/databricks.yml` (not the
frontend `.env.local`):

| Env var | Purpose |
| --- | --- |
| `GENIE_MCP_MODE=one` | Use Genie One (workspace-wide) rather than a specific space |
| `GENIE_ONE_URL` | The "Powered by Genie · Genie One" attribution link (surfaced to the UI via `/api/config`) |
| `DATABRICKS_HOST`, `DATABRICKS_WORKSPACE_ID` | Fallback used to derive `/one?o=<id>` when `GENIE_ONE_URL` is unset |

The `GENIE_INSTRUCTIONS` prompt (composed onto the agent's memory instructions in
`agent/agent_server/agent.py`) forces Genie-first behavior for any question about
tables, catalogs, dashboards, or "my data".

> Note: the tool currently **hardcodes** the MCP path `/api/2.0/mcp/genie` rather
> than reading `GENIE_MCP_URL`, so that env var only feeds the attribution-link
> fallback today.

### Grant the agent's service principal access to your data

The agent queries Genie One as the **agent App's service principal** (see above), not
the signed-in user. Genie only returns Unity Catalog data that this service principal can
access, so on a workspace where the SP has no grants, data questions come back empty even
though the agent and Genie are otherwise working. Grant the app's service principal access
to the catalogs/schemas you want it to answer over:

- `USE CATALOG` on the catalog and `USE SCHEMA` on the schema,
- `SELECT` on the tables (or on the schema), and
- access to a SQL warehouse Genie can execute against.

<!-- UNVERIFIED: the exact minimal privilege set — and whether Genie One requires an
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
- a **Lakebase (Databricks Postgres)** autoscaling instance (managed-memory store),
- a **UC volume** `main.default.firefly_wheels` (the bundle grants the app
  `READ_VOLUME` on it).

For a fresh workspace, create them as follows.

**1. Experiment + Lakebase (one command).** From `agent-build/` (run
`bash scripts/assemble_agent.sh` first so the directory exists):

```bash
cd agent-build

# Creates the MLflow experiment AND a new autoscaling Lakebase project+branch in
# one pass, and writes their IDs into agent-build/databricks.yml + .env.
# <lakebase-name> must be new/unique (this path has no reuse — a name that already
# exists errors out). Use lowercase alphanumerics + hyphens.
uv run quickstart --profile <your-cli-profile> --lakebase-create-new <lakebase-name>
```

**2. Wheels volume.** Create the UC volume the bundle grants read on:

```bash
databricks volumes create main default firefly_wheels MANAGED -p <your-cli-profile>
```

> **The volume must _exist_; its contents are not read in the default path.** The
> app installs dependencies online (`uv sync` / `npm install`) at container start
> and `vendor-wheels/**` is excluded from sync, so an empty volume satisfies the
> `READ_VOLUME` grant. <!-- UNVERIFIED: that an empty volume is sufficient (and that
> deploy fails without it) is inferred, not yet proven by a negative deploy test. -->

> **Copy the generated IDs into the tracked overlay.** `quickstart` writes the new
> `experiment_id` and `postgres` (`branch`/`database`) into **`agent-build/databricks.yml`**,
> which is gitignored and rebuilt from scratch by `scripts/assemble_agent.sh`. Copy
> those values into the tracked overlay **`agent/databricks.yml`**, or they are lost
> on the next assemble. Also re-point the hard-coded `DATABRICKS_HOST`,
> `DATABRICKS_WORKSPACE_ID`, and `GENIE_ONE_URL` for the target workspace.

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

# Validate first. A healthy bundle reports 0 "no files to sync" warnings; if you
# see that warning, agent-build is missing its git boundary (re-run the script).
databricks bundle validate -p <your-cli-profile>

# Deploy + start the Databricks App. `bundle run` requires the app resource
# KEY (agent_openai_agents_sdk, from databricks.yml) — without it the CLI errors
# with "expected a KEY of the resource to run".
databricks bundle deploy -p <your-cli-profile>
databricks bundle run agent_openai_agents_sdk -p <your-cli-profile>
```

Then point `DATABRICKS_AGENT_APP_URL` at the deployed app URL.

**Grant the app's service principal Lakebase access (required for memory).** After
the first successful deploy, the app's SP is a bare Postgres role with no rights to
its memory tables — memory reads/writes fail until you grant them. From `agent-build/`:

```bash
# The app's SP client ID comes from the deployed app:
SP=$(databricks apps get <your-app-name> -p <your-cli-profile> --output json | jq -r '.service_principal_client_id')

# memory-type is "openai" for this template (agent-openai-agents-sdk). Lakebase
# connection defaults are read from the .env quickstart wrote.
uv run python scripts/grant_lakebase_permissions.py "$SP" --memory-type openai
```

> Some grants may warn "table does not exist" on a fresh branch — that is expected;
> the memory tables are created on first agent use. Re-run the same command once
> after the agent's first request to grant the remaining tables.

**Operational notes**

- **First request returns HTTP 503.** After `bundle run`, the container runs
  `uv sync`, `npm install`, and the Vite build for the chat UI before it serves
  traffic (can take a few minutes) — the 503 is normal, not a failure. Note the
  app is behind Databricks app auth, so an unauthenticated request 302-redirects
  to OIDC rather than returning `200`. To confirm readiness, check
  `databricks apps get <app-name> -p <your-cli-profile>` and wait for the status
  to be RUNNING.
- **Pin Python 3.12 for the build.** The agent's dependency tree (`whenever` via
  `databricks-agents`) uses PyO3 capped at 3.13, so `uv` picking 3.14 fails.
  Databricks App runtimes are 3.12; build/sync with 3.12 to match.
- **Verify the overlay applied** before deploying (quick sanity check):
  `agent-build/agent_server/agent.py` contains `GENIE_INSTRUCTIONS`,
  `e2e-chatbot-app-next/client/vite.config.ts` has `base: "./"`, and
  `client/src/main.tsx` contains `__FIREFLY_PROXY_BASENAME__`.
- **Genie/memory config lives in the bundle**, not the frontend — see
  `agent/databricks.yml` (`GENIE_MCP_MODE`, `GENIE_ONE_URL`,
  `DATABRICKS_MEMORY_STORE`, etc.).

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
   NEXT_PUBLIC_BETTER_AUTH_URL (use your production URL)
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

- **BETTER_AUTH_URL**: Use your production domain (e.g., `https://www.firefly-analytics.com`)
- **NEXT_PUBLIC_BETTER_AUTH_URL**: Use your production domain (e.g., `https://www.firefly-analytics.com`)
- **NEXT_PUBLIC_PROXY_URL**: Use your deployed Go proxy URL (e.g., `https://proxy.firefly-analytics.com`)

For our production deployment at FireFly Analytics:
```env
BETTER_AUTH_URL=https://www.firefly-analytics.com
NEXT_PUBLIC_BETTER_AUTH_URL=https://www.firefly-analytics.com
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

### 5. Deploy

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

## Architecture

### Authentication Strategies

This application supports multiple authentication strategies:

1. **Login With Databricks**: Per-workspace authentication using Databricks native OAuth
2. **Custom Federation**: Multi-tenant authentication with custom identity providers
3. **Login With Okta**: Tenant-based authentication with service principal identity mapping
4. **Login With Guest User**: Coming Soon

### Key Features

- **Organization Support**: Multi-tenant architecture with organization management
- **Embedded Databricks Apps**: VSCode editor embedded without SSO exposure
- **Agent Panel**: Slide-out Genie + managed-memory chat assistant, embedded via a Vercel-native SPN proxy (see [Agent Panel](#agent-panel-managed-memory-agent))
- **Notebooks**: Interactive notebooks with full Databricks functionality
- **SQL Editor**: Advanced SQL editor with visual query builder
- **Data Catalog**: Browse Unity Catalog with a modern interface

### Technology Stack

- **Frontend**: Next.js 15 with App Router, React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better Auth with OAuth integration
- **Proxy**: Go reverse proxy for secure token handling
- **Deployment**: Vercel (frontend), Cloud platform of choice (proxy)

## Documentation

For detailed architectural documentation, visit:
- [Embedding Databricks Apps w/o SSO](http://localhost:3000/docs/architecture/lakehouse-apps-proxy)
- [Login With Databricks Authentication](http://localhost:3000/docs/architecture/authentication/databricks-identity)

## Project Support

Please note that this project is provided for your exploration only and is not formally supported by Databricks with Service Level Agreements (SLAs). They are provided AS-IS, and we do not make any guarantees. Please do not submit a support ticket relating to any issues arising from the use of this project.

Any issues discovered through the use of this project should be filed as GitHub Issues on this repository. They will be reviewed as time permits, but no formal SLAs for support exist.

## License

This project is licensed under the Databricks License. See the [LICENSE](LICENSE) file for details.

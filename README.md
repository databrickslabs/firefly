# FireFly Analytics - Databricks Custom Frontend


A Next.js application that provides a customized frontend for Databricks with multiple authentication strategies and embedded Databricks apps.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [Databricks OAuth Configuration](#databricks-oauth-configuration)
- [Go Proxy Setup (VSCode Editor)](#go-proxy-setup-vscode-editor)
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

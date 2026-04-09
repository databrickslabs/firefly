# Databricks But Not — Replit Project

## Overview
A Next.js 15 application that provides a Databricks-like interface with OAuth authentication, SQL editors, notebooks, embedded dashboards, and a proxy layer.

## Stack
- **Framework**: Next.js 15.5 with Turbopack
- **Runtime**: Node.js 20
- **Package manager**: pnpm
- **Auth**: better-auth with Databricks OAuth (U2M + M2M)
- **Database**: PostgreSQL via Neon (`@neondatabase/serverless`) + Drizzle ORM
- **UI**: Radix UI + shadcn/ui + Tailwind CSS v4
- **State**: Zustand + TanStack Query

## Architecture
- `src/app/` — Next.js App Router pages and API routes
- `src/components/` — Shared React components
- `src/db/` — Drizzle ORM schema and database client
- `src/lib/` — Auth config, utilities, encryption
- `src/middleware.ts` — Auth middleware
- `drizzle/` — Database migrations
- `databricks-apps/` — Static Databricks app files
- `go/` — Go proxy server source

## Running Locally on Replit
The workflow "Start application" runs `pnpm run dev` on port 5000.

## Required Secrets
The following secrets must be configured for full functionality:

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (already set) |
| `BETTER_AUTH_SECRET` | Session encryption key (generate: `openssl rand -base64 32`) |
| `ENCRYPTION_KEY` | 64-char hex key for OAuth token storage (generate: `openssl rand -hex 32`) |
| `DATABRICKS_U2M_CLIENT_ID` | Databricks U2M OAuth client ID |
| `DATABRICKS_U2M_CLIENT_SECRET` | Databricks U2M OAuth client secret |
| `DATABRICKS_ACCOUNT_ID` | Databricks account ID |

Optional secrets are listed in `.env.example`.

## Environment Variables (non-secret)
| Variable | Value |
|----------|-------|
| `BETTER_AUTH_URL` | Set to your Replit dev domain |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Same as above |
| `NEXT_TELEMETRY_DISABLED` | `1` |

## Notes
- Port is hardcoded to 5000 for Replit compatibility (`pnpm run dev` / `pnpm run start`)
- The `pnpm.onlyBuiltDependencies` field in package.json allows native packages to compile

# AGENTS.md

## Repository summary
- Project: FireFly Analytics custom frontend for Databricks, built with Next.js and a Go proxy.
- Primary Databricks partner type: `isv-partners`.
- Secondary capability: `data-collaboration` via Delta Sharing catalog mounting and BYOD metastore/provider flows.

## Important Databricks patterns
- U2M OAuth with PKCE is configured dynamically per organization/workspace in `src/lib/auth-dynamic.ts`.
- M2M service-principal flows are implemented for workspace and account access in `src/lib/databricks-spn-authtoken.ts` and `src/lib/databricks-workspace-token.ts`.
- Unity Catalog is a central integration surface: catalogs, schemas, tables, and volumes are managed through API routes and helper libraries.
- Delta Sharing BYOD flows are concentrated under `src/app/api/sso-spn/byod/databricks/**`, including provider/share discovery and catalog mounting.
- SQL Warehouses are managed with serverless + Photon defaults in `src/app/api/sso-spn/compute/warehouses/route.ts`.
- DLT pipeline APIs and Databricks SQL AI functions (`ai_query`) are used in the pipeline studio flow, with model endpoint configuration in `src/components/pipeline-studio/properties/ai-properties.tsx` and SQL generation in `src/lib/pipeline-to-sql.ts`.
- Lakeview dashboard embedding is implemented via `src/app/api/databricks/dashboards/embed/route.ts` and `src/components/embedded-dashboard.tsx`.
- Custom API attribution/user-agent logic appears in `databricks-apps/code-editor/app.py` via explicit `User-Agent` headers.
- Pipeline Studio encodes Databricks SQL AI functions (`ai_query`, `ai_extract`), Delta Change Data Feed, and three-level UC table names in `src/lib/pipeline-to-sql.ts`.
- Unity Catalog Volumes are first-class in the product via `src/lib/databricks-volumes-api.ts`, including `catalog.schema.volume` parsing and `/Volumes/...` path generation.
- The repo exposes Databricks pipelines via REST API routes, but there is no obvious repository-local IaC or CI/CD automation checked in.

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
- The repo exposes Databricks pipelines via REST API routes. The only checked-in CI is `.github/workflows/runbook-invariants.yml`; GitHub Actions is currently **disabled at the repository level**, so it does not run — the invariants below are enforced by convention and by running the guard script manually.
- The managed-memory Agent panel embeds a Databricks App (Genie + memory) via a Vercel-native reverse proxy at `src/app/api/agent-proxy/[[...path]]/route.ts` (mints the user/guest SPN token, forwards HTTP + SSE to `DATABRICKS_AGENT_APP_URL`) — distinct from the Go proxy used by the code/notebook editors. UI: `src/components/agent/agent-panel.tsx` (gated by `NEXT_PUBLIC_AGENT_ENABLED`).
- The agent app source is the `vendor/app-templates` git submodule (`agent-openai-agents-sdk` + `e2e-chatbot-app-next`) plus the local `agent/` overlay, merged by `scripts/assemble_agent.sh` into the gitignored `agent-build/`. Keep `vendor/**` pristine; put deltas in `agent/`.

## Bootstrap invariants — do not regress (ENV-0, #69)

Read this before editing `BOOTSTRAP.md`, `README.md`, or `scripts/bootstrap.sh`.
Verify any change with `bash scripts/check-runbook-invariants.sh`.

- **Never require `corepack enable` or `corepack prepare`.** corepack fetches its package
  manager from `registry.npmjs.org` and ignores the configured npm registry, so it fails
  wherever public npm is blocked or blackholed. Install pnpm with
  `npm install -g pnpm@<pinned-version>`, which honors the user's own registry. The version
  **must** be pinned: pnpm's `latest` dist-tag has shipped a 12.x alpha that ignores
  `onlyBuiltDependencies` (`ERR_PNPM_IGNORED_BUILDS`).
- **Phase 0 of `BOOTSTRAP.md` must contain runnable commands, not prose.** Corporate-network
  handling lives in `scripts/lib/corp-network.sh` and is sourced by *both* `bootstrap.sh` and
  the Phase 0a block in `BOOTSTRAP.md`. Describing a bridge without giving the reader a
  command to run it is the exact defect that caused #69 — the runbook is followed
  top-to-bottom by agents (that is what the README's "Open in Cursor" badge launches), so an
  unexecuted prose bridge means the install runs unbridged.
- **Never duplicate the bridge logic.** One implementation in `scripts/lib/corp-network.sh`;
  both consumers source it. Two copies drift, and the drift is invisible until someone on a
  restricted network runs the doc path.
- **`README.md` and `BOOTSTRAP.md` must agree** on how pnpm is installed. They contradicted
  each other for months (README said "not corepack" while the runbook required corepack).
- **Never probe a registry with `npm ping`.** Corporate mirrors proxy package routes but not
  service endpoints — `npm-proxy.dev.databricks.com` returns HTTP 404 for `/-/ping` while
  serving `npm view pnpm@10.34.5 version` fine. Probe the real operation instead.
- **Never work around a blocked registry** with `--registry https://registry.npmjs.org`, by
  disabling TLS verification, or by editing `/etc/hosts`. Bridge the user's own configured
  mirror; never hardcode a mirror URL.
- **Every helper `BOOTSTRAP.md` calls must be defined in a `scripts/lib/*.sh` that the
  runbook itself sources.** Not in `bootstrap.sh`, not left to the reader. The runbook
  called `store_secret` / `read_secret` for ten days with no definition anywhere in the
  file, while `bootstrap.sh`'s version took `(VARNAME, _, KEY)` and every runbook call site
  used `$(read_secret KEY)` — so even copying it across did not work. A headless agent
  invented its own, used bash-only `${!key}`, and got `bad substitution` under zsh.
- **Runnable blocks must parse under bash *and* zsh.** zsh is the macOS default and the
  reader pastes these into their own shell. No `${!var}`, no `declare -F` as a function
  test, no `mapfile`/`readarray` (macOS also ships bash 3.2).
- **A code block must do what it looks like it does.** `command -v X || { # install X }`
  and `{ : ; }` shipped as the Phase 1b/1e installers: they read as installs and are
  no-ops, which is invisible on any machine that already has the tool.
- **Never parse structured output with `grep`.** The `sync.exclude` list opens with a
  comment naming `pyproject.toml` and `vendor-wheels/`, so `grep -q pyproject.toml` reports
  it excluded when it is not — `bootstrap.sh` failed a correct config that way, and an
  agent's `-\s` regex read the same list as empty and passed. Use
  `check_sync_exclude_rules`. Same rule for CLI JSON: use the shared parsers.
- **Never derive an id from a `create` response you then act on.** `neonctl projects
  create` succeeds server-side before any parse of its output can fail, so a parse bug
  orphans a real project. Create, then look the id up by name; fail closed if it is empty.

Historical note: this regressed once already. `e91322d` deleted the "do not use corepack"
guard and its rationale, then `99f2cc2` — a docs-sync commit — reintroduced corepack as the
first executable command in the runbook. Deleting the reason is what made reintroducing the
bug look reasonable. Keep the rationale attached to the rule.

The same `99f2cc2` is also the origin of three of the defects listed above: it back-ported
`bootstrap.sh`'s *idempotency* fix for Neon while dropping the *parsing* fix from the same
block, replaced self-contained `keyring` one-liners with calls to functions it did not
carry across, and added the two comment-only installers. Blanket "sync the docs to the
script" commits are how this class of bug arrives. Edit the shared library instead.

- when testint build always run pnpm run testBuild
- use context7 for anything related to docs and looking up how to use apis and libraries

## Caching Strategy

### Server-Side Caching (Next.js API Routes)
- **ALWAYS use `unstable_cache`** for database queries in API routes
- **NEVER use custom Cache-Control headers** in responses
- Wrap database queries with cache tags for proper invalidation:
  ```typescript
  const getData = unstable_cache(
    async () => db.select().from(table),
    ["cache-key"],
    { tags: ["CACHE_TAG"], revalidate: false }
  );
  ```
- Call `revalidateTag(CACHE_TAG)` in mutation endpoints after DB writes
- Export cache tags as constants to share between routes

### Client-Side Caching (TanStack Query)
- Use TanStack Query for all client-side data fetching
- Configure queries with appropriate settings:
  ```typescript
  useQuery({
    queryKey: ["key"],
    queryFn: async () => fetch("/api/endpoint"),
    refetchOnWindowFocus: true,  // Refetch when window gains focus
    staleTime: 0,                 // Always consider data stale
  });
  ```
- Implement optimistic updates in mutations for instant UI feedback
- Let mutations handle cache invalidation via `onSettled`
- **DO NOT** use `useEffect` to manually invalidate queries on component mount
- Trust the mutation's `onSettled` + `refetchOnWindowFocus` for consistency

- Do not delete folders with rm -rf
- only delete files!

## Agent panel (managed-memory agent)

- The Agent panel embeds a Databricks App (Genie + memory) via a Vercel-native
  reverse proxy at `src/app/api/agent-proxy/[[...path]]/route.ts` — NOT the Go
  proxy. The route mints the user/guest SPN token
  (`src/lib/databricks-spn-authtoken.ts`) and forwards HTTP + SSE to
  `DATABRICKS_AGENT_APP_URL`.
- This proxy route intentionally sets `Cache-Control: no-store` on the rewritten
  HTML document (it injects `<base href>` + forced light theme per request). This
  is the one place the "never use custom Cache-Control" rule does not apply,
  because the app's ETag never changes and a 304 would serve stale injected HTML.
- Panel UI: `src/components/agent/agent-panel.tsx` (gated by
  `NEXT_PUBLIC_AGENT_ENABLED`), store in `src/stores/agent-panel-store.ts`.
- The agent app source is the `vendor/app-templates` submodule + `agent/` overlay,
  merged by `scripts/assemble_agent.sh` into the gitignored `agent-build/`. Do not
  hand-edit `vendor/**` (pristine submodule); put deltas in `agent/`.

## Bootstrap runbook (ENV-0, #69)

Applies to `BOOTSTRAP.md`, `README.md`, `scripts/bootstrap.sh`, `scripts/lib/**`.
**ALWAYS run `bash scripts/check-runbook-invariants.sh` after touching any of them.**

- **NEVER use `corepack enable` / `corepack prepare` to install pnpm.** corepack ignores
  the npm registry setting and fetches from `registry.npmjs.org`, so it dies wherever
  public npm is blocked. **ALWAYS use `npm install -g pnpm@<pinned-version>`** (npm honors
  the user's configured registry). The pin is required — pnpm's `latest` tag has shipped a
  12.x alpha that fails with `ERR_PNPM_IGNORED_BUILDS`.
- **NEVER put corporate-network setup in `BOOTSTRAP.md` as prose only.** Phase 0 must have
  runnable commands. Both the runbook and `bootstrap.sh` source the single implementation
  in `scripts/lib/corp-network.sh` — **NEVER duplicate that logic** into either one.
- **ALWAYS keep `README.md` and `BOOTSTRAP.md` consistent** about the pnpm install method.
- **NEVER use `npm ping` to test registry reachability** — corporate mirrors 404 `/-/ping`
  while serving packages normally. Probe the actual operation (`npm view pnpm@<pin>`).
- **NEVER bypass a blocked registry** via `--registry https://registry.npmjs.org`, disabling
  TLS, or `/etc/hosts` edits. Bridge the user's own mirror; never hardcode one.

This already regressed once: the guard was deleted (`e91322d`), then a docs-sync commit
(`99f2cc2`) reintroduced corepack. Keep the rationale next to the rule.
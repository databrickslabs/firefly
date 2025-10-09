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
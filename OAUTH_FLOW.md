# OAuth Proxy Flow Documentation

## Overview
This implementation uses an OAuth proxy pattern with Home Realm Discovery (HRD) to support multiple Databricks workspaces with a single OAuth application and fixed redirect URIs.

## Architecture

### Problem Solved
- Databricks OAuth apps only allow 10 redirect URIs with no wildcard support
- Need to support 10+ organizations, each with different workspace OIDC endpoints
- Better Auth generic OAuth requires fixed authorization/token URLs
- Running in serverless Next.js environment (no persistent state)
- Users can belong to multiple organizations and need to select which workspace to access

### Solution
OAuth proxy pattern with HRD flow and cookie-based organization context passing.

## Flow Diagram

```
User → Email Input → HRD Lookup → Org Selector → Login Page → OAuth Proxy → Databricks
         (step 1)     (step 2)      (step 3)       (step 4)    (set cookie)       ↓
                                                                                OAuth Login
                                                                                    ↓
User Dashboard ← Better Auth ← Token Proxy ← Callback Proxy ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
                  (create session)  (exchange token)  (decode state)
```

## Detailed Steps

### 1. Email Entry
**File**: `src/app/databricks-idp/page.tsx`

User enters their email address on the IdP landing page.

```typescript
// User submits email
router.push(`/databricks-idp/select-org?email=${encodeURIComponent(email)}`);
```

### 2. Home Realm Discovery (HRD)
**File**: `src/app/api/databricks/hrd/lookup/route.ts`

The system looks up which organizations the user belongs to.

```typescript
// Find user by email
const users = await db
  .select()
  .from(user)
  .where(eq(user.email, email))
  .limit(1);

// Get all organizations the user is a member of
const memberships = await db
  .select({ organization: organization })
  .from(member)
  .innerJoin(organization, eq(member.organizationId, organization.id))
  .where(eq(member.userId, foundUser.id));

return NextResponse.json({
  organizations: memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    workspaceUrl: m.organization.workspaceUrl,
    slug: m.organization.slug,
  })),
});
```

### 3. Organization Selection
**File**: `src/app/databricks-idp/select-org/page.tsx`

User is presented with a list of organizations they can access.

```typescript
// Fetch organizations via HRD lookup
const response = await fetch("/api/databricks/hrd/lookup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
});

// If user belongs to only one org, auto-select it
if (data.organizations.length === 1) {
  await handleSelectOrg(data.organizations[0].id);
}

// User clicks on an organization
const handleSelectOrg = async (orgId: string) => {
  router.push(`/databricks-idp/login?email=${encodeURIComponent(email!)}&org=${orgId}`);
};
```

### 4. Login Page - OAuth Initiation
**File**: `src/app/databricks-idp/login/page.tsx`

The login page receives `?email=user@example.com&org=org-id` query params.

```typescript
// Step 1: Fetch organization details
const response = await fetch(`/api/databricks/organizations/${orgId}`);
const org = await response.json();

// Step 2: Set organization cookie via server endpoint
const setOrgResponse = await fetch("/api/oauth/set-org", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ organizationId: orgId }),
});

// Step 3: Initiate OAuth sign-in
await authClient.signIn.oauth2({
  providerId: "databricks-workspace",
  callbackURL: "/databricks-idp/dashboard",
});
```

### 5. Set Organization Cookie
**File**: `src/app/api/oauth/set-org/route.ts`

Sets temporary cookie with organization ID.

```typescript
response.cookies.set("oauth_org_id", organizationId, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 600, // 10 minutes
  path: "/",
});
```

### 6. Authorization Request Proxy
**Better Auth** → **Authorization Proxy**

Better Auth redirects to: `/api/oauth/databricks/authorize?client_id=...&state=...&redirect_uri=...`

**File**: `src/app/api/oauth/databricks/authorize/route.ts`

```typescript
// Read organization from cookie
const organizationId = request.cookies.get("oauth_org_id")?.value;

// Look up workspace URL from database
const [org] = await db
  .select()
  .from(organization)
  .where(eq(organization.id, organizationId))
  .limit(1);

// Store OAuth flow mapping for session creation
await db.insert(oauthFlowMapping).values({
  state: state,
  organizationId: organizationId,
  createdAt: new Date(),
});

// Encode org info into state parameter
const enhancedState = encodeOAuthState(state, organizationId, org.workspaceUrl);

// Redirect to actual workspace OIDC endpoint
const authUrl = new URL(`${org.workspaceUrl}/oidc/v1/authorize`);
authUrl.searchParams.set("state", enhancedState);
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
// ... other OAuth params
```

### 7. User Authentication
User authenticates directly with Databricks workspace OIDC endpoint.

### 8. OAuth Callback Proxy
**Databricks** → **Callback Proxy** → **Better Auth**

Databricks redirects to: `/api/oauth/databricks/callback?code=...&state=enhancedState`

**File**: `src/app/api/oauth/databricks/callback/route.ts`

```typescript
// Decode enhanced state to extract org info
const { originalState, organizationId, workspaceUrl } = decodeOAuthState(enhancedState);

// Forward to Better Auth with org info in query params
const betterAuthCallback = new URL(
  "/api/auth/oauth2/callback/databricks-workspace",
  request.url
);
betterAuthCallback.searchParams.set("code", code);
betterAuthCallback.searchParams.set("state", originalState);
betterAuthCallback.searchParams.set("_org", organizationId);
betterAuthCallback.searchParams.set("_workspace", workspaceUrl);

return NextResponse.redirect(betterAuthCallback);
```

### 9. Token Exchange Proxy
**Better Auth** → **Token Proxy** → **Databricks Workspace**

Better Auth calls: `/api/oauth/databricks/token` with form data including `redirect_uri` with `_workspace` param

**File**: `src/app/api/oauth/databricks/token/route.ts`

```typescript
// Extract workspace URL from redirect_uri query params
const redirectUrl = new URL(redirectUri);
const workspaceUrl = redirectUrl.searchParams.get("_workspace");

// Exchange code for tokens with actual workspace
const tokenUrl = `${workspaceUrl}/oidc/v1/token`;
const tokenResponse = await fetch(tokenUrl, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: tokenFormData,
});

// Return tokens to Better Auth
return NextResponse.json(await tokenResponse.json());
```

### 10. Session Creation with Active Organization
Better Auth decodes JWT access token and creates user session.

**File**: `src/lib/auth.ts` (databaseHooks.session.create)

```typescript
databaseHooks: {
  session: {
    create: {
      before: async (session) => {
        // Get user's memberships
        const memberships = await db
          .select()
          .from(schema.member)
          .where(eq(schema.member.userId, session.userId));

        // Find the most recent OAuth flow for this user's orgs
        const recentFlows = await db
          .select()
          .from(schema.oauthFlowMapping)
          .orderBy(schema.oauthFlowMapping.createdAt)
          .limit(50);

        // Match the OAuth flow to determine which org they logged in with
        let targetOrgId: string | null = null;
        for (const flow of recentFlows.reverse()) {
          if (memberOrgIds.includes(flow.organizationId)) {
            targetOrgId = flow.organizationId;
            break;
          }
        }

        // Set activeOrganizationId on session
        return {
          data: {
            ...session,
            activeOrganizationId: targetOrgId,
          },
        };
      },
    },
  },
}
```

### 11. Dashboard Access
User is redirected to `/databricks-idp/dashboard` with active session and organization set.

## Configuration

### Better Auth Config
**File**: `src/lib/auth.ts`

```typescript
genericOAuth({
  config: [
    {
      providerId: "databricks-workspace",
      clientId: process.env.DATABRICKS_U2M_CLIENT_ID,
      clientSecret: process.env.DATABRICKS_U2M_CLIENT_SECRET,
      // Proxy endpoints (not actual workspace endpoints)
      authorizationUrl: `${process.env.BETTER_AUTH_URL}/api/oauth/databricks/authorize`,
      tokenUrl: `${process.env.BETTER_AUTH_URL}/api/oauth/databricks/token`,
      redirectURI: `${process.env.BETTER_AUTH_URL}/api/oauth/databricks/callback`,
      scopes: ["all-apis", "offline_access"],
      pkce: true,
      getUserInfo: async (tokens) => {
        const decoded = decodeJwt(tokens.accessToken);
        return {
          id: decoded.sub as string,
          email: decoded.email as string,
          name: decoded.name as string,
          emailVerified: true,
        };
      },
    },
  ],
})
```

### Required Redirect URIs in Databricks OAuth App

Only 2 redirect URIs needed total:

1. **Local**: `http://localhost:3000/api/oauth/databricks/callback`
2. **Production**: `https://your-domain.com/api/oauth/databricks/callback`

## State Management

### Cookie-based (Serverless Compatible)
- **Organization selection**: Cookie `oauth_org_id` stores organization ID (10 min expiry)
- **Authorization phase**: Cookie carries org context to proxy
- **Callback phase**: Enhanced state parameter contains org ID + workspace URL (base64 encoded)
- **Token phase**: Workspace URL passed via redirect_uri query param `_workspace`

### Database-based OAuth Flow Tracking
**File**: `src/db/schema/auth.ts`

```typescript
export const oauthFlowMapping = pgTable("oauth_flow_mapping", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: text("state").notNull(),
  organizationId: text("organization_id").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
});
```

Used to track which organization a user authenticated with so the session can set the correct `activeOrganizationId`.

### State Encoding
**File**: `src/lib/oauth-state-cache.ts`

```typescript
// Format: base64url(originalState|orgId|workspaceUrl)
export function encodeOAuthState(
  originalState: string,
  organizationId: string,
  workspaceUrl: string
): string {
  const combined = `${originalState}|${organizationId}|${workspaceUrl}`;
  return Buffer.from(combined).toString("base64url");
}

export function decodeOAuthState(encodedState: string): {
  originalState: string;
  organizationId: string;
  workspaceUrl: string;
} {
  const decoded = Buffer.from(encodedState, "base64url").toString("utf-8");
  const [originalState, organizationId, workspaceUrl] = decoded.split("|");
  return { originalState, organizationId, workspaceUrl };
}
```

## Security Considerations

1. **Cookie Security**
   - HttpOnly (prevents XSS)
   - Secure in production (HTTPS only)
   - SameSite: lax (CSRF protection)
   - Short expiration (10 minutes)

2. **State Parameter**
   - Contains Better Auth's encrypted state (CSRF protection)
   - Organization info encoded separately (non-sensitive routing data)
   - Validated in callback proxy

3. **PKCE**
   - Enabled for all OAuth flows
   - Protects against authorization code interception

4. **Organization Membership Validation**
   - HRD only shows organizations user is a member of
   - Session creation validates user belongs to selected organization

## User Experience Features

### Auto-Selection
If user belongs to only one organization, they're automatically redirected to login (skipping org selector).

### Organization Switcher
**File**: `src/components/org-switcher.tsx`

Allows users to switch between organizations without re-authenticating:

```typescript
// Update active organization in session
await authClient.organization.setActive({
  organizationId: org.id,
});

// Refresh the page to load new org context
router.refresh();
```

### Multi-Organization Support
- Users can belong to multiple organizations
- Each organization has its own workspace URL
- Session tracks `activeOrganizationId` to determine current context
- Users can switch organizations via dashboard UI

## Testing Checklist

- [ ] Redirect URI registered in Databricks OAuth app
- [ ] Organizations have `workspaceUrl` configured in database
- [ ] User email entered correctly on landing page
- [ ] HRD lookup returns correct organizations for user
- [ ] Organization selector shows all user's organizations
- [ ] Auto-select works when user has only one organization
- [ ] Cookie is set by `/api/oauth/set-org` endpoint
- [ ] Authorization proxy reads cookie and redirects to correct workspace
- [ ] User can authenticate with Databricks workspace
- [ ] Callback proxy decodes state correctly
- [ ] Token exchange succeeds with workspace OIDC endpoint
- [ ] Session is created with correct `activeOrganizationId`
- [ ] User is redirected to dashboard
- [ ] Organization switcher allows changing active org
- [ ] OAuth flow mapping is stored in database for session creation

## Troubleshooting

### Common Issues

1. **"No organizations found for this email"**
   - User doesn't exist in database yet
   - User exists but has no organization memberships
   - Check memberships in database

2. **"Organization hint cookie not found"**
   - Cookie was not set by `/api/oauth/set-org`
   - Cookie expired (10 minute TTL)
   - Cookie blocked by browser settings

3. **"Cannot determine workspace URL from redirect_uri"**
   - Verify callback proxy is appending `_workspace` param
   - Check token proxy is reading redirect_uri correctly

4. **"Invalid state parameter"**
   - State may be corrupted during encoding/decoding
   - Check base64url encoding is used (not base64)

5. **Token exchange fails**
   - Verify workspace URL is correct in database
   - Check PKCE code_verifier is passed correctly
   - Ensure redirect_uri matches what was sent to authorization endpoint

6. **Wrong organization set on session**
   - Check OAuth flow mapping is being stored correctly
   - Verify session hook is finding the correct recent flow
   - Ensure user is member of the organization they're trying to access

## API Endpoints

### HRD & Organization Lookup
- `POST /api/databricks/hrd/lookup` - Lookup organizations by email
- `GET /api/databricks/organizations/{id}` - Get organization details

### OAuth Flow Management
- `POST /api/oauth/set-org` - Set organization cookie before OAuth
- `GET /api/oauth/databricks/authorize` - Authorization proxy
- `GET /api/oauth/databricks/callback` - Callback proxy
- `POST /api/oauth/databricks/token` - Token exchange proxy

### Session Management
- Better Auth handles session creation/management
- Session includes `activeOrganizationId` field
- Use `authClient.organization.setActive()` to switch organizations

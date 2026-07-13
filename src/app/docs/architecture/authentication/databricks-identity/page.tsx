import { promises as fs } from "fs";
import path from "path";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import {
  Section,
  SectionContainer,
  ContentBlock,
  HighlightBox,
  CodeBlock,
  PageTitle,
} from "@/components/docs/section";

async function loadMermaidFile(filename: string): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "public/architecture/authentication/databricks-identity",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function DatabricksIdentityAuthPage() {
  // Load all mermaid diagrams
  const simplifiedOverview = await loadMermaidFile("00-simplified-overview.mermaid");
  const overviewFlow = await loadMermaidFile("01-overview-flow.mermaid");
  const databaseSchema = await loadMermaidFile("02-database-schema.mermaid");
  const accountOAuthFlow = await loadMermaidFile("03-account-oauth-flow.mermaid");
  const workspaceOAuthFlow = await loadMermaidFile("04-workspace-oauth-flow.mermaid");
  const tokenStorage = await loadMermaidFile("05-token-storage.mermaid");
  const sessionManagement = await loadMermaidFile("06-session-management.mermaid");
  const orgSwitching = await loadMermaidFile("07-organization-switching.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
            <div className="text-sm text-muted-foreground mb-2">
              Architecture / Authentication
            </div>
            <PageTitle>Databricks Identity Authentication</PageTitle>
            <p className="text-xl text-muted-foreground">
              A comprehensive guide to the Databricks Identity authentication
              architecture, covering OAuth flows, token management, session
              handling, and multi-organization support.
            </p>
          </header>

          {/* Overview Section */}
          <Section id="overview" title="Overview">
            <ContentBlock>
              <p className="mb-4">
                The Databricks Identity authentication system provides a flexible,
                secure way to authenticate users with Databricks workspaces and
                accounts. It supports two primary authentication modes:
              </p>
              <ul className="list-disc pl-6 mb-6 space-y-2">
                <li>
                  <strong>Account OAuth</strong>: For administrative access to
                  Databricks accounts, enabling workspace management and account-level
                  operations
                </li>
                <li>
                  <strong>Workspace OAuth</strong>: For per-workspace authentication,
                  providing direct access to specific Databricks workspaces
                </li>
              </ul>
              <p className="mb-6">
                The system is built on top of Better-Auth, a modern authentication
                framework, and uses Postgres for data persistence. All OAuth
                tokens are encrypted at rest using AES-256-GCM encryption, and
                sessions are managed with secure, HTTP-only cookies.
              </p>
            </ContentBlock>

            <HighlightBox variant="info" title="Key Features">
              <ul className="list-disc pl-5 space-y-1">
                <li>Dual OAuth flow support (Account and Workspace)</li>
                <li>Multi-organization/multi-tenant architecture</li>
                <li>Encrypted token storage with automatic refresh</li>
                <li>Seamless organization switching without re-authentication</li>
                <li>Session-based authentication with 30-day expiry</li>
                <li>Per-user, per-workspace OAuth token isolation</li>
              </ul>
            </HighlightBox>

            <Section id="high-level-architecture" title="High-Level Architecture">
              <ContentBlock>
                <p className="mb-4">
                  The following simplified diagram shows the high-level interaction
                  between the application, Databricks platform, and various Databricks
                  services. This provides a bird&apos;s eye view of how authentication
                  flows through the system.
                </p>
              </ContentBlock>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600 mb-4 italic">
                  Note: This is a simplified overview. Detailed sequence diagrams for
                  each flow are provided in subsequent sections.
                </p>
                <MermaidDiagram chart={simplifiedOverview} id="simplified-overview" />
              </div>
            </Section>

            <Section id="detailed-flow" title="Detailed Authentication Flow">
              <ContentBlock>
                <p className="mb-6">
                  The following diagram illustrates the complete authentication flow
                  from initial login through session management and organization
                  switching. Notice how both Account and Workspace OAuth flows converge
                  into a unified session management system.
                </p>
              </ContentBlock>
              <MermaidDiagram chart={overviewFlow} id="overview-flow" />
            </Section>
          </Section>

          {/* Database Schema Section */}
          <Section id="database-schema" title="Database Schema">
            <ContentBlock>
              <p className="mb-4">
                The authentication system uses Postgres with a carefully
                designed schema that supports multi-tenancy, multiple OAuth
                providers, and flexible workspace mapping. The schema is built with
                Drizzle ORM for type-safe database operations.
              </p>
            </ContentBlock>

            <Section id="database-erd" title="Entity Relationship Diagram">
              <MermaidDiagram chart={databaseSchema} id="database-schema-diagram" />
            </Section>

            <Section id="database-core-tables" title="Core Tables">
              <div className="space-y-6">
                <div className="border rounded-lg p-6 bg-gray-50">
                  <h4 className="text-lg font-semibold mb-2">USER Table</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Stores user profile information. A user can have multiple accounts
                    (one per Databricks account or workspace) and belong to multiple
                    organizations.
                  </p>
                  <ul className="text-sm space-y-1">
                    <li><code className="bg-white px-2 py-1 rounded">id</code>: Unique user identifier (UUID)</li>
                    <li><code className="bg-white px-2 py-1 rounded">email</code>: User email address (unique)</li>
                    <li><code className="bg-white px-2 py-1 rounded">name</code>: User display name</li>
                    <li><code className="bg-white px-2 py-1 rounded">emailVerified</code>: Email verification status</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-6 bg-gray-50">
                  <h4 className="text-lg font-semibold mb-2">ACCOUNT Table</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Links users to their Databricks accounts or workspaces. Each
                    account represents one OAuth connection to either a Databricks
                    account or a specific workspace.
                  </p>
                  <ul className="text-sm space-y-1">
                    <li><code className="bg-white px-2 py-1 rounded">provider</code>: Either &quot;databricks-account&quot; or &quot;databricks-workspace&quot;</li>
                    <li><code className="bg-white px-2 py-1 rounded">accountId</code>: Databricks account ID (for account OAuth)</li>
                    <li><code className="bg-white px-2 py-1 rounded">workspaceId</code>: Databricks workspace ID (for workspace OAuth)</li>
                    <li><code className="bg-white px-2 py-1 rounded">workspaceUrl</code>: Workspace URL (for workspace OAuth)</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-6 bg-gray-50">
                  <h4 className="text-lg font-semibold mb-2">OAUTH_TOKEN Table</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Stores encrypted OAuth tokens for each account. Tokens are
                    encrypted using AES-256-GCM with a unique initialization vector
                    (IV) per token. The encryption key is stored in environment
                    variables.
                  </p>
                  <ul className="text-sm space-y-1">
                    <li><code className="bg-white px-2 py-1 rounded">accessToken</code>: Encrypted access token</li>
                    <li><code className="bg-white px-2 py-1 rounded">refreshToken</code>: Encrypted refresh token</li>
                    <li><code className="bg-white px-2 py-1 rounded">expiresAt</code>: Token expiration timestamp</li>
                    <li><code className="bg-white px-2 py-1 rounded">scope</code>: OAuth scopes granted</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-6 bg-gray-50">
                  <h4 className="text-lg font-semibold mb-2">SESSION Table</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Manages user sessions. Each session is associated with a user and
                    optionally tracks the active organization. Sessions are valid for
                    30 days by default and include security metadata.
                  </p>
                  <ul className="text-sm space-y-1">
                    <li><code className="bg-white px-2 py-1 rounded">token</code>: Random session token (stored in cookie)</li>
                    <li><code className="bg-white px-2 py-1 rounded">activeOrganizationId</code>: Currently selected organization</li>
                    <li><code className="bg-white px-2 py-1 rounded">ipAddress</code>: Client IP for security auditing</li>
                    <li><code className="bg-white px-2 py-1 rounded">userAgent</code>: Client user agent for device tracking</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-6 bg-gray-50">
                  <h4 className="text-lg font-semibold mb-2">ORGANIZATION & WORKSPACE Tables</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Support multi-tenancy by organizing users into organizations,
                    with each organization containing one or more Databricks
                    workspaces. Users can be members of multiple organizations with
                    different roles.
                  </p>
                  <ul className="text-sm space-y-1">
                    <li><code className="bg-white px-2 py-1 rounded">ORGANIZATION</code>: Logical grouping of users and workspaces</li>
                    <li><code className="bg-white px-2 py-1 rounded">ORGANIZATION_MEMBER</code>: Junction table with role-based access</li>
                    <li><code className="bg-white px-2 py-1 rounded">WORKSPACE</code>: Maps Databricks workspaces to organizations</li>
                  </ul>
                </div>
              </div>
            </Section>
          </Section>

          {/* Account OAuth Flow Section */}
          <Section id="account-oauth" title="Account OAuth Flow">
            <ContentBlock>
              <p className="mb-4">
                The Account OAuth flow is designed for users who need administrative
                access to Databricks accounts. This flow enables account-level
                operations such as workspace management, user provisioning, and
                account configuration.
              </p>
            </ContentBlock>

            <HighlightBox variant="warning" title="When to Use Account OAuth">
              <ul className="list-disc pl-5 space-y-1">
                <li>Managing multiple workspaces across an account</li>
                <li>Provisioning users and service principals</li>
                <li>Configuring account-level settings and policies</li>
                <li>Accessing account console features</li>
              </ul>
            </HighlightBox>

            <Section id="account-oauth-sequence" title="OAuth Flow Sequence">
              <ContentBlock>
                <p className="mb-6">
                  The Account OAuth flow follows the OAuth 2.0 authorization code flow
                  with PKCE (Proof Key for Code Exchange) for enhanced security. The
                  flow involves redirecting users to Databricks for authentication,
                  exchanging the authorization code for tokens, and securely storing
                  the encrypted tokens in the database.
                </p>
              </ContentBlock>
              <MermaidDiagram chart={accountOAuthFlow} id="account-oauth-flow-diagram" />
            </Section>

            <Section id="account-oauth-steps" title="Key Steps Explained">
              <div className="space-y-4">
                <div className="pl-4 border-l-2 border-gray-300">
                  <h4 className="font-semibold mb-2">1. OAuth Initiation</h4>
                  <p className="text-sm text-muted-foreground">
                    Better-Auth generates a random state parameter and PKCE code
                    verifier. The state is stored in a secure, HTTP-only cookie to
                    prevent CSRF attacks. The code challenge (SHA-256 hash of the
                    verifier) is sent to Databricks.
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-gray-300">
                  <h4 className="font-semibold mb-2">2. User Authentication</h4>
                  <p className="text-sm text-muted-foreground">
                    The user is redirected to Databricks Account Console for
                    authentication. After successful login, Databricks redirects back
                    with an authorization code.
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-gray-300">
                  <h4 className="font-semibold mb-2">3. Token Exchange</h4>
                  <p className="text-sm text-muted-foreground">
                    Better-Auth verifies the state parameter matches, then exchanges
                    the authorization code for access and refresh tokens using the
                    PKCE code verifier. This prevents authorization code interception
                    attacks.
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-gray-300">
                  <h4 className="font-semibold mb-2">4. User Profile Fetching</h4>
                  <p className="text-sm text-muted-foreground">
                    Using the access token, the application fetches the user&apos;s
                    profile from Databricks, including email, name, and account ID.
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-gray-300">
                  <h4 className="font-semibold mb-2">5. Database Operations</h4>
                  <p className="text-sm text-muted-foreground">
                    The user record is upserted (created or updated) in the USER
                    table. An ACCOUNT record is created with provider set to
                    &quot;databricks-account&quot;. Tokens are encrypted using AES-256-GCM and
                    stored in OAUTH_TOKEN table.
                  </p>
                </div>

                <div className="pl-4 border-l-2 border-gray-300">
                  <h4 className="font-semibold mb-2">6. Session Creation</h4>
                  <p className="text-sm text-muted-foreground">
                    A new SESSION record is created with a random 32-byte token, 30-day
                    expiration, and security metadata (IP address and user agent). The
                    session token is set as an HTTP-only, Secure, SameSite=Lax cookie.
                  </p>
                </div>
              </div>

              <HighlightBox variant="success" title="Security Features" className="mt-6">
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>PKCE prevents authorization code interception</li>
                  <li>State parameter prevents CSRF attacks</li>
                  <li>Tokens encrypted at rest with AES-256-GCM</li>
                  <li>HTTP-only cookies prevent XSS token theft</li>
                  <li>Secure flag ensures HTTPS-only transmission</li>
                  <li>IP and user agent tracking for anomaly detection</li>
                </ul>
              </HighlightBox>
            </Section>
          </Section>

          {/* Workspace OAuth Flow Section */}
          <Section id="workspace-oauth" title="Workspace OAuth Flow">
            <ContentBlock>
              <p className="mb-4">
                The Workspace OAuth flow enables users to authenticate directly with
                specific Databricks workspaces. This is the recommended approach for
                most users who need to access workspace features like notebooks, SQL
                queries, and data catalogs.
              </p>
            </ContentBlock>

            <HighlightBox variant="note" title="When to Use Workspace OAuth">
              <ul className="list-disc pl-5 space-y-1">
                <li>Accessing notebooks and collaborative features</li>
                <li>Running SQL queries and data analysis</li>
                <li>Exploring Unity Catalog and data assets</li>
                <li>Per-workspace scoped permissions</li>
              </ul>
            </HighlightBox>

            <Section id="workspace-oauth-sequence" title="OAuth Flow Sequence">
              <ContentBlock>
                <p className="mb-6">
                  Similar to Account OAuth, the Workspace OAuth flow uses OAuth 2.0
                  with PKCE. However, it authenticates against a specific workspace&apos;s
                  OAuth endpoint and stores workspace-scoped tokens.
                </p>
              </ContentBlock>
              <MermaidDiagram chart={workspaceOAuthFlow} id="workspace-oauth-flow-diagram" />
            </Section>

            <Section id="workspace-selection" title="Workspace Selection">
              <ContentBlock>
                <p className="mb-4">
                  Before initiating the OAuth flow, users must specify which workspace
                  they want to authenticate with. This is done through a workspace
                  selector that accepts the workspace URL (e.g.,
                  https://company.cloud.databricks.com).
                </p>
              </ContentBlock>
            </Section>

            <Section id="workspace-org-mapping" title="Organization Mapping">
              <ContentBlock>
                <p className="mb-4">
                  During workspace authentication, the system automatically maps the
                  workspace to an organization. This enables:
                </p>
                <ul className="list-disc pl-6 mb-6 space-y-2">
                  <li>
                    <strong>Multi-workspace organizations</strong>: A single
                    organization can contain multiple workspaces (e.g., dev, staging,
                    prod)
                  </li>
                  <li>
                    <strong>User workspace access</strong>: Users see only workspaces
                    they&apos;ve authenticated with
                  </li>
                  <li>
                    <strong>Organization-level switching</strong>: Switch between
                    organizations without re-authenticating to individual workspaces
                  </li>
                </ul>
              </ContentBlock>
            </Section>

            <Section id="workspace-token-scoping" title="Token Scoping">
              <ContentBlock>
                <p className="mb-4">
                  Unlike Account OAuth tokens which provide broad account-level access,
                  Workspace OAuth tokens are scoped to the specific workspace. This
                  provides:
                </p>
                <ul className="list-disc pl-6 mb-6 space-y-2">
                  <li>Enhanced security through principle of least privilege</li>
                  <li>Workspace-level permission enforcement</li>
                  <li>Isolated token compromise (breach of one token doesn&apos;t affect others)</li>
                  <li>Per-workspace token refresh and lifecycle management</li>
                </ul>
              </ContentBlock>

              <HighlightBox variant="info" title="ID Token Claims">
                <p className="text-sm mb-2">
                  Workspace OAuth returns an ID token (JWT) with claims that are
                  decoded and stored:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><code className="bg-white px-2 py-1 rounded">sub</code>: User ID within the workspace</li>
                  <li><code className="bg-white px-2 py-1 rounded">email</code>: User email address</li>
                  <li><code className="bg-white px-2 py-1 rounded">name</code>: User display name</li>
                  <li><code className="bg-white px-2 py-1 rounded">workspace_id</code>: Unique workspace identifier</li>
                </ul>
              </HighlightBox>
            </Section>
          </Section>

          {/* Token Storage Section */}
          <Section id="token-storage" title="Token Storage & Security">
            <ContentBlock>
              <p className="mb-4">
                Token storage is a critical security component. Our architecture
                ensures that OAuth tokens are never exposed to the client and are
                encrypted at rest in the database.
              </p>
            </ContentBlock>

            <Section id="token-storage-architecture" title="Storage Architecture">
              <MermaidDiagram chart={tokenStorage} id="token-storage-diagram" />
            </Section>

            <Section id="token-encryption" title="Encryption Strategy">
              <ContentBlock>
                <p className="mb-4">
                  All OAuth tokens (both access and refresh tokens) are encrypted
                  before storage using AES-256-GCM (Galois/Counter Mode), which
                  provides both confidentiality and authenticity.
                </p>
              </ContentBlock>

              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">Encryption Algorithm: AES-256-GCM</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li><strong>Key Size</strong>: 256 bits (32 bytes)</li>
                    <li><strong>Mode</strong>: Galois/Counter Mode (GCM)</li>
                    <li><strong>IV</strong>: Unique 12-byte initialization vector per token</li>
                    <li><strong>Auth Tag</strong>: 16-byte authentication tag for integrity</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">Key Management</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li><strong>Storage</strong>: Encryption key stored in environment variable</li>
                    <li><strong>Rotation</strong>: Support for key rotation without downtime</li>
                    <li><strong>Access</strong>: Only Better-Auth layer has access to encryption key</li>
                    <li><strong>Never Logged</strong>: Plain-text tokens never appear in logs</li>
                  </ul>
                </div>
              </div>
            </Section>

            <Section id="token-cookie-security" title="Session Cookie Security">
              <ContentBlock>
                <p className="mb-4">
                  The session token (which identifies the user&apos;s session) is stored in
                  a secure cookie with multiple security attributes:
                </p>
              </ContentBlock>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">HttpOnly</div>
                  <p className="text-sm text-muted-foreground">
                    Prevents JavaScript access to the cookie, protecting against XSS attacks
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">Secure</div>
                  <p className="text-sm text-muted-foreground">
                    Cookie only sent over HTTPS connections, preventing man-in-the-middle attacks
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">SameSite=Lax</div>
                  <p className="text-sm text-muted-foreground">
                    Protects against CSRF attacks while allowing top-level navigation
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">Max-Age=30d</div>
                  <p className="text-sm text-muted-foreground">
                    30-day expiration balances security with user convenience
                  </p>
                </div>
              </div>
            </Section>

            <Section id="token-lifecycle" title="Token Lifecycle">
              <ContentBlock>
                <p className="mb-4">
                  OAuth access tokens typically have a short lifetime (1-2 hours). Our
                  system automatically handles token refresh:
                </p>
                <ol className="list-decimal pl-6 space-y-2">
                  <li>Application detects expired access token before API call</li>
                  <li>Retrieves encrypted refresh token from database</li>
                  <li>Decrypts refresh token using encryption service</li>
                  <li>Exchanges refresh token for new access token with Databricks</li>
                  <li>Encrypts and stores new tokens in database</li>
                  <li>Updates expiration timestamp</li>
                  <li>Proceeds with original API call using new token</li>
                </ol>
              </ContentBlock>

              <HighlightBox variant="danger" title="Token Security Best Practices" className="mt-6">
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Never log plain-text tokens</li>
                  <li>Never send tokens to client-side JavaScript</li>
                  <li>Always use server-side token handling</li>
                  <li>Rotate encryption keys periodically</li>
                  <li>Monitor for unusual token usage patterns</li>
                  <li>Implement token revocation on logout</li>
                </ul>
              </HighlightBox>
            </Section>
          </Section>

          {/* Session Management Section */}
          <Section id="session-management" title="Session Management">
            <ContentBlock>
              <p className="mb-4">
                Session management is the backbone of user authentication. Every API
                request must include a valid session cookie, which is verified
                against the database to ensure the user is authenticated and has
                permission to perform the requested action.
              </p>
            </ContentBlock>

            <Section id="session-verification-flow" title="Session Verification Flow">
              <MermaidDiagram chart={sessionManagement} id="session-management-diagram" />
            </Section>

            <Section id="session-validation-steps" title="Session Validation Steps">
              <ContentBlock>
                <p className="mb-4">
                  Every authenticated request goes through a multi-step validation
                  process to ensure security and proper access control:
                </p>
              </ContentBlock>

              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <h4 className="font-semibold mb-1">1. Cookie Extraction</h4>
                  <p className="text-sm text-muted-foreground">
                    Extract the <code className="bg-gray-100 px-1 rounded">better-auth.session_token</code> cookie
                    from the request. If missing, immediately return 401 Unauthorized.
                  </p>
                </div>

                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <h4 className="font-semibold mb-1">2. Session Lookup</h4>
                  <p className="text-sm text-muted-foreground">
                    Query the SESSION table using the token. The query includes joins
                    to fetch related user data in a single database round-trip.
                  </p>
                </div>

                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <h4 className="font-semibold mb-1">3. Expiration Check</h4>
                  <p className="text-sm text-muted-foreground">
                    Compare the session&apos;s <code className="bg-gray-100 px-1 rounded">expiresAt</code> timestamp
                    with the current time. Expired sessions are deleted and the request
                    is rejected.
                  </p>
                </div>

                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <h4 className="font-semibold mb-1">4. Organization Validation</h4>
                  <p className="text-sm text-muted-foreground">
                    If the session has an <code className="bg-gray-100 px-1 rounded">activeOrganizationId</code>,
                    verify that the user is still a member of that organization. If not,
                    clear the active org and require selection.
                  </p>
                </div>

                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <h4 className="font-semibold mb-1">5. Context Building</h4>
                  <p className="text-sm text-muted-foreground">
                    Build a complete session context object containing user details,
                    organization membership, role, and available workspaces.
                  </p>
                </div>

                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <h4 className="font-semibold mb-1">6. Token Retrieval (if needed)</h4>
                  <p className="text-sm text-muted-foreground">
                    If the request requires making API calls to Databricks, retrieve
                    the appropriate OAuth token (Account or Workspace) based on the
                    active organization context.
                  </p>
                </div>
              </div>
            </Section>

            <Section id="session-context-object" title="Session Context Object">
              <ContentBlock>
                <p className="mb-4">
                  After successful validation, a session context object is created and
                  passed to the request handler. This object contains all necessary
                  information for authorization decisions:
                </p>
              </ContentBlock>

              <CodeBlock>
{`interface SessionContext {
  userId: string;
  email: string;
  name: string;
  organizationId: string | null;
  organizationSlug: string | null;
  organizationRole: "admin" | "member" | "viewer" | null;
  availableWorkspaces: Array<{
    workspaceId: string;
    workspaceUrl: string;
    workspaceName: string;
  }>;
  sessionMetadata: {
    createdAt: Date;
    expiresAt: Date;
    ipAddress: string;
    userAgent: string;
  };
}`}
              </CodeBlock>
            </Section>

            <Section id="session-token-refresh" title="Automatic Token Refresh">
              <ContentBlock>
                <p className="mb-4">
                  When a request needs to use an OAuth token to call Databricks APIs,
                  the session management system automatically checks token expiration
                  and refreshes if necessary:
                </p>
                <ol className="list-decimal pl-6 space-y-3">
                  <li>
                    <strong>Token Validation</strong>: Check if the stored access token
                    has expired by comparing <code className="bg-gray-100 px-1 rounded">expiresAt</code> with
                    current time
                  </li>
                  <li>
                    <strong>Refresh Decision</strong>: If expired, retrieve and decrypt
                    the refresh token
                  </li>
                  <li>
                    <strong>Token Exchange</strong>: Call Databricks token endpoint
                    with the refresh token to get new access and refresh tokens
                  </li>
                  <li>
                    <strong>Token Update</strong>: Encrypt and store the new tokens,
                    update expiration timestamp
                  </li>
                  <li>
                    <strong>Proceed</strong>: Use the fresh access token for the
                    original API call
                  </li>
                </ol>
              </ContentBlock>

              <HighlightBox variant="warning" title="Session Expiration vs Token Expiration" className="mt-6">
                <p className="text-sm mb-2">
                  It&apos;s important to distinguish between these two concepts:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>
                    <strong>Session Expiration</strong>: 30 days, determines if user
                    is logged in
                  </li>
                  <li>
                    <strong>Token Expiration</strong>: ~1-2 hours, determines if
                    OAuth tokens need refresh
                  </li>
                  <li>
                    A valid session can have expired tokens (which are automatically
                    refreshed)
                  </li>
                  <li>
                    An expired session requires the user to re-authenticate, even if
                    tokens are valid
                  </li>
                </ul>
              </HighlightBox>
            </Section>

            <Section id="session-activity-tracking" title="Activity Tracking">
              <ContentBlock>
                <p className="mb-4">
                  After successful request processing, the session&apos;s last activity
                  timestamp is updated. This enables:
                </p>
                <ul className="list-disc pl-6 mb-6 space-y-2">
                  <li>Session activity monitoring and anomaly detection</li>
                  <li>Automatic cleanup of inactive sessions</li>
                  <li>User activity analytics</li>
                  <li>Security auditing and compliance reporting</li>
                </ul>
              </ContentBlock>
            </Section>
          </Section>

          {/* Organization Switching Section */}
          <Section id="organization-switching" title="Organization Switching">
            <ContentBlock>
              <p className="mb-4">
                One of the most powerful features of the authentication system is
                seamless organization switching. Users who are members of multiple
                organizations can switch between them without re-authenticating,
                making it easy to work across different teams or projects.
              </p>
            </ContentBlock>

            <Section id="org-switching-flow" title="Organization Switching Flow">
              <MermaidDiagram chart={orgSwitching} id="organization-switching-diagram" />
            </Section>

            <Section id="org-switching-how" title="How Organization Switching Works">
              <ContentBlock>
                <p className="mb-4">
                  Organization switching is implemented as a simple session update that
                  changes the <code className="bg-gray-100 px-1 rounded">activeOrganizationId</code> field.
                  This design provides several benefits:
                </p>
              </ContentBlock>

              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">✓</div>
                  <div>
                    <h4 className="font-semibold">No Re-authentication Required</h4>
                    <p className="text-sm text-muted-foreground">
                      Users stay logged in and simply change context
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">✓</div>
                  <div>
                    <h4 className="font-semibold">Instant Context Switch</h4>
                    <p className="text-sm text-muted-foreground">
                      Single database UPDATE operation, sub-50ms latency
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">✓</div>
                  <div>
                    <h4 className="font-semibold">Automatic Token Selection</h4>
                    <p className="text-sm text-muted-foreground">
                      Subsequent API calls automatically use the correct workspace tokens
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">✓</div>
                  <div>
                    <h4 className="font-semibold">Cache Invalidation</h4>
                    <p className="text-sm text-muted-foreground">
                      Next.js cache is automatically invalidated to fetch fresh org-specific data
                    </p>
                  </div>
                </div>
              </div>
            </Section>

            <Section id="org-switcher-ui" title="Organization Switcher UI">
              <ContentBlock>
                <p className="mb-4">
                  The organization switcher is typically placed in the application
                  header or navigation bar. It displays:
                </p>
                <ul className="list-disc pl-6 mb-6 space-y-2">
                  <li>Current active organization (highlighted)</li>
                  <li>List of all organizations the user is a member of</li>
                  <li>User&apos;s role in each organization (admin, member, viewer)</li>
                  <li>Number of workspaces in each organization</li>
                </ul>
              </ContentBlock>
            </Section>

            <Section id="org-state-management" title="Client-Side State Management">
              <ContentBlock>
                <p className="mb-4">
                  Organization switching triggers coordinated updates across multiple
                  layers:
                </p>
              </ContentBlock>

              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">1. Server-Side Session Update</h4>
                  <p className="text-sm text-muted-foreground">
                    The API endpoint updates the session&apos;s{" "}
                    <code className="bg-white px-1 rounded">activeOrganizationId</code> in
                    the database
                  </p>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">2. Next.js Cache Invalidation</h4>
                  <p className="text-sm text-muted-foreground">
                    Server-side cache tags are revalidated using{" "}
                    <code className="bg-white px-1 rounded">revalidateTag()</code>, ensuring
                    subsequent requests fetch fresh data
                  </p>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">3. TanStack Query Cache Update</h4>
                  <p className="text-sm text-muted-foreground">
                    Client-side React Query cache is invalidated for organization-specific
                    queries, triggering automatic refetch
                  </p>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">4. React State Update</h4>
                  <p className="text-sm text-muted-foreground">
                    Local component state is updated to reflect the new active organization
                  </p>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">5. Data Refresh</h4>
                  <p className="text-sm text-muted-foreground">
                    The UI automatically fetches and displays data for the new organization
                  </p>
                </div>
              </div>
            </Section>

            <Section id="org-permission-verification" title="Permission Verification">
              <ContentBlock>
                <p className="mb-4">
                  Before allowing an organization switch, the system verifies that the
                  user is actually a member of the target organization by checking the
                  ORGANIZATION_MEMBER table. This prevents unauthorized access through
                  direct API calls.
                </p>
              </ContentBlock>

              <HighlightBox variant="success" title="Optimistic UI Updates">
                <p className="text-sm mb-2">
                  For the best user experience, the UI can implement optimistic updates:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Immediately update UI to show the new organization</li>
                  <li>Start loading state for new organization data</li>
                  <li>If the switch fails, revert to previous organization with error message</li>
                  <li>This provides instant feedback while the API call processes</li>
                </ul>
              </HighlightBox>
            </Section>

            <Section id="org-multi-workspace" title="Multi-Workspace Support">
              <ContentBlock>
                <p className="mb-4">
                  When a user switches to an organization that contains multiple
                  workspaces, the system:
                </p>
                <ol className="list-decimal pl-6 space-y-2">
                  <li>
                    Fetches all workspace accounts linked to the organization from the
                    WORKSPACE table
                  </li>
                  <li>
                    For each workspace, checks if the user has authenticated (has an
                    ACCOUNT record)
                  </li>
                  <li>
                    Displays only workspaces the user has access to in the workspace
                    selector
                  </li>
                  <li>
                    When the user makes API calls, automatically routes to the appropriate
                    workspace based on context
                  </li>
                </ol>
              </ContentBlock>
            </Section>
          </Section>

          {/* Better Auth Integration Section */}
          <Section id="better-auth-integration" title="Better-Auth Integration">
            <ContentBlock>
              <p className="mb-4">
                Better-Auth is the authentication framework that powers the entire
                system. It provides a robust, type-safe abstraction over OAuth flows,
                session management, and token handling.
              </p>
            </ContentBlock>

            <Section id="better-auth-provides" title="What Better-Auth Provides">
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">OAuth Management</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• PKCE flow implementation</li>
                    <li>• State parameter generation and verification</li>
                    <li>• Token exchange handling</li>
                    <li>• Provider configuration</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">Session Management</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Session creation and validation</li>
                    <li>• Cookie configuration and security</li>
                    <li>• Session expiration handling</li>
                    <li>• Multi-session support</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">Database Integration</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Drizzle ORM integration</li>
                    <li>• User and account management</li>
                    <li>• Type-safe database operations</li>
                    <li>• Migration support</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">Security Features</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• CSRF protection</li>
                    <li>• XSS prevention</li>
                    <li>• Token encryption</li>
                    <li>• Secure cookie handling</li>
                  </ul>
                </div>
              </div>
            </Section>

            <Section id="better-auth-oauth-providers" title="Custom OAuth Providers">
              <ContentBlock>
                <p className="mb-4">
                  Better-Auth is extended with custom OAuth providers for both
                  Databricks Account and Databricks Workspace authentication. Each
                  provider is configured with:
                </p>
              </ContentBlock>

              <div className="space-y-4">
                <div className="border-l-4 border-indigo-500 pl-4 py-2">
                  <h4 className="font-semibold mb-1">Authorization Endpoint</h4>
                  <p className="text-sm text-muted-foreground mb-1">
                    URL where users are redirected for authentication
                  </p>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    Account: https://accounts.cloud.databricks.com/oidc/v1/authorize
                  </code>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block mt-1">
                    Workspace: {"{workspace_url}"}/oidc/v1/authorize
                  </code>
                </div>

                <div className="border-l-4 border-indigo-500 pl-4 py-2">
                  <h4 className="font-semibold mb-1">Token Endpoint</h4>
                  <p className="text-sm text-muted-foreground mb-1">
                    URL for exchanging authorization codes for tokens
                  </p>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    Account: https://accounts.cloud.databricks.com/oidc/v1/token
                  </code>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block mt-1">
                    Workspace: {"{workspace_url}"}/oidc/v1/token
                  </code>
                </div>

                <div className="border-l-4 border-indigo-500 pl-4 py-2">
                  <h4 className="font-semibold mb-1">User Info Endpoint</h4>
                  <p className="text-sm text-muted-foreground mb-1">
                    URL for fetching authenticated user profile
                  </p>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    Account: https://accounts.cloud.databricks.com/oidc/v1/userinfo
                  </code>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block mt-1">
                    Workspace: {"{workspace_url}"}/oidc/v1/userinfo
                  </code>
                </div>
              </div>
            </Section>

            <Section id="better-auth-hooks" title="Session Hooks and Middleware">
              <ContentBlock>
                <p className="mb-4">
                  Better-Auth provides hooks and middleware that allow custom logic to
                  be injected at various points in the authentication flow:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>onSignIn</strong>: Hook called after successful OAuth
                    authentication, used to create organization memberships
                  </li>
                  <li>
                    <strong>onSessionVerify</strong>: Hook called on every session
                    validation, used to attach organization context
                  </li>
                  <li>
                    <strong>onTokenRefresh</strong>: Hook called when OAuth tokens are
                    refreshed, used for logging and monitoring
                  </li>
                  <li>
                    <strong>onSessionDelete</strong>: Hook called on logout, used to
                    clean up resources and log activity
                  </li>
                </ul>
              </ContentBlock>
            </Section>
          </Section>

          {/* Postgres Database Section */}
          <Section id="postgres-database" title="Postgres Database">
            <ContentBlock>
              <p className="mb-4">
                Postgres provides the database that stores all authentication data.
                The system uses a serverless Postgres deployment that offers several
                advantages for this use case:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-emerald-50">
                <h4 className="font-semibold mb-2 text-green-900">Serverless Architecture</h4>
                <p className="text-sm text-green-800">
                  Automatic scaling from zero to handle any load, with instant
                  compute provisioning and pay-per-use pricing
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-cyan-50">
                <h4 className="font-semibold mb-2 text-blue-900">Branching</h4>
                <p className="text-sm text-blue-800">
                  Database branching for development and testing, enabling instant
                  copies of production data without storage costs
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-violet-50">
                <h4 className="font-semibold mb-2 text-purple-900">Connection Pooling</h4>
                <p className="text-sm text-purple-800">
                  Built-in connection pooling optimized for serverless functions,
                  eliminating cold start connection overhead
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-amber-50">
                <h4 className="font-semibold mb-2 text-orange-900">High Availability</h4>
                <p className="text-sm text-orange-800">
                  Automatic backups, point-in-time recovery, and 99.95% uptime SLA
                  for production workloads
                </p>
              </div>
            </div>

            <Section id="postgres-drizzle-orm" title="Drizzle ORM Integration">
              <ContentBlock>
                <p className="mb-4">
                  Drizzle ORM provides type-safe database access with excellent
                  TypeScript integration. All database operations are:
                </p>
                <ul className="list-disc pl-6 mb-6 space-y-2">
                  <li>Type-checked at compile time</li>
                  <li>Automatically validated against the schema</li>
                  <li>Optimized with query batching and caching</li>
                  <li>Easier to refactor with IDE support</li>
                </ul>
              </ContentBlock>
            </Section>

            <Section id="postgres-indexes" title="Database Indexes">
              <ContentBlock>
                <p className="mb-4">
                  The schema includes carefully designed indexes to ensure fast query
                  performance:
                </p>
              </ContentBlock>

              <div className="space-y-3">
                <div className="font-mono text-sm bg-gray-50 p-3 rounded border">
                  <div className="text-gray-600">SESSION.token (unique)</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Fast session lookup by cookie token
                  </div>
                </div>

                <div className="font-mono text-sm bg-gray-50 p-3 rounded border">
                  <div className="text-gray-600">USER.email (unique)</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Quick user lookup by email address
                  </div>
                </div>

                <div className="font-mono text-sm bg-gray-50 p-3 rounded border">
                  <div className="text-gray-600">
                    ACCOUNT.(userId, provider, workspaceId)
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Fast workspace account lookup
                  </div>
                </div>

                <div className="font-mono text-sm bg-gray-50 p-3 rounded border">
                  <div className="text-gray-600">ORGANIZATION_MEMBER.(userId, organizationId)</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Efficient organization membership checks
                  </div>
                </div>

                <div className="font-mono text-sm bg-gray-50 p-3 rounded border">
                  <div className="text-gray-600">WORKSPACE.organizationId</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Quick workspace listing per organization
                  </div>
                </div>
              </div>
            </Section>

            <Section id="postgres-connections" title="Connection Management">
              <ContentBlock>
                <p className="mb-4">
                  Next.js API routes are serverless functions that can scale to zero.
                  Connection pooling is essential for:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Reusing database connections across function invocations</li>
                  <li>Avoiding connection limit exhaustion</li>
                  <li>Reducing latency from connection establishment</li>
                  <li>Supporting high concurrency without over-provisioning</li>
                </ul>
              </ContentBlock>
            </Section>
          </Section>

          {/* Security Considerations Section */}
          <Section id="security-considerations" title="Security Considerations">
            <ContentBlock>
              <p className="mb-4">
                Security is paramount in an authentication system. Here are the key
                security measures implemented throughout the architecture:
              </p>
            </ContentBlock>

            <div className="space-y-6">
              <HighlightBox variant="danger" title="OAuth PKCE">
                <p className="text-sm">
                  All OAuth flows use PKCE (Proof Key for Code Exchange) to prevent
                  authorization code interception attacks. The code verifier is
                  never sent to the client, only the challenge.
                </p>
              </HighlightBox>

              <HighlightBox variant="warning" title="CSRF Protection">
                <p className="text-sm">
                  State parameters in OAuth flows prevent cross-site request
                  forgery. State is stored in secure cookies and verified on
                  callback.
                </p>
              </HighlightBox>

              <HighlightBox variant="warning" title="Token Encryption at Rest">
                <p className="text-sm">
                  All OAuth tokens are encrypted using AES-256-GCM before storage.
                  Even if the database is compromised, tokens remain secure.
                </p>
              </HighlightBox>

              <HighlightBox variant="success" title="HTTP-Only Cookies">
                <p className="text-sm">
                  Session tokens are stored in HTTP-only cookies, preventing
                  JavaScript access and XSS-based token theft.
                </p>
              </HighlightBox>

              <HighlightBox variant="info" title="Server-Side Token Handling">
                <p className="text-sm">
                  OAuth tokens never reach the client. All Databricks API calls are
                  proxied through Next.js API routes.
                </p>
              </HighlightBox>

              <HighlightBox variant="info" title="Automatic Token Refresh">
                <p className="text-sm">
                  Expired tokens are automatically refreshed server-side. Users
                  never need to manually handle token expiration.
                </p>
              </HighlightBox>
            </div>

            <Section id="security-best-practices" title="Security Best Practices">
              <ul className="list-disc pl-6 space-y-2 mb-6">
                <li>Always use HTTPS in production</li>
                <li>Rotate encryption keys periodically</li>
                <li>Implement rate limiting on authentication endpoints</li>
                <li>Monitor for unusual authentication patterns</li>
                <li>Keep dependencies updated to patch vulnerabilities</li>
                <li>Use environment variables for all secrets</li>
                <li>Enable database query logging for security audits</li>
                <li>Implement IP allowlisting for admin operations</li>
              </ul>
            </Section>
          </Section>

          {/* Conclusion Section */}
          <Section id="conclusion" title="Conclusion">
            <ContentBlock>
              <p className="mb-4">
                The Databricks Identity authentication architecture provides a robust,
                secure, and flexible foundation for building applications on top of
                Databricks. By combining Better-Auth&apos;s authentication framework with
                serverless Postgres, we achieve:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h3 className="font-semibold mb-2 text-blue-900">Security</h3>
                <p className="text-sm text-blue-800">
                  Military-grade encryption, OAuth best practices, and comprehensive
                  security measures at every layer
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h3 className="font-semibold mb-2 text-green-900">Flexibility</h3>
                <p className="text-sm text-green-800">
                  Support for both Account and Workspace OAuth, multi-organization
                  architecture, and seamless switching
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
                <h3 className="font-semibold mb-2 text-purple-900">Scalability</h3>
                <p className="text-sm text-purple-800">
                  Serverless architecture that scales from zero to millions of users
                  without infrastructure management
                </p>
              </div>
            </div>

            <ContentBlock>
              <p className="mb-4">
                The architecture is production-ready and battle-tested, powering
                applications that serve thousands of users across multiple
                organizations and workspaces. The separation of concerns, type-safe
                operations, and comprehensive error handling make it maintainable and
                reliable.
              </p>
            </ContentBlock>

            <div className="bg-gradient-to-r from-orange-500 to-yellow-500 p-6 rounded-lg text-white mt-8">
              <h3 className="font-bold text-2xl mb-2">Ready to Build?</h3>
              <p className="mb-4">
                This authentication architecture is the foundation of FireFly
                Analytics. Explore our solutions to see it in action.
              </p>
              <a
                href="/docs/solutions"
                className="inline-block bg-white text-orange-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Explore Solutions
              </a>
            </div>
          </Section>
      </SectionContainer>
    </div>
  );
}

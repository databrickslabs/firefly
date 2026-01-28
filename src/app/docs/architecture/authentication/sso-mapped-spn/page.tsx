import { promises as fs } from "fs";
import path from "path";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import {
  Section,
  SectionContainer,
  ContentBlock,
  HighlightBox,
  CodeBlock,
} from "@/components/docs/section";

async function loadMermaidFile(filename: string): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "public/architecture/authentication/sso-mapped-spn",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function SsoMappedSpnDocsPage() {
  // Load all mermaid diagrams
  const architectureOverview = await loadMermaidFile("01-architecture-overview.mermaid");
  const identityModel = await loadMermaidFile("02-identity-model.mermaid");
  const authenticationFlow = await loadMermaidFile("03-authentication-flow.mermaid");
  const spnTokenExchange = await loadMermaidFile("04-spn-token-exchange.mermaid");
  const orgVsUserSpn = await loadMermaidFile("05-org-vs-user-spn.mermaid");
  const securityModel = await loadMermaidFile("06-security-model.mermaid");
  const databricksSpnSetup = await loadMermaidFile("07-databricks-spn-setup.mermaid");
  const comparisonMatrix = await loadMermaidFile("08-comparison-matrix.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Architecture / Authentication
          </div>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
            SSO-Mapped Service Principal Authentication
          </h1>
          <p className="text-xl text-muted-foreground">
            A comprehensive guide to the SSO-Mapped SPN authentication pattern,
            where users authenticate via SSO (Okta/OIDC) while Databricks API
            calls are made using Service Principal credentials. This pattern
            enables multi-tenant applications without requiring users to have
            Databricks accounts.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              The SSO-Mapped SPN authentication pattern decouples user identity
              from Databricks API access. Users authenticate through your
              organization&apos;s Single Sign-On (SSO) provider, while all
              Databricks API calls are made using Service Principal (SPN)
              credentials stored and managed by the platform.
            </p>
            <p className="mb-6">
              This architecture is ideal for building multi-tenant SaaS
              applications on Databricks where end users don&apos;t need—and
              shouldn&apos;t have—direct Databricks accounts.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Benefits">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>No Databricks Accounts Required</strong>: End users
                authenticate via SSO only—no Databricks account provisioning
                needed
              </li>
              <li>
                <strong>Simplified Identity Management</strong>: Manage users in
                your SSO provider, not in Databricks
              </li>
              <li>
                <strong>Multi-Tenant Ready</strong>: Each organization gets
                isolated SPN credentials for data separation
              </li>
              <li>
                <strong>Centralized Access Control</strong>: Platform manages
                all Databricks API access through controlled SPNs
              </li>
              <li>
                <strong>Flexible Audit Options</strong>: Use organization-level
                or per-user SPN mapping for different audit granularity
              </li>
            </ul>
          </HighlightBox>

          <HighlightBox variant="warning" title="When to Use This Pattern">
            <p className="text-sm mb-2">
              This pattern is best suited for:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Multi-tenant SaaS applications built on Databricks</li>
              <li>Embedded analytics platforms</li>
              <li>Customer-facing data products</li>
              <li>Applications where users shouldn&apos;t see Databricks UI</li>
              <li>Scenarios requiring abstracted data access layers</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* Architecture Overview Section */}
        <Section id="architecture" title="Architecture Overview">
          <ContentBlock>
            <p className="mb-4">
              The following diagram shows the high-level architecture of the
              SSO-Mapped SPN pattern. Notice how user authentication (SSO) and
              API authentication (SPN) are completely separate concerns.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={architectureOverview} id="architecture-overview" />

          <Section id="architecture-layers" title="Architecture Layers">
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-cyan-50">
                <h4 className="font-semibold mb-2 text-blue-900">
                  1. Authentication Layer
                </h4>
                <p className="text-sm text-blue-800">
                  Users authenticate via SSO (Okta, Azure AD, or any OIDC
                  provider). This establishes their identity and creates a
                  session in the platform. No Databricks credentials are
                  involved at this stage.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-amber-50 to-orange-50">
                <h4 className="font-semibold mb-2 text-amber-900">
                  2. Identity Mapping Layer
                </h4>
                <p className="text-sm text-amber-800">
                  After SSO authentication, the user selects an organization.
                  The platform resolves the appropriate Service Principal
                  credentials for that organization—either a shared
                  organization-level SPN or a per-user SPN mapping.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-red-50">
                <h4 className="font-semibold mb-2 text-orange-900">
                  3. API Proxy Layer
                </h4>
                <p className="text-sm text-orange-800">
                  All Databricks API calls are proxied through the platform.
                  The proxy obtains OAuth tokens using SPN credentials,
                  caches them for performance, and makes authenticated API
                  calls on behalf of users.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Identity Model Section */}
        <Section id="identity-model" title="Identity Model">
          <ContentBlock>
            <p className="mb-4">
              Understanding the data model is crucial for implementing this
              pattern correctly. The following entity-relationship diagram shows
              how users, organizations, sessions, and SPN credentials are
              related.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={identityModel} id="identity-model-diagram" />

          <Section id="key-entities" title="Key Entities">
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">user</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Core user identity from SSO authentication. The{" "}
                  <code className="bg-white px-2 py-1 rounded">
                    accountIdUserIdMapping
                  </code>{" "}
                  field stores SCIM IDs for users who are also provisioned in
                  Databricks accounts.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">session</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Tracks authenticated user sessions. The critical field is{" "}
                  <code className="bg-white px-2 py-1 rounded">
                    activeOrganizationId
                  </code>
                  —this determines which organization&apos;s SPN credentials are
                  used for API calls.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">byodDatabricksSpns</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Organization-level Service Principal credentials. Each
                  organization has one or more SPNs configured. Credentials are
                  encrypted at rest using AES-256-GCM.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">userSpns</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Optional per-user SPN mappings. When present, the user&apos;s
                  individual SPN is used instead of the organization-level SPN,
                  enabling per-user audit trails in Databricks.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">byodDatabricksWorkspaces</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Maps workspace URLs to SPNs. An organization can have multiple
                  workspaces, each potentially using a different SPN for
                  authentication.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Authentication Flow Section */}
        <Section id="authentication-flow" title="Authentication Flow">
          <ContentBlock>
            <p className="mb-4">
              The authentication flow has three distinct phases: SSO
              authentication (establishing user identity), organization
              selection (setting context), and Databricks API access (using SPN
              credentials).
            </p>
          </ContentBlock>

          <MermaidDiagram chart={authenticationFlow} id="auth-flow-diagram" />

          <Section id="flow-phases" title="Flow Phases Explained">
            <div className="space-y-4">
              <div className="pl-4 border-l-4 border-blue-500 py-2">
                <h4 className="font-semibold mb-2">
                  Phase 1: SSO Authentication
                </h4>
                <p className="text-sm text-muted-foreground">
                  User authenticates via Okta (or another OIDC provider) using
                  standard OAuth 2.0 with PKCE. After successful authentication,
                  a session is created in PostgreSQL and a secure HTTP-only
                  cookie is set. At this point, the user is authenticated but
                  has no organization context.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-amber-500 py-2">
                <h4 className="font-semibold mb-2">
                  Phase 2: Organization Selection
                </h4>
                <p className="text-sm text-muted-foreground">
                  User selects an organization they&apos;re a member of. The
                  session&apos;s{" "}
                  <code className="bg-gray-100 px-1 rounded">
                    activeOrganizationId
                  </code>{" "}
                  is updated to track this selection. This organization context
                  determines which SPN credentials will be used for subsequent
                  API calls.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">
                  Phase 3: Databricks API Access
                </h4>
                <p className="text-sm text-muted-foreground">
                  When the user requests Databricks data, the platform retrieves
                  the organization&apos;s SPN credentials, exchanges them for an
                  OAuth access token using the M2M client_credentials flow, and
                  makes the API call on behalf of the user.
                </p>
              </div>
            </div>
          </Section>

          <HighlightBox variant="success" title="Session Cookie Security">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>HttpOnly</strong>: Prevents JavaScript access, blocking
                XSS attacks
              </li>
              <li>
                <strong>Secure</strong>: Only transmitted over HTTPS
              </li>
              <li>
                <strong>SameSite=Lax</strong>: Prevents CSRF while allowing
                navigation
              </li>
              <li>
                <strong>30-day expiry</strong>: Balances security with user
                convenience
              </li>
            </ul>
          </HighlightBox>
        </Section>

        {/* SPN Token Exchange Section */}
        <Section id="spn-token-exchange" title="Service Principal OAuth (M2M)">
          <ContentBlock>
            <p className="mb-4">
              Service Principal authentication uses the OAuth 2.0
              client_credentials grant type, also known as Machine-to-Machine
              (M2M) authentication. This is the industry standard for
              server-to-server authentication.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={spnTokenExchange} id="spn-token-exchange-diagram" />

          <Section id="oauth-endpoints" title="Databricks OAuth Endpoints">
            <ContentBlock>
              <p className="mb-4">
                Databricks provides two OAuth token endpoints depending on the
                scope of access required:
              </p>
            </ContentBlock>

            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Workspace-Level Token</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  For accessing workspace-specific resources (notebooks, SQL
                  warehouses, catalogs, etc.)
                </p>
                <CodeBlock title="Endpoint">
                  {`POST https://{workspace-url}/oidc/v1/token`}
                </CodeBlock>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Account-Level Token</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  For accessing account-wide resources (SCIM APIs, workspace
                  management, etc.)
                </p>
                <CodeBlock title="Endpoint">
                  {`POST https://accounts.cloud.databricks.com/oidc/accounts/{account-id}/v1/token`}
                </CodeBlock>
              </div>
            </div>
          </Section>

          <Section id="token-request" title="Token Request Format">
            <CodeBlock title="cURL Example">
              {`# Workspace-level token request
curl --request POST \\
  --url "https://your-workspace.cloud.databricks.com/oidc/v1/token" \\
  --header "Content-Type: application/x-www-form-urlencoded" \\
  --header "Authorization: Basic $(echo -n 'CLIENT_ID:CLIENT_SECRET' | base64)" \\
  --data "grant_type=client_credentials&scope=all-apis"

# Response:
# {
#   "access_token": "eyJraWQiOiJkYTA4...",
#   "token_type": "Bearer",
#   "expires_in": 3600
# }`}
            </CodeBlock>

            <HighlightBox variant="note" title="Token Caching">
              <p className="text-sm">
                Access tokens are cached in memory with a TTL of{" "}
                <code className="bg-white px-1 rounded">expires_in - 60</code>{" "}
                seconds to prevent using expired tokens. The platform
                automatically refreshes tokens before they expire.
              </p>
            </HighlightBox>
          </Section>

          <Section id="databricks-sdk" title="Using Databricks SDK">
            <ContentBlock>
              <p className="mb-4">
                If you&apos;re integrating directly with Databricks, the SDK
                handles token management automatically:
              </p>
            </ContentBlock>

            <CodeBlock title="Python SDK Example">
              {`from databricks.sdk import WorkspaceClient

# SDK handles token acquisition and refresh automatically
client = WorkspaceClient(
    host="https://your-workspace.cloud.databricks.com",
    client_id="your-spn-client-id",
    client_secret="your-spn-client-secret"
)

# Make API calls - tokens are managed internally
clusters = client.clusters.list()
catalogs = client.catalogs.list()`}
            </CodeBlock>
          </Section>
        </Section>

        {/* Organization vs User SPN Section */}
        <Section id="spn-modes" title="Organization vs User SPN Mapping">
          <ContentBlock>
            <p className="mb-4">
              The platform supports two modes of SPN mapping, each with
              different tradeoffs for audit granularity and management
              complexity.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={orgVsUserSpn} id="org-vs-user-spn-diagram" />

          <Section id="org-spn" title="Organization-Level SPN (Default)">
            <div className="border rounded-lg p-6 bg-gradient-to-br from-green-50 to-emerald-50 mb-6">
              <h4 className="font-semibold mb-3 text-green-900">
                Shared SPN per Organization
              </h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h5 className="font-medium text-green-800 mb-2">Advantages</h5>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>Simpler setup - one SPN per organization</li>
                    <li>Easier credential rotation</li>
                    <li>Lower management overhead</li>
                    <li>Faster onboarding for new users</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-green-800 mb-2">
                    Considerations
                  </h5>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>Audit logs show SPN name, not individual users</li>
                    <li>All users share the same permissions</li>
                    <li>Cannot revoke access for individual users in Databricks</li>
                  </ul>
                </div>
              </div>
            </div>
          </Section>

          <Section id="user-spn" title="Per-User SPN Mapping (Optional)">
            <div className="border rounded-lg p-6 bg-gradient-to-br from-orange-50 to-amber-50 mb-6">
              <h4 className="font-semibold mb-3 text-orange-900">
                Individual SPN per User
              </h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h5 className="font-medium text-orange-800 mb-2">Advantages</h5>
                  <ul className="text-sm text-orange-700 space-y-1">
                    <li>Per-user audit trails in Databricks</li>
                    <li>Individual permission granularity</li>
                    <li>Can revoke access for specific users</li>
                    <li>Better compliance for regulated industries</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-orange-800 mb-2">
                    Considerations
                  </h5>
                  <ul className="text-sm text-orange-700 space-y-1">
                    <li>More SPNs to manage in Databricks</li>
                    <li>Manual SPN creation per user (currently)</li>
                    <li>More complex credential rotation</li>
                    <li>Higher setup overhead for new users</li>
                  </ul>
                </div>
              </div>
            </div>
          </Section>

          <Section id="choosing-mode" title="Choosing the Right Mode">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">
                  Use Organization-Level SPN when:
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Audit at the organization level is sufficient</li>
                  <li>Users have equivalent data access needs</li>
                  <li>Rapid user onboarding is a priority</li>
                  <li>Management simplicity is preferred</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">
                  Use Per-User SPN Mapping when:
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Per-user audit trails are required</li>
                  <li>Compliance requires individual accountability</li>
                  <li>Users need different permission levels</li>
                  <li>You need to revoke individual access quickly</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* Security Model Section */}
        <Section id="security" title="Security Model">
          <ContentBlock>
            <p className="mb-4">
              Security is paramount when dealing with authentication and API
              credentials. The SSO-Mapped SPN architecture implements multiple
              layers of security to protect user sessions and SPN credentials.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={securityModel} id="security-model-diagram" />

          <Section id="security-layers" title="Security Layers">
            <div className="space-y-4">
              <HighlightBox variant="danger" title="Trust Boundary 1: SSO Provider">
                <p className="text-sm">
                  User authentication is delegated to a trusted SSO provider
                  (Okta, Azure AD, etc.). The platform never sees user
                  passwords—only OIDC tokens after successful authentication.
                </p>
              </HighlightBox>

              <HighlightBox variant="success" title="Trust Boundary 2: FireFly Platform">
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>
                    <strong>Session Cookies</strong>: HttpOnly, Secure,
                    SameSite=Lax prevent common web attacks
                  </li>
                  <li>
                    <strong>Encryption at Rest</strong>: SPN credentials
                    encrypted with AES-256-GCM
                  </li>
                  <li>
                    <strong>Key Management</strong>: Encryption key in
                    environment variables, never in code
                  </li>
                  <li>
                    <strong>Token Caching</strong>: In-memory only, never
                    persisted
                  </li>
                </ul>
              </HighlightBox>

              <HighlightBox variant="info" title="Trust Boundary 3: Databricks">
                <p className="text-sm">
                  Databricks validates SPN credentials and issues short-lived
                  access tokens (1 hour). The platform automatically refreshes
                  tokens before expiry without user interaction.
                </p>
              </HighlightBox>
            </div>
          </Section>

          <Section id="credential-storage" title="Credential Storage">
            <ContentBlock>
              <p className="mb-4">
                SPN credentials (client_id and client_secret) are encrypted
                before storage using AES-256-GCM encryption:
              </p>
            </ContentBlock>

            <div className="border rounded-lg p-4 bg-gray-50">
              <h4 className="font-semibold mb-2">Encryption Details</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>
                  <strong>Algorithm</strong>: AES-256-GCM (Galois/Counter Mode)
                </li>
                <li>
                  <strong>Key Size</strong>: 256 bits (32 bytes)
                </li>
                <li>
                  <strong>IV</strong>: Unique 12-byte initialization vector per
                  encryption
                </li>
                <li>
                  <strong>Auth Tag</strong>: 16-byte authentication tag for
                  integrity verification
                </li>
                <li>
                  <strong>Key Storage</strong>: Environment variable
                  (ENCRYPTION_KEY)
                </li>
              </ul>
            </div>
          </Section>

          <Section id="security-practices" title="Security Best Practices">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Do</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Rotate SPN secrets periodically</li>
                  <li>Use separate SPNs per organization</li>
                  <li>Monitor for unusual API patterns</li>
                  <li>Enable audit logging in Databricks</li>
                  <li>Use HTTPS everywhere</li>
                  <li>Keep dependencies updated</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Don&apos;t</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Log SPN credentials or tokens</li>
                  <li>Store credentials in code</li>
                  <li>Send tokens to client-side JavaScript</li>
                  <li>Share SPNs across organizations</li>
                  <li>Skip encryption for &quot;convenience&quot;</li>
                  <li>Ignore failed authentication attempts</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* Databricks SPN Setup Section */}
        <Section id="setup" title="Databricks Service Principal Setup">
          <ContentBlock>
            <p className="mb-4">
              Setting up Service Principals in Databricks requires account admin
              privileges. The following diagram shows the complete setup
              process, including both manual Databricks steps and automated
              FireFly configuration.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={databricksSpnSetup} id="databricks-spn-setup-diagram" />

          <Section id="setup-steps" title="Detailed Setup Steps">
            <div className="space-y-6">
              <div className="border rounded-lg p-4 bg-orange-50">
                <h4 className="font-semibold mb-2 text-orange-900">
                  Step 1: Create Service Principal in Databricks
                </h4>
                <ol className="text-sm text-orange-800 space-y-2 list-decimal pl-5">
                  <li>
                    Log in to Databricks Account Console (accounts.cloud.databricks.com)
                  </li>
                  <li>Navigate to User Management &gt; Service Principals</li>
                  <li>Click &quot;Add service principal&quot;</li>
                  <li>
                    Enter a descriptive name (e.g., &quot;firefly-org-acme&quot;)
                  </li>
                  <li>Click Create</li>
                </ol>
              </div>

              <div className="border rounded-lg p-4 bg-orange-50">
                <h4 className="font-semibold mb-2 text-orange-900">
                  Step 2: Generate OAuth Secret
                </h4>
                <ol className="text-sm text-orange-800 space-y-2 list-decimal pl-5">
                  <li>Select the newly created Service Principal</li>
                  <li>Go to the &quot;OAuth secrets&quot; tab</li>
                  <li>Click &quot;Generate a secret&quot;</li>
                  <li>
                    <strong className="text-red-700">
                      Copy the Client ID and Secret immediately
                    </strong>
                    —the secret is shown only once
                  </li>
                </ol>
                <HighlightBox variant="danger" title="Important" className="mt-3">
                  <p className="text-sm">
                    The client secret is only displayed once. Store it securely
                    before closing the dialog. If lost, you must generate a new
                    secret.
                  </p>
                </HighlightBox>
              </div>

              <div className="border rounded-lg p-4 bg-orange-50">
                <h4 className="font-semibold mb-2 text-orange-900">
                  Step 3: Assign Workspace Access
                </h4>
                <ol className="text-sm text-orange-800 space-y-2 list-decimal pl-5">
                  <li>In Account Console, go to Workspaces</li>
                  <li>Select the target workspace</li>
                  <li>Go to Permissions tab</li>
                  <li>Add the Service Principal with appropriate role (User or Admin)</li>
                </ol>
              </div>

              <div className="border rounded-lg p-4 bg-orange-50">
                <h4 className="font-semibold mb-2 text-orange-900">
                  Step 4: Configure Unity Catalog Permissions
                </h4>
                <ol className="text-sm text-orange-800 space-y-2 list-decimal pl-5">
                  <li>Create or select an account-level group</li>
                  <li>Add the Service Principal to the group</li>
                  <li>
                    Grant the group permissions on catalogs:
                    <ul className="list-disc pl-5 mt-1">
                      <li>USE CATALOG</li>
                      <li>SELECT (for read access)</li>
                      <li>MODIFY (for write access)</li>
                      <li>CREATE SCHEMA (if needed)</li>
                    </ul>
                  </li>
                </ol>
              </div>

              <div className="border rounded-lg p-4 bg-green-50">
                <h4 className="font-semibold mb-2 text-green-900">
                  Step 5: Configure in FireFly (Automated)
                </h4>
                <ol className="text-sm text-green-800 space-y-2 list-decimal pl-5">
                  <li>
                    Navigate to Settings &gt; Bring Your Own Data in FireFly
                  </li>
                  <li>Click &quot;Add Service Principal&quot;</li>
                  <li>Enter the Client ID and Client Secret</li>
                  <li>Map the workspace URL to this SPN</li>
                  <li>Click Validate to test the connection</li>
                  <li>Configure storage settings (group, catalog)</li>
                </ol>
              </div>
            </div>
          </Section>

          <Section id="api-reference" title="API Reference">
            <ContentBlock>
              <p className="mb-4">
                Key API endpoints for managing SPN credentials and workspace
                mappings:
              </p>
            </ContentBlock>

            <div className="space-y-2 font-mono text-sm">
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-green-600 font-semibold">GET</span>{" "}
                /api/sso-spn/byod/databricks/spns - List configured SPNs
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span>{" "}
                /api/sso-spn/byod/databricks/spns - Add new SPN credentials
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-green-600 font-semibold">GET</span>{" "}
                /api/sso-spn/byod/databricks/workspaces - List workspace mappings
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span>{" "}
                /api/sso-spn/byod/databricks/workspaces - Map workspace to SPN
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span>{" "}
                /api/sso-spn/byod/databricks/workspaces/validate - Test SPN
                connection
              </div>
            </div>
          </Section>
        </Section>

        {/* Comparison Section */}
        <Section id="comparison" title="Authentication Strategy Comparison">
          <ContentBlock>
            <p className="mb-4">
              FireFly supports multiple authentication strategies. Understanding
              when to use each helps you choose the right approach for your use
              case.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={comparisonMatrix} id="comparison-matrix-diagram" />

          <Section id="strategy-comparison" title="Detailed Comparison">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-3 text-left">Aspect</th>
                    <th className="border p-3 text-left bg-purple-50">
                      SSO-Mapped SPN
                    </th>
                    <th className="border p-3 text-left bg-blue-50">
                      Databricks Identity
                    </th>
                    <th className="border p-3 text-left bg-orange-50">
                      Custom Federation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border p-3 font-medium">User Authentication</td>
                    <td className="border p-3 bg-purple-50">SSO (Okta/OIDC)</td>
                    <td className="border p-3 bg-blue-50">Databricks OAuth</td>
                    <td className="border p-3 bg-orange-50">Your IDP</td>
                  </tr>
                  <tr>
                    <td className="border p-3 font-medium">API Authentication</td>
                    <td className="border p-3 bg-purple-50">Service Principal</td>
                    <td className="border p-3 bg-blue-50">User&apos;s OAuth token</td>
                    <td className="border p-3 bg-orange-50">Federated tokens</td>
                  </tr>
                  <tr>
                    <td className="border p-3 font-medium">
                      Databricks Account Required
                    </td>
                    <td className="border p-3 bg-purple-50">No</td>
                    <td className="border p-3 bg-blue-50">Yes</td>
                    <td className="border p-3 bg-orange-50">Yes (SCIM-synced)</td>
                  </tr>
                  <tr>
                    <td className="border p-3 font-medium">Audit Granularity</td>
                    <td className="border p-3 bg-purple-50">
                      SPN-level (or per-user if mapped)
                    </td>
                    <td className="border p-3 bg-blue-50">Per-user</td>
                    <td className="border p-3 bg-orange-50">Per-user</td>
                  </tr>
                  <tr>
                    <td className="border p-3 font-medium">Setup Complexity</td>
                    <td className="border p-3 bg-purple-50">Medium</td>
                    <td className="border p-3 bg-blue-50">Low</td>
                    <td className="border p-3 bg-orange-50">High</td>
                  </tr>
                  <tr>
                    <td className="border p-3 font-medium">Best For</td>
                    <td className="border p-3 bg-purple-50">
                      Multi-tenant SaaS apps
                    </td>
                    <td className="border p-3 bg-blue-50">
                      Single-tenant, direct access
                    </td>
                    <td className="border p-3 bg-orange-50">
                      Enterprise SSO integration
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
        </Section>

        {/* Troubleshooting Section */}
        <Section id="troubleshooting" title="Troubleshooting">
          <ContentBlock>
            <p className="mb-4">
              Common issues and their solutions when implementing SSO-Mapped SPN
              authentication.
            </p>
          </ContentBlock>

          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-red-50">
              <h4 className="font-semibold mb-2 text-red-900">
                401 Unauthorized from Databricks
              </h4>
              <p className="text-sm text-red-800 mb-2">
                The SPN token request is failing.
              </p>
              <ul className="text-sm text-red-700 space-y-1 list-disc pl-5">
                <li>Verify Client ID and Secret are correct (no extra spaces)</li>
                <li>Check the SPN is assigned to the workspace</li>
                <li>Ensure the secret hasn&apos;t expired or been rotated</li>
                <li>Verify the workspace URL is correct</li>
              </ul>
            </div>

            <div className="border rounded-lg p-4 bg-red-50">
              <h4 className="font-semibold mb-2 text-red-900">
                403 Forbidden on API Calls
              </h4>
              <p className="text-sm text-red-800 mb-2">
                Token is valid but permissions are insufficient.
              </p>
              <ul className="text-sm text-red-700 space-y-1 list-disc pl-5">
                <li>Check Unity Catalog permissions for the SPN&apos;s group</li>
                <li>Verify the SPN has the correct workspace role</li>
                <li>Ensure the target resources exist and are accessible</li>
              </ul>
            </div>

            <div className="border rounded-lg p-4 bg-red-50">
              <h4 className="font-semibold mb-2 text-red-900">
                Session Not Found After SSO
              </h4>
              <p className="text-sm text-red-800 mb-2">
                User authenticates but session cookie isn&apos;t set.
              </p>
              <ul className="text-sm text-red-700 space-y-1 list-disc pl-5">
                <li>Check browser cookie settings allow the domain</li>
                <li>Verify HTTPS is being used (Secure cookie requires HTTPS)</li>
                <li>Check for SameSite issues with cross-origin requests</li>
              </ul>
            </div>

            <div className="border rounded-lg p-4 bg-red-50">
              <h4 className="font-semibold mb-2 text-red-900">
                No Organizations Available
              </h4>
              <p className="text-sm text-red-800 mb-2">
                User logs in but sees no organizations to select.
              </p>
              <ul className="text-sm text-red-700 space-y-1 list-disc pl-5">
                <li>Verify the user has been added as a member to an organization</li>
                <li>Check the member record exists in the database</li>
                <li>Ensure the organization has SSO enabled</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* Conclusion Section */}
        <Section id="conclusion" title="Key Takeaways">
          <ContentBlock>
            <p className="mb-4">
              The SSO-Mapped SPN pattern provides a powerful way to build
              multi-tenant applications on Databricks without requiring users to
              have Databricks accounts. Here are the key points to remember:
            </p>
          </ContentBlock>

          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold shrink-0">
                1
              </div>
              <div>
                <h4 className="font-semibold">Separation of Concerns</h4>
                <p className="text-sm text-muted-foreground">
                  User identity (SSO) and API access (SPN) are completely
                  decoupled
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                2
              </div>
              <div>
                <h4 className="font-semibold">Multi-Tenant by Design</h4>
                <p className="text-sm text-muted-foreground">
                  Each organization has isolated SPN credentials and workspace
                  mappings
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-semibold shrink-0">
                3
              </div>
              <div>
                <h4 className="font-semibold">Flexible Audit Options</h4>
                <p className="text-sm text-muted-foreground">
                  Choose between organization-level or per-user SPN mapping
                  based on compliance needs
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-semibold shrink-0">
                4
              </div>
              <div>
                <h4 className="font-semibold">Security First</h4>
                <p className="text-sm text-muted-foreground">
                  Credentials encrypted at rest, tokens never sent to clients,
                  secure session management
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
                5
              </div>
              <div>
                <h4 className="font-semibold">Standard OAuth 2.0</h4>
                <p className="text-sm text-muted-foreground">
                  Uses industry-standard M2M (client_credentials) flow for SPN
                  authentication
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 p-6 rounded-lg text-white mt-8">
            <h3 className="font-bold text-2xl mb-2">Related Documentation</h3>
            <p className="mb-4">
              Learn more about how organizations and users are managed in the
              FireFly platform.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="/docs/architecture/iam/organizations"
                className="inline-block bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Organizations
              </a>
              <a
                href="/docs/architecture/iam/users"
                className="inline-block bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Users
              </a>
              <a
                href="/docs/architecture/authentication/databricks-identity"
                className="inline-block bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Databricks Identity
              </a>
            </div>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

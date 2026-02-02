import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
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
    "public/architecture/security",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function SecurityPage() {
  // Load all mermaid diagrams
  const securityOverview = await loadMermaidFile("00-security-overview.mermaid");
  const authenticationSecurity = await loadMermaidFile("01-authentication-security.mermaid");
  const encryptionAtRest = await loadMermaidFile("02-encryption-at-rest.mermaid");
  const multiTenantIsolation = await loadMermaidFile("03-multi-tenant-isolation.mermaid");
  const unityCatalogPermissions = await loadMermaidFile("04-unity-catalog-permissions.mermaid");
  const auditTrail = await loadMermaidFile("05-audit-trail.mermaid");
  const globalAdminSpn = await loadMermaidFile("06-global-admin-spn.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Architecture / Security
          </div>
          <PageTitle>Security Architecture</PageTitle>
          <p className="text-xl text-muted-foreground">
            A comprehensive guide to FireFly Analytics security architecture,
            covering authentication, encryption, multi-tenant isolation, access
            control, and audit trails.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              Security is a foundational principle of FireFly Analytics. The platform
              implements defense-in-depth with multiple security layers protecting
              user data, credentials, and system integrity. The SSO-SPN architecture
              inherently provides security benefits by separating user identity from
              Databricks access.
            </p>
            <p className="mb-6">
              This document covers the key security mechanisms, from authentication
              and encryption to multi-tenant isolation and comprehensive audit trails.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="Security Highlights">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>OAuth 2.0 + PKCE</strong>: Industry-standard authentication with proof key for code exchange</li>
              <li><strong>AES-256-GCM</strong>: Military-grade encryption for all sensitive data at rest</li>
              <li><strong>TLS 1.3</strong>: All data encrypted in transit with modern cryptographic protocols</li>
              <li><strong>Multi-tenant isolation</strong>: Complete data separation between organizations</li>
              <li><strong>Unity Catalog permissions</strong>: Fine-grained access control at the data layer</li>
              <li><strong>Comprehensive audit trails</strong>: Full traceability from user action to data access</li>
            </ul>
          </HighlightBox>

          <Section id="security-layers" title="Security Layers Overview">
            <ContentBlock>
              <p className="mb-4">
                FireFly implements four distinct security layers that work together
                to protect the platform and its data:
              </p>
            </ContentBlock>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <MermaidDiagram chart={securityOverview} id="security-overview" />
            </div>

            <div className="grid md:grid-cols-2 gap-4 mt-6">
              <div className="border-2 border-green-500 rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Authentication Layer</h4>
                <p className="text-sm text-green-800">
                  SSO/OIDC integration, session management, and OAuth PKCE ensure
                  only verified users can access the platform.
                </p>
              </div>
              <div className="border-2 border-blue-500 rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Encryption Layer</h4>
                <p className="text-sm text-blue-800">
                  TLS 1.3 for data in transit, AES-256-GCM for data at rest, and
                  secure key management protect sensitive information.
                </p>
              </div>
              <div className="border-2 border-orange-500 rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
                <h4 className="font-semibold mb-2 text-orange-900">Access Control Layer</h4>
                <p className="text-sm text-orange-800">
                  Role-based access control, organization isolation, and Unity
                  Catalog permissions enforce least-privilege access.
                </p>
              </div>
              <div className="border-2 border-purple-500 rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
                <h4 className="font-semibold mb-2 text-purple-900">Audit Layer</h4>
                <p className="text-sm text-purple-800">
                  Comprehensive logging at application and Databricks levels
                  provides full traceability for compliance.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Authentication Security Section */}
        <Section id="authentication" title="Authentication Security">
          <ContentBlock>
            <p className="mb-4">
              FireFly uses a two-layer authentication model that separates user
              identity from Databricks access. Users authenticate via your
              organization&apos;s identity provider (Okta, Azure AD, Auth0), while
              Databricks access uses organization-specific Service Principals.
            </p>
          </ContentBlock>

          <Section id="auth-flow" title="Authentication Flow">
            <ContentBlock>
              <p className="mb-6">
                The following diagram shows the complete authentication flow,
                from initial SSO login through session creation and API access:
              </p>
            </ContentBlock>
            <MermaidDiagram chart={authenticationSecurity} id="authentication-security" />
          </Section>

          <Section id="oauth-pkce" title="OAuth 2.0 with PKCE">
            <ContentBlock>
              <p className="mb-4">
                PKCE (Proof Key for Code Exchange) prevents authorization code
                interception attacks, which is critical for web applications:
              </p>
            </ContentBlock>

            <div className="space-y-4">
              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">1. Code Verifier Generation</h4>
                <p className="text-sm text-muted-foreground">
                  A cryptographically random 43-128 character string is generated
                  client-side and stored securely (never sent over the network).
                </p>
              </div>

              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">2. Code Challenge Creation</h4>
                <p className="text-sm text-muted-foreground">
                  The code challenge is a SHA-256 hash of the verifier, base64url
                  encoded. This is sent to the authorization server.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">3. Token Exchange</h4>
                <p className="text-sm text-muted-foreground">
                  When exchanging the authorization code for tokens, the original
                  verifier is sent. The server hashes it and compares to the
                  stored challenge.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">4. Attack Prevention</h4>
                <p className="text-sm text-muted-foreground">
                  Even if an attacker intercepts the authorization code, they
                  cannot exchange it without the original code verifier.
                </p>
              </div>
            </div>
          </Section>

          <Section id="session-security" title="Session Security">
            <ContentBlock>
              <p className="mb-4">
                Sessions are managed with multiple security controls:
              </p>
            </ContentBlock>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">HttpOnly</div>
                <p className="text-sm text-muted-foreground">
                  Session cookies cannot be accessed by JavaScript, preventing XSS attacks
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">Secure</div>
                <p className="text-sm text-muted-foreground">
                  Cookies only transmitted over HTTPS, preventing man-in-the-middle attacks
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">SameSite=Lax</div>
                <p className="text-sm text-muted-foreground">
                  Prevents CSRF attacks while allowing top-level navigation
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">32-byte Token</div>
                <p className="text-sm text-muted-foreground">
                  Cryptographically random session identifier with 256 bits of entropy
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">30-day Expiry</div>
                <p className="text-sm text-muted-foreground">
                  Sessions automatically expire after 30 days of inactivity
                </p>
              </div>
            </div>

            <HighlightBox variant="info" title="Session Metadata" className="mt-6">
              <p className="text-sm mb-2">
                Each session stores security metadata for anomaly detection:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>IP Address</strong>: Client IP for geographic validation</li>
                <li><strong>User Agent</strong>: Browser/device fingerprinting</li>
                <li><strong>Created At</strong>: Session creation timestamp</li>
                <li><strong>Last Activity</strong>: Most recent request timestamp</li>
              </ul>
            </HighlightBox>
          </Section>
        </Section>

        {/* Encryption Section */}
        <Section id="encryption" title="Data Encryption">
          <ContentBlock>
            <p className="mb-4">
              All sensitive data is encrypted both in transit and at rest using
              industry-standard cryptographic algorithms.
            </p>
          </ContentBlock>

          <Section id="encryption-transit" title="Encryption in Transit">
            <ContentBlock>
              <p className="mb-4">
                All network communication uses TLS 1.3, the most modern and secure
                transport layer protocol:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">TLS 1.3 Features</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Reduced handshake latency (1-RTT)</li>
                  <li>Forward secrecy by default</li>
                  <li>Removed legacy cipher suites</li>
                  <li>Encrypted handshake messages</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Protected Channels</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Browser to Next.js (HTTPS)</li>
                  <li>Next.js to PostgreSQL (TLS)</li>
                  <li>Next.js to Databricks (HTTPS)</li>
                  <li>Go Proxy to Databricks (HTTPS)</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="encryption-rest" title="Encryption at Rest">
            <ContentBlock>
              <p className="mb-4">
                All sensitive data stored in PostgreSQL is encrypted using
                AES-256-GCM before storage:
              </p>
            </ContentBlock>
            <MermaidDiagram chart={encryptionAtRest} id="encryption-at-rest" />

            <div className="mt-6 space-y-4">
              <div className="border rounded-lg p-4 bg-blue-50">
                <h4 className="font-semibold mb-2 text-blue-900">AES-256-GCM Details</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <ul className="text-sm space-y-1 text-blue-800">
                    <li><strong>Algorithm</strong>: AES (Advanced Encryption Standard)</li>
                    <li><strong>Key Size</strong>: 256 bits (32 bytes)</li>
                    <li><strong>Mode</strong>: GCM (Galois/Counter Mode)</li>
                  </ul>
                  <ul className="text-sm space-y-1 text-blue-800">
                    <li><strong>IV Size</strong>: 96 bits (12 bytes, unique per encryption)</li>
                    <li><strong>Auth Tag</strong>: 128 bits (16 bytes)</li>
                    <li><strong>Property</strong>: Authenticated encryption (confidentiality + integrity)</li>
                  </ul>
                </div>
              </div>
            </div>

            <Section id="encrypted-data" title="What Gets Encrypted">
              <div className="space-y-3 mt-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">!</div>
                  <div>
                    <h4 className="font-semibold">Service Principal Credentials</h4>
                    <p className="text-sm text-muted-foreground">
                      Client ID and Client Secret for Databricks SPNs
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">!</div>
                  <div>
                    <h4 className="font-semibold">OAuth Access Tokens</h4>
                    <p className="text-sm text-muted-foreground">
                      Bearer tokens for Databricks API access
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">!</div>
                  <div>
                    <h4 className="font-semibold">OAuth Refresh Tokens</h4>
                    <p className="text-sm text-muted-foreground">
                      Long-lived tokens for obtaining new access tokens
                    </p>
                  </div>
                </div>
              </div>
            </Section>

            <HighlightBox variant="warning" title="Key Management" className="mt-6">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Encryption keys stored in environment variables, never in code</li>
                <li>Keys should be rotated periodically (recommended: quarterly)</li>
                <li>Production keys different from development keys</li>
                <li>Key access logged for security auditing</li>
              </ul>
            </HighlightBox>
          </Section>
        </Section>

        {/* Multi-Tenant Isolation Section */}
        <Section id="multi-tenant" title="Multi-Tenant Isolation">
          <ContentBlock>
            <p className="mb-4">
              FireFly is designed as a multi-tenant platform where multiple
              organizations share the same infrastructure while maintaining
              complete data isolation. This is achieved through a combination
              of application-level controls and Databricks platform features.
            </p>
          </ContentBlock>

          <Section id="isolation-architecture" title="Isolation Architecture">
            <MermaidDiagram chart={multiTenantIsolation} id="multi-tenant-isolation" />
          </Section>

          <Section id="isolation-layers" title="Isolation Layers">
            <div className="space-y-4 mt-4">
              <div className="border-l-4 border-green-500 pl-4 py-2">
                <h4 className="font-semibold mb-2">1. Session Isolation</h4>
                <p className="text-sm text-muted-foreground">
                  Each user session is bound to a specific organization. The session
                  context includes the organization ID, and all database queries are
                  filtered by this context. Users cannot access data outside their
                  active organization.
                </p>
              </div>

              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h4 className="font-semibold mb-2">2. Database Isolation</h4>
                <p className="text-sm text-muted-foreground">
                  All organization data is stored with an organization ID foreign key.
                  Database queries automatically filter by the session&apos;s organization
                  context, preventing cross-organization data leakage.
                </p>
              </div>

              <div className="border-l-4 border-orange-500 pl-4 py-2">
                <h4 className="font-semibold mb-2">3. Service Principal Isolation</h4>
                <p className="text-sm text-muted-foreground">
                  Each organization has its own Databricks Service Principal with
                  specific Unity Catalog permissions. Organizations cannot access
                  data outside their assigned catalogs.
                </p>
              </div>

              <div className="border-l-4 border-purple-500 pl-4 py-2">
                <h4 className="font-semibold mb-2">4. Unity Catalog Isolation</h4>
                <p className="text-sm text-muted-foreground">
                  At the Databricks level, Unity Catalog enforces data access based on
                  SPN permissions. Even if application-level controls fail, Databricks
                  prevents unauthorized access.
                </p>
              </div>
            </div>
          </Section>

          <HighlightBox variant="success" title="Defense in Depth" className="mt-6">
            <p className="text-sm mb-2">
              Multiple isolation layers ensure that a failure in one layer is caught by another:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Application bug</strong>: Unity Catalog still enforces SPN permissions</li>
              <li><strong>Stolen session</strong>: Session bound to specific organization</li>
              <li><strong>Compromised SPN</strong>: Limited to assigned catalogs only</li>
              <li><strong>Network breach</strong>: All data encrypted at rest</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* Access Control Section */}
        <Section id="access-control" title="Access Control">
          <ContentBlock>
            <p className="mb-4">
              Access control in FireFly operates at two levels: application-level
              role-based access control (RBAC) and data-level Unity Catalog permissions.
            </p>
          </ContentBlock>

          <Section id="rbac" title="Application RBAC">
            <ContentBlock>
              <p className="mb-4">
                FireFly supports three roles within each organization:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
                <h4 className="font-semibold mb-2 text-purple-900">Owner</h4>
                <p className="text-sm text-purple-800 mb-2">
                  Full administrative control
                </p>
                <ul className="text-xs text-purple-700 space-y-1">
                  <li>Manage organization settings</li>
                  <li>Add/remove members</li>
                  <li>Configure SPN credentials</li>
                  <li>Delete organization</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Admin</h4>
                <p className="text-sm text-blue-800 mb-2">
                  Administrative access
                </p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>Manage members</li>
                  <li>View audit logs</li>
                  <li>Configure settings</li>
                  <li>Cannot delete org</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Member</h4>
                <p className="text-sm text-green-800 mb-2">
                  Standard user access
                </p>
                <ul className="text-xs text-green-700 space-y-1">
                  <li>Browse catalogs</li>
                  <li>Execute queries</li>
                  <li>Use applications</li>
                  <li>No admin functions</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="unity-catalog-permissions" title="Unity Catalog Permissions">
            <ContentBlock>
              <p className="mb-4">
                At the data layer, Unity Catalog provides fine-grained access control:
              </p>
            </ContentBlock>
            <MermaidDiagram chart={unityCatalogPermissions} id="unity-catalog-permissions" />

            <div className="mt-6 space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Permission Hierarchy</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Permissions flow down the Unity Catalog hierarchy:
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">Catalog</span>
                  <span className="text-gray-400">→</span>
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">Schema</span>
                  <span className="text-gray-400">→</span>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">Table/Volume</span>
                </div>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Common Permissions</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li><code className="bg-white px-2 py-1 rounded">USE_CATALOG</code>: Access catalog metadata</li>
                    <li><code className="bg-white px-2 py-1 rounded">USE_SCHEMA</code>: Access schema metadata</li>
                    <li><code className="bg-white px-2 py-1 rounded">SELECT</code>: Read table data</li>
                  </ul>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li><code className="bg-white px-2 py-1 rounded">MODIFY</code>: Insert/update/delete data</li>
                    <li><code className="bg-white px-2 py-1 rounded">READ_VOLUME</code>: Read files from volume</li>
                    <li><code className="bg-white px-2 py-1 rounded">WRITE_VOLUME</code>: Write files to volume</li>
                  </ul>
                </div>
              </div>
            </div>
          </Section>
        </Section>

        {/* Global Admin SPN Section */}
        <Section id="global-admin-spn" title="Global Admin SPN Architecture">
          <ContentBlock>
            <p className="mb-4">
              FireFly uses a two-tier Service Principal architecture to separate
              administrative operations from user data access. This design follows
              the principle of least privilege by ensuring users never have direct
              access to elevated administrative credentials.
            </p>
          </ContentBlock>

          <HighlightBox variant="danger" title="Credential Separation">
            <p className="text-sm mb-2">
              <strong>Critical Security Design:</strong> The Global Admin SPN credentials are
              stored in environment variables and are never exposed to users or stored per-organization.
              Users authenticate with their own limited-scope SPNs for data access.
            </p>
          </HighlightBox>

          <Section id="spn-architecture" title="Two-Tier SPN Architecture">
            <MermaidDiagram chart={globalAdminSpn} id="global-admin-spn" />
          </Section>

          <Section id="global-admin-role" title="Global Admin SPN Role">
            <ContentBlock>
              <p className="mb-4">
                The Global Admin SPN (<code className="bg-gray-100 px-1 rounded">FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID</code> and{" "}
                <code className="bg-gray-100 px-1 rounded">FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET</code>) is used
                exclusively for administrative operations that require elevated privileges:
              </p>
            </ContentBlock>

            <div className="space-y-4 mt-4">
              <div className="border rounded-lg p-4 bg-red-50">
                <h4 className="font-semibold mb-2 text-red-900">Unity Catalog Administration</h4>
                <p className="text-sm text-red-800 mb-2">
                  Creating and managing Delta Sharing catalogs on behalf of organizations:
                </p>
                <ul className="text-sm space-y-1 text-red-700">
                  <li><strong>Create Catalogs</strong>: Mount Delta Sharing catalogs from providers</li>
                  <li><strong>Delete Catalogs</strong>: Unmount catalogs when no longer needed</li>
                  <li><strong>Grant Permissions</strong>: Assign catalog permissions to user SPNs</li>
                  <li><strong>List Providers/Shares</strong>: Discover available Delta Sharing resources</li>
                  <li><strong>Validate Catalogs</strong>: Verify catalog configurations exist and match</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-orange-50">
                <h4 className="font-semibold mb-2 text-orange-900">SCIM & Group Management</h4>
                <p className="text-sm text-orange-800 mb-2">
                  Managing workspace groups and membership verification:
                </p>
                <ul className="text-sm space-y-1 text-orange-700">
                  <li><strong>Verify Group Existence</strong>: Check if organization groups exist in workspace</li>
                  <li><strong>Check Group Membership</strong>: Validate user SPNs are in correct groups</li>
                  <li><strong>Storage Settings Verification</strong>: Validate organization storage configurations</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-blue-50">
                <h4 className="font-semibold mb-2 text-blue-900">Schema & Volume Operations</h4>
                <p className="text-sm text-blue-800 mb-2">
                  Managing uploads schemas and user volumes:
                </p>
                <ul className="text-sm space-y-1 text-blue-700">
                  <li><strong>Check Schema Existence</strong>: Verify uploads schema exists in catalogs</li>
                  <li><strong>List Volumes</strong>: Enumerate volumes in schemas</li>
                  <li><strong>Query Permissions</strong>: Check catalog permissions for groups</li>
                </ul>
              </div>
            </div>

            <CodeBlock title="Global Admin Token Generation" className="mt-6">
{`// From: src/app/api/sso-spn/byod/databricks/catalogs/route.ts

async function getGlobalAdminToken(workspaceUrl: string) {
  // Credentials from environment variables (never stored in database)
  const clientId = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID;
  const clientSecret = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { success: false, error: "Global admin SPN credentials not configured" };
  }

  // OAuth 2.0 client credentials flow
  const tokenUrl = \`\${workspaceUrl}/oidc/v1/token\`;
  const basicAuth = Buffer.from(\`\${clientId}:\${clientSecret}\`).toString("base64");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: \`Basic \${basicAuth}\`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "all-apis",  // Admin scope for all API access
    }),
  });

  const data = await response.json();
  return { success: true, accessToken: data.access_token };
}`}
            </CodeBlock>
          </Section>

          <Section id="user-spn-role" title="User SPN Role">
            <ContentBlock>
              <p className="mb-4">
                Each user has their own Service Principal with limited permissions. User SPNs
                are stored per-user in the <code className="bg-gray-100 px-1 rounded">userSpns</code> table
                and are only used for data access operations:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">User SPN Capabilities</h4>
                <ul className="text-sm space-y-1 text-green-700">
                  <li>Execute SQL queries via Serverless SQL</li>
                  <li>Browse assigned catalogs and schemas</li>
                  <li>Read data from tables with SELECT permission</li>
                  <li>Read files from volumes with READ_VOLUME permission</li>
                  <li>Write to tables/volumes if MODIFY/WRITE_VOLUME granted</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-red-50 to-red-100">
                <h4 className="font-semibold mb-2 text-red-900">User SPN Restrictions</h4>
                <ul className="text-sm space-y-1 text-red-700">
                  <li>Cannot create or delete catalogs</li>
                  <li>Cannot modify catalog permissions</li>
                  <li>Cannot access other organizations&apos; data</li>
                  <li>Cannot perform SCIM operations</li>
                  <li>Limited to assigned catalogs only</li>
                </ul>
              </div>
            </div>

            <CodeBlock title="Granting Permissions to User SPN">
{`// From: src/app/api/sso-spn/byod/databricks/catalogs/mount/route.ts

// After creating a catalog with Global Admin SPN:
// Grant permissions to the user's service principal

async function mountCatalog(orgId: string, userEmail: string, catalogName: string) {
  // 1. Get global admin token (elevated privileges)
  const adminToken = await getGlobalAdminToken(workspaceUrl);

  // 2. Create the Delta Sharing catalog
  await createDeltaSharingCatalog(workspaceUrl, adminToken, catalogName, provider, share);

  // 3. Get the user's SPN from database
  const userSpn = await db.query.userSpns.findFirst({
    where: eq(userSpns.email, userEmail),
  });

  // 4. Grant limited permissions to user's SPN (not admin permissions)
  await updateCatalogPermissions(workspaceUrl, adminToken, catalogName, [
    {
      principal: userSpn.clientId,
      add: ["BROWSE", "EXECUTE", "READ_VOLUME", "SELECT", "USE_CATALOG", "USE_SCHEMA"],
      // Note: No MODIFY, CREATE_*, or administrative permissions
    },
  ]);
}`}
            </CodeBlock>
          </Section>

          <Section id="spn-security-benefits" title="Security Benefits">
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div className="border-l-4 border-green-500 pl-4 py-2">
                <h4 className="font-semibold mb-2">Least Privilege</h4>
                <p className="text-sm text-muted-foreground">
                  User SPNs only have permissions required for data access. They cannot
                  perform administrative operations even if compromised.
                </p>
              </div>

              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h4 className="font-semibold mb-2">Credential Isolation</h4>
                <p className="text-sm text-muted-foreground">
                  Global Admin credentials are in environment variables, not the database.
                  A database breach doesn&apos;t expose admin credentials.
                </p>
              </div>

              <div className="border-l-4 border-orange-500 pl-4 py-2">
                <h4 className="font-semibold mb-2">Audit Trail Separation</h4>
                <p className="text-sm text-muted-foreground">
                  Administrative operations are clearly identifiable in audit logs by
                  the Global Admin SPN identity vs. user SPN identities.
                </p>
              </div>

              <div className="border-l-4 border-purple-500 pl-4 py-2">
                <h4 className="font-semibold mb-2">Blast Radius Limitation</h4>
                <p className="text-sm text-muted-foreground">
                  A compromised user SPN can only access that user&apos;s assigned data.
                  It cannot escalate to administrative access.
                </p>
              </div>
            </div>

            <HighlightBox variant="info" title="Environment Variables" className="mt-6">
              <p className="text-sm mb-2">
                The Global Admin SPN is configured via environment variables:
              </p>
              <div className="bg-white rounded p-3 font-mono text-sm">
                <div><code>FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID</code>=your_global_admin_client_id</div>
                <div><code>FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET</code>=your_global_admin_secret</div>
              </div>
              <p className="text-sm mt-2 text-muted-foreground">
                These credentials should be rotated periodically and stored in a secrets manager
                for production deployments.
              </p>
            </HighlightBox>
          </Section>

          <Section id="api-routes-using-admin" title="API Routes Using Global Admin SPN">
            <ContentBlock>
              <p className="mb-4">
                The following API routes use the Global Admin SPN for administrative operations:
              </p>
            </ContentBlock>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">API Route</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Operation</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Why Admin Required</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2 font-mono text-xs">/api/sso-spn/byod/databricks/catalogs</td>
                    <td className="border border-gray-200 px-4 py-2">List & validate catalogs</td>
                    <td className="border border-gray-200 px-4 py-2">Requires listing all catalogs</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2 font-mono text-xs">/api/sso-spn/byod/databricks/catalogs/mount</td>
                    <td className="border border-gray-200 px-4 py-2">Create catalog & grant permissions</td>
                    <td className="border border-gray-200 px-4 py-2">Creates catalogs, modifies permissions</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2 font-mono text-xs">/api/sso-spn/byod/databricks/catalogs/unmount</td>
                    <td className="border border-gray-200 px-4 py-2">Delete catalog</td>
                    <td className="border border-gray-200 px-4 py-2">Requires catalog deletion permission</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2 font-mono text-xs">/api/sso-spn/byod/databricks/providers</td>
                    <td className="border border-gray-200 px-4 py-2">List providers & shares</td>
                    <td className="border border-gray-200 px-4 py-2">Requires listing all providers</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2 font-mono text-xs">/api/sso-spn/storage-settings/verify-group</td>
                    <td className="border border-gray-200 px-4 py-2">Verify group membership</td>
                    <td className="border border-gray-200 px-4 py-2">Requires SCIM API access</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
        </Section>

        {/* Audit Trail Section */}
        <Section id="audit" title="Audit & Compliance">
          <ContentBlock>
            <p className="mb-4">
              Comprehensive audit trails enable security monitoring, incident
              investigation, and compliance reporting. FireFly logs events at
              multiple levels to provide full traceability.
            </p>
          </ContentBlock>

          <Section id="audit-architecture" title="Audit Architecture">
            <MermaidDiagram chart={auditTrail} id="audit-trail" />
          </Section>

          <Section id="audit-levels" title="Audit Levels">
            <div className="space-y-4 mt-4">
              <div className="border rounded-lg p-4 bg-purple-50">
                <h4 className="font-semibold mb-2 text-purple-900">Application-Level Audit</h4>
                <p className="text-sm text-purple-800 mb-2">
                  FireFly logs all user actions with full context:
                </p>
                <ul className="text-sm space-y-1 text-purple-700">
                  <li>User identity (ID, email, organization)</li>
                  <li>Action type (login, query, file upload, etc.)</li>
                  <li>Timestamp (UTC)</li>
                  <li>Request metadata (IP, user agent)</li>
                  <li>Request/response summary (sanitized)</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-orange-50">
                <h4 className="font-semibold mb-2 text-orange-900">API-Level Audit</h4>
                <p className="text-sm text-orange-800 mb-2">
                  All Databricks API calls are logged:
                </p>
                <ul className="text-sm space-y-1 text-orange-700">
                  <li>Target API endpoint</li>
                  <li>SPN identity used</li>
                  <li>Request parameters</li>
                  <li>Response status and duration</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-blue-50">
                <h4 className="font-semibold mb-2 text-blue-900">Databricks-Level Audit</h4>
                <p className="text-sm text-blue-800 mb-2">
                  Databricks Unity Catalog audit logs capture:
                </p>
                <ul className="text-sm space-y-1 text-blue-700">
                  <li>SPN identity making requests</li>
                  <li>Data objects accessed (tables, volumes)</li>
                  <li>Operations performed (SELECT, INSERT, etc.)</li>
                  <li>Query text (for SQL operations)</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="audit-correlation" title="Audit Correlation">
            <ContentBlock>
              <p className="mb-4">
                By correlating logs across all levels, you can trace any data access
                back to the originating user:
              </p>
            </ContentBlock>

            <CodeBlock title="Audit Trail Example">
{`// User action → Data access trace

1. Application Log:
   User: alice@company.com (ID: user_123)
   Action: Execute SQL Query
   Organization: Company Inc (ID: org_456)
   Timestamp: 2024-01-15T14:30:00Z
   Query: SELECT * FROM sales.transactions LIMIT 100

2. API Log:
   Endpoint: POST /api/2.0/sql/statements
   SPN: spn_company_inc
   Request ID: req_789
   Duration: 450ms
   Status: 200

3. Databricks Unity Catalog Log:
   Principal: spn_company_inc
   Action: SELECT
   Object: sales.transactions
   Timestamp: 2024-01-15T14:30:00.123Z
   Rows Returned: 100`}
            </CodeBlock>

            <HighlightBox variant="info" title="Compliance Support" className="mt-6">
              <p className="text-sm mb-2">
                The audit system supports various compliance requirements:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>SOC 2</strong>: User access logging and monitoring</li>
                <li><strong>GDPR</strong>: Data access tracking and user consent</li>
                <li><strong>HIPAA</strong>: PHI access audit trails</li>
                <li><strong>PCI DSS</strong>: Cardholder data access logging</li>
              </ul>
            </HighlightBox>
          </Section>
        </Section>

        {/* Security Best Practices Section */}
        <Section id="best-practices" title="Security Best Practices">
          <ContentBlock>
            <p className="mb-4">
              Follow these best practices to maximize the security of your
              FireFly deployment:
            </p>
          </ContentBlock>

          <div className="space-y-4">
            <HighlightBox variant="danger" title="Authentication">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Enable MFA (multi-factor authentication) in your identity provider</li>
                <li>Use strong password policies (minimum 12 characters, complexity)</li>
                <li>Implement session timeout for inactive users</li>
                <li>Review and revoke unused sessions regularly</li>
              </ul>
            </HighlightBox>

            <HighlightBox variant="warning" title="Access Control">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Follow least-privilege principle for SPN permissions</li>
                <li>Review Unity Catalog grants quarterly</li>
                <li>Use separate SPNs for production and development</li>
                <li>Audit organization membership regularly</li>
              </ul>
            </HighlightBox>

            <HighlightBox variant="info" title="Encryption">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Rotate encryption keys quarterly</li>
                <li>Use separate keys for different environments</li>
                <li>Store keys in a secrets manager (not environment files)</li>
                <li>Enable database-level encryption (TDE) in PostgreSQL</li>
              </ul>
            </HighlightBox>

            <HighlightBox variant="success" title="Monitoring">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Set up alerts for unusual access patterns</li>
                <li>Monitor failed authentication attempts</li>
                <li>Track SPN token usage across organizations</li>
                <li>Review audit logs weekly for anomalies</li>
              </ul>
            </HighlightBox>
          </div>
        </Section>

        {/* Future Improvements Section */}
        <Section id="future-improvements" title="Future Improvements for Production">
          <ContentBlock>
            <p className="mb-4">
              While FireFly Analytics implements robust security measures, there are
              additional enhancements recommended for production deployments handling
              sensitive data at scale. This section outlines key improvements for
              enterprise-grade security.
            </p>
          </ContentBlock>

          <HighlightBox variant="warning" title="Current State">
            <p className="text-sm mb-2">
              The following sensitive data is currently stored without column-level encryption
              in PostgreSQL. While the database connection uses TLS and the database itself
              can be configured with Transparent Data Encryption (TDE), application-level
              encryption provides an additional security layer.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><code className="bg-white px-1 rounded">userSpns.clientSecret</code> - Per-user Service Principal credentials</li>
              <li><code className="bg-white px-1 rounded">byodDatabricksSpns.clientSecret</code> - Organization BYOD SPN credentials</li>
              <li><code className="bg-white px-1 rounded">account.accessToken</code> - OAuth access tokens</li>
              <li><code className="bg-white px-1 rounded">account.refreshToken</code> - OAuth refresh tokens</li>
              <li><code className="bg-white px-1 rounded">account.idToken</code> - OIDC ID tokens</li>
            </ul>
          </HighlightBox>

          <Section id="credential-encryption" title="SPN Credential Encryption">
            <ContentBlock>
              <p className="mb-4">
                Service Principal credentials (client ID and client secret) should be
                encrypted at the application level before storage. This protects against:
              </p>
              <ul className="list-disc pl-6 mb-6 space-y-2">
                <li>Database backup exposure</li>
                <li>SQL injection attacks that bypass application logic</li>
                <li>Unauthorized database administrator access</li>
                <li>Data breaches from database compromise</li>
              </ul>
            </ContentBlock>

            <CodeBlock title="Recommended Implementation">
{`// Example: Encrypting SPN credentials before storage
import { encryptToken, decryptToken } from "@/lib/token-encryption";

// When storing SPN credentials
async function createOrganizationSpn(orgId: string, clientId: string, clientSecret: string) {
  const encryptedSecret = encryptToken(clientSecret);

  await db.insert(byodDatabricksSpns).values({
    id: generateId(),
    organizationId: orgId,
    clientId: clientId,           // Client ID can remain plaintext
    clientSecret: encryptedSecret, // Encrypted with AES-256-GCM
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// When retrieving SPN credentials
async function getOrganizationSpn(orgId: string) {
  const spn = await db.query.byodDatabricksSpns.findFirst({
    where: eq(byodDatabricksSpns.organizationId, orgId),
  });

  if (spn) {
    return {
      ...spn,
      clientSecret: decryptToken(spn.clientSecret), // Decrypt on read
    };
  }
  return null;
}`}
            </CodeBlock>
          </Section>

          <Section id="per-tenant-keys" title="Per-Tenant Encryption Keys">
            <ContentBlock>
              <p className="mb-4">
                For maximum security isolation, each organization (tenant) should have
                its own encryption key. This ensures that a compromised key only affects
                one organization, not the entire platform.
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Current: Global Key</h4>
                <p className="text-sm text-blue-800 mb-2">
                  Single encryption key for all tenants
                </p>
                <ul className="text-sm space-y-1 text-blue-700">
                  <li>Simpler key management</li>
                  <li>Single point of compromise</li>
                  <li>Key rotation affects all data</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Recommended: Per-Tenant Keys</h4>
                <p className="text-sm text-green-800 mb-2">
                  Unique encryption key per organization
                </p>
                <ul className="text-sm space-y-1 text-green-700">
                  <li>Blast radius limited to one org</li>
                  <li>Independent key rotation</li>
                  <li>Better compliance posture</li>
                </ul>
              </div>
            </div>

            <CodeBlock title="Per-Tenant Key Architecture">
{`// Database schema addition for tenant keys
export const organizationKeys = pgTable("organization_keys", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id),
  keyVersion: integer("key_version").notNull().default(1),
  encryptedKey: text("encrypted_key").notNull(), // Wrapped with master key
  createdAt: timestamp("created_at").notNull().defaultNow(),
  rotatedAt: timestamp("rotated_at"),
});

// Key hierarchy:
// 1. Master Key (HSM or KMS) - Never stored in database
// 2. Tenant Keys - Encrypted with master key, stored in DB
// 3. Data - Encrypted with tenant key

async function getTenantKey(orgId: string): Promise<Buffer> {
  const keyRecord = await db.query.organizationKeys.findFirst({
    where: eq(organizationKeys.organizationId, orgId),
    orderBy: desc(organizationKeys.keyVersion),
  });

  // Decrypt tenant key using master key from KMS
  const masterKey = await kms.getKey("firefly-master-key");
  return unwrapKey(keyRecord.encryptedKey, masterKey);
}`}
            </CodeBlock>

            <HighlightBox variant="info" title="Key Management Service Integration" className="mt-6">
              <p className="text-sm mb-2">
                For production deployments, integrate with a cloud KMS:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>AWS KMS</strong>: Use envelope encryption with CMKs</li>
                <li><strong>Azure Key Vault</strong>: Managed HSM for key protection</li>
                <li><strong>Google Cloud KMS</strong>: Hardware-backed key storage</li>
                <li><strong>HashiCorp Vault</strong>: Self-hosted secrets management</li>
              </ul>
            </HighlightBox>
          </Section>

          <Section id="oauth-token-encryption" title="OAuth Token Encryption">
            <ContentBlock>
              <p className="mb-4">
                OAuth tokens in the <code className="bg-gray-100 px-1 rounded">account</code> table
                should be encrypted at rest. These tokens provide direct access to user accounts
                and must be protected:
              </p>
            </ContentBlock>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">!</div>
                <div>
                  <h4 className="font-semibold">Access Tokens</h4>
                  <p className="text-sm text-muted-foreground">
                    Short-lived but provide immediate API access. Encrypt to prevent
                    unauthorized use during their validity window.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">!</div>
                <div>
                  <h4 className="font-semibold">Refresh Tokens</h4>
                  <p className="text-sm text-muted-foreground">
                    Long-lived and can generate new access tokens. Critical to encrypt
                    as compromise allows persistent access.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">!</div>
                <div>
                  <h4 className="font-semibold">ID Tokens</h4>
                  <p className="text-sm text-muted-foreground">
                    Contain user identity claims. Encrypt to protect PII and prevent
                    identity spoofing.
                  </p>
                </div>
              </div>
            </div>

            <CodeBlock title="Token Encryption Integration" className="mt-6">
{`// Better-Auth plugin for automatic token encryption
import { encryptToken, decryptToken } from "@/lib/token-encryption";

const tokenEncryptionPlugin = {
  name: "token-encryption",
  hooks: {
    // Encrypt tokens before database write
    beforeCreateAccount: async (account) => ({
      ...account,
      accessToken: account.accessToken
        ? encryptToken(account.accessToken)
        : null,
      refreshToken: account.refreshToken
        ? encryptToken(account.refreshToken)
        : null,
      idToken: account.idToken
        ? encryptToken(account.idToken)
        : null,
    }),

    // Decrypt tokens after database read
    afterGetAccount: async (account) => ({
      ...account,
      accessToken: account.accessToken
        ? decryptToken(account.accessToken)
        : null,
      refreshToken: account.refreshToken
        ? decryptToken(account.refreshToken)
        : null,
      idToken: account.idToken
        ? decryptToken(account.idToken)
        : null,
    }),
  },
};`}
            </CodeBlock>
          </Section>

          <Section id="production-checklist" title="Production Readiness Checklist">
            <ContentBlock>
              <p className="mb-4">
                Before deploying to production with sensitive data, ensure the following
                security enhancements are implemented:
              </p>
            </ContentBlock>

            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-red-100 text-red-700 flex items-center justify-center text-xs">1</span>
                  Database Encryption
                </h4>
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Enable PostgreSQL TDE (Transparent Data Encryption)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Implement column-level encryption for SPN client secrets
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Encrypt OAuth tokens (access, refresh, ID tokens)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Encrypt any PII stored in user tables
                  </li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-orange-100 text-orange-700 flex items-center justify-center text-xs">2</span>
                  Key Management
                </h4>
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Integrate with cloud KMS (AWS KMS, Azure Key Vault, etc.)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Implement per-tenant encryption keys
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Establish key rotation procedures and schedule
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Remove encryption keys from environment variables
                  </li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs">3</span>
                  Access Controls
                </h4>
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Restrict database access to application service accounts only
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Implement database query logging and monitoring
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Use separate database credentials per environment
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Enable row-level security where applicable
                  </li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-green-100 text-green-700 flex items-center justify-center text-xs">4</span>
                  Monitoring & Compliance
                </h4>
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Set up alerts for encryption key access
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Monitor for bulk data access patterns
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Document encryption practices for compliance audits
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 border rounded flex-shrink-0 mt-0.5"></span>
                    Test key rotation and disaster recovery procedures
                  </li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* Conclusion Section */}
        <Section id="conclusion" title="Conclusion">
          <ContentBlock>
            <p className="mb-4">
              FireFly Analytics implements a comprehensive security architecture
              that protects data at every layer. The combination of strong
              authentication, encryption, multi-tenant isolation, and audit
              trails provides:
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <h3 className="font-semibold mb-2 text-green-900">Confidentiality</h3>
              <p className="text-sm text-green-800">
                Data is encrypted in transit and at rest, accessible only to
                authorized users and systems.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h3 className="font-semibold mb-2 text-blue-900">Integrity</h3>
              <p className="text-sm text-blue-800">
                Authenticated encryption and access controls prevent unauthorized
                modification of data.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
              <h3 className="font-semibold mb-2 text-purple-900">Accountability</h3>
              <p className="text-sm text-purple-800">
                Comprehensive audit trails enable full traceability from user
                action to data access.
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-orange-500 to-yellow-500 p-6 rounded-lg text-white mt-8">
            <h3 className="font-bold text-2xl mb-2">Explore More</h3>
            <p className="mb-4">
              Learn about other aspects of the FireFly Analytics architecture.
            </p>
            <div className="flex gap-4">
              <Link
                href="/docs/architecture/scalability"
                className="inline-block bg-white text-orange-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Scalability Docs
              </Link>
              <Link
                href="/docs/architecture/request-flow"
                className="inline-block bg-white/20 text-white border border-white px-6 py-2 rounded-lg font-semibold hover:bg-white/30 transition-colors"
              >
                Request Flow
              </Link>
            </div>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

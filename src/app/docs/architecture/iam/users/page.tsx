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
    "public/architecture/iam/users",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function UsersDocsPage() {
  // Load all mermaid diagrams
  const entityRelationship = await loadMermaidFile("01-entity-relationship.mermaid");
  const userOnboardingFlow = await loadMermaidFile("02-user-onboarding-flow.mermaid");
  const userRegistrationSequence = await loadMermaidFile("03-user-registration-sequence.mermaid");
  const memberOnboarding = await loadMermaidFile("04-member-onboarding.mermaid");
  const authFlow = await loadMermaidFile("05-auth-flow.mermaid");
  const userAccessControl = await loadMermaidFile("06-user-access-control.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Architecture / IAM / Users
          </div>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-500 to-emerald-500 bg-clip-text text-transparent">
            User Onboarding in FireFly
          </h1>
          <p className="text-xl text-muted-foreground">
            A comprehensive guide to how users are registered, authenticated,
            and granted access to organizations and Databricks resources in the
            FireFly platform.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              Users in FireFly authenticate via SSO (Okta) and are associated
              with one or more organizations through membership records. Each
              user can have different roles in different organizations and may
              have individual Service Principal mappings for Databricks access.
            </p>
            <p className="mb-6">
              This document describes how users are registered, authenticated,
              onboarded to organizations, and granted access to Databricks
              resources.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Concepts">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>SSO Authentication</strong>: Users authenticate via Okta - no Databricks account needed</li>
              <li><strong>Multi-Organization Membership</strong>: Users can belong to multiple organizations with different roles</li>
              <li><strong>Session-Based Org Selection</strong>: Active organization stored in session for API routing</li>
              <li><strong>SPN-Based API Access</strong>: Databricks calls use organization SPN, not user credentials</li>
            </ul>
          </HighlightBox>

          <HighlightBox variant="warning" title="Onboarding Steps">
            <p className="text-sm mb-2">
              User onboarding involves several steps, some automated and some manual:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Automated</strong>: User registration, session creation, member addition, SPN mapping in FireFly</li>
              <li><strong>Manual</strong>: User SPN creation in Databricks, adding user to Databricks group</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* User Data Model Section */}
        <Section id="data-model" title="User Data Model">
          <ContentBlock>
            <p className="mb-4">
              The following entity-relationship diagram shows all tables involved
              in user management and their relationships.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={entityRelationship} id="user-entity-relationship" />

          <Section id="user-tables" title="User-Related Tables">
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">user</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Core user record created during SSO authentication
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">id</code>: Unique user identifier</li>
                  <li><code className="bg-white px-2 py-1 rounded">email</code>: User&apos;s email (unique)</li>
                  <li><code className="bg-white px-2 py-1 rounded">name</code>: Display name from SSO</li>
                  <li><code className="bg-white px-2 py-1 rounded">accountIdUserIdMapping</code>: SCIM IDs per Databricks account</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">member</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  User-to-organization membership with role
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">userId</code>: Reference to user</li>
                  <li><code className="bg-white px-2 py-1 rounded">organizationId</code>: Reference to organization</li>
                  <li><code className="bg-white px-2 py-1 rounded">role</code>: &quot;owner&quot;, &quot;admin&quot;, or &quot;member&quot;</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">session</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  User session with active organization context
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">userId</code>: Reference to user</li>
                  <li><code className="bg-white px-2 py-1 rounded">activeOrganizationId</code>: Currently selected org</li>
                  <li><code className="bg-white px-2 py-1 rounded">token</code>: Session token</li>
                  <li><code className="bg-white px-2 py-1 rounded">expiresAt</code>: Session expiration</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">userSpns</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Individual user Service Principal mappings (optional)
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">email</code>: User email (unique)</li>
                  <li><code className="bg-white px-2 py-1 rounded">clientId</code>: SPN OAuth client ID</li>
                  <li><code className="bg-white px-2 py-1 rounded">clientSecret</code>: Encrypted SPN secret</li>
                  <li><code className="bg-white px-2 py-1 rounded">principalId</code>: Databricks principal ID</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">account</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  OAuth account from better-auth for SSO tokens
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">userId</code>: Reference to user</li>
                  <li><code className="bg-white px-2 py-1 rounded">providerId</code>: OAuth provider (e.g., &quot;oidc&quot;)</li>
                  <li><code className="bg-white px-2 py-1 rounded">accessToken</code>: SSO access token</li>
                  <li><code className="bg-white px-2 py-1 rounded">refreshToken</code>: SSO refresh token</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* User Onboarding Flow Section */}
        <Section id="onboarding-flow" title="Complete User Onboarding Flow">
          <ContentBlock>
            <p className="mb-4">
              The following diagram shows the complete flow for onboarding a new
              user to the platform and granting them access to an organization&apos;s
              data. Red boxes indicate manual steps.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={userOnboardingFlow} id="user-onboarding-flow" />

          <Section id="onboarding-phases" title="Onboarding Phases">
            <div className="space-y-4">
              <div className="pl-4 border-l-4 border-blue-500 py-2">
                <h4 className="font-semibold mb-2">1. User Registration</h4>
                <p className="text-sm text-muted-foreground">
                  User visits FireFly and authenticates via Okta SSO. If this is
                  their first login, a user record is created in PostgreSQL.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-cyan-500 py-2">
                <h4 className="font-semibold mb-2">2. Organization Access</h4>
                <p className="text-sm text-muted-foreground">
                  User selects an organization they&apos;re a member of. The session
                  is updated with the activeOrganizationId for API routing.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-red-500 py-2">
                <h4 className="font-semibold mb-2">3. SPN Mapping (MANUAL)</h4>
                <p className="text-sm text-muted-foreground">
                  Admin creates a user SPN in Databricks and maps it to the user
                  in FireFly. This enables per-user tracking and permissions.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-red-500 py-2">
                <h4 className="font-semibold mb-2">4. Databricks Group Access (MANUAL)</h4>
                <p className="text-sm text-muted-foreground">
                  Admin adds the user/SPN to the organization&apos;s Databricks group.
                  This grants access to Unity Catalog data.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">5. Data Access</h4>
                <p className="text-sm text-muted-foreground">
                  User can now access notebooks, SQL editor, and catalog browser.
                  All Databricks API calls use the organization&apos;s SPN.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* User Registration Sequence Section */}
        <Section id="registration" title="User Registration Sequence">
          <ContentBlock>
            <p className="mb-4">
              This sequence diagram shows the detailed flow for user registration
              and session creation via Okta SSO.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={userRegistrationSequence} id="user-registration-seq" />

          <HighlightBox variant="note" title="First-Time vs Returning Users">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>First-time users</strong>: User record is created in PostgreSQL with email and name from SSO</li>
              <li><strong>Returning users</strong>: OAuth tokens are updated in the account table</li>
              <li><strong>Session creation</strong>: A new session is created for both cases with a cookie</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* Member Onboarding Section */}
        <Section id="member-onboarding" title="Adding User to Organization">
          <ContentBlock>
            <p className="mb-4">
              This sequence diagram shows the complete flow for adding an existing
              user to an organization and granting them Databricks access.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={memberOnboarding} id="member-onboarding-seq" />

          <Section id="member-steps" title="Detailed Steps">
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Step 5.1: Add User as Member in FireFly</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Admin searches for the user and adds them with a role (owner/admin/member).
                </p>
                <CodeBlock title="POST /api/admin/add-member">
{`{
  "organizationId": "org_123...",
  "userId": "user_456...",
  "role": "member"
}`}
                </CodeBlock>
              </div>

              <div className="border rounded-lg p-4 bg-red-50">
                <h4 className="font-semibold mb-2 text-red-900">Step 5.2: Create User SPN in Databricks (MANUAL)</h4>
                <p className="text-sm text-red-800">
                  Admin must manually create a Service Principal for the user in the
                  Databricks Account Console and grant it workspace access.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Step 5.3: Map User to SPN in FireFly</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Admin enters the SPN credentials in FireFly to map the user.
                </p>
                <CodeBlock title="POST /api/admin/databricks/accounts/map-scim-user">
{`{
  "email": "user@example.com",
  "clientId": "abc123...",
  "clientSecret": "secret..."
}`}
                </CodeBlock>
              </div>

              <div className="border rounded-lg p-4 bg-red-50">
                <h4 className="font-semibold mb-2 text-red-900">Step 5.4: Add User to Databricks Group (MANUAL)</h4>
                <p className="text-sm text-red-800">
                  Admin must manually add the user/SPN to the organization&apos;s group
                  in Databricks for Unity Catalog access.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Authentication Flow Section */}
        <Section id="authentication" title="SSO-SPN Authentication Flow">
          <ContentBlock>
            <p className="mb-4">
              This diagram shows how users authenticate via SSO and how their
              requests are authorized using organization Service Principals.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={authFlow} id="auth-flow-seq" />

          <HighlightBox variant="success" title="Authentication Benefits">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>No Databricks Account Required</strong>: Users authenticate via Okta only</li>
              <li><strong>Centralized Access Control</strong>: FireFly manages organization membership</li>
              <li><strong>Secure API Access</strong>: SPN tokens used for all Databricks calls</li>
              <li><strong>Automatic Token Refresh</strong>: SPN tokens are cached and refreshed</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* User Access Control Section */}
        <Section id="access-control" title="User Access Control">
          <ContentBlock>
            <p className="mb-4">
              This diagram shows how user roles and permissions are resolved
              in FireFly and Databricks.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={userAccessControl} id="user-access-control" />

          <Section id="roles" title="User Roles">
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-amber-50 to-orange-50">
                <h4 className="font-semibold mb-2 text-amber-900">Owner</h4>
                <ul className="text-sm space-y-1 text-amber-800">
                  <li>Full organization control</li>
                  <li>Manage all members</li>
                  <li>Configure BYOD settings</li>
                  <li>Delete organization</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-cyan-50">
                <h4 className="font-semibold mb-2 text-blue-900">Admin</h4>
                <ul className="text-sm space-y-1 text-blue-800">
                  <li>Manage members</li>
                  <li>Configure settings</li>
                  <li>Access all features</li>
                  <li>Cannot manage owners</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-emerald-50">
                <h4 className="font-semibold mb-2 text-green-900">Member</h4>
                <ul className="text-sm space-y-1 text-green-800">
                  <li>Access notebooks</li>
                  <li>Use SQL editor</li>
                  <li>Browse catalog</li>
                  <li>Import data</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="databricks-permissions" title="Databricks Permissions">
            <ContentBlock>
              <p className="mb-4">
                Data access in Databricks is controlled by Unity Catalog groups
                and catalog permissions, separate from FireFly roles.
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Unity Catalog Group</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Organization members are added to a Databricks group:
                </p>
                <ul className="text-sm space-y-1">
                  <li>SELECT on catalog tables</li>
                  <li>MODIFY on catalog tables</li>
                  <li>CREATE on schemas</li>
                  <li>Access to specific volumes</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">User SPN</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Individual user SPNs enable:
                </p>
                <ul className="text-sm space-y-1">
                  <li>Per-user audit trails</li>
                  <li>Individual permission grants</li>
                  <li>Workspace-level access</li>
                  <li>Cluster/warehouse access</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* API Reference Section */}
        <Section id="api-reference" title="API Reference">
          <ContentBlock>
            <p className="mb-4">
              These are the key API endpoints for user management.
            </p>
          </ContentBlock>

          <Section id="auth-apis" title="Authentication APIs">
            <div className="space-y-2 font-mono text-sm">
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-green-600 font-semibold">GET</span> /api/auth/session - Get current session
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/oauth/set-org - Set active organization
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/oauth/switch-org - Switch organization
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-green-600 font-semibold">GET</span> /api/sso-spn/user-data - Get user data for org
              </div>
            </div>
          </Section>

          <Section id="user-mgmt-apis" title="User Management APIs">
            <div className="space-y-2 font-mono text-sm">
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-green-600 font-semibold">GET</span> /api/admin/search-users - Search users by email
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/admin/add-member - Add user to organization
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/admin/remove-member - Remove user from organization
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/admin/update-member-role - Change member role
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/admin/databricks/accounts/map-scim-user - Map SCIM ID
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-green-600 font-semibold">GET</span> /api/admin/list-users-with-scim - List users with SCIM mapping
              </div>
            </div>
          </Section>

          <Section id="frontend-pages" title="Frontend Locations">
            <div className="space-y-2 font-mono text-sm">
              <div className="p-3 bg-gray-50 rounded border">
                /sso-spn/login - User login page
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                /sso-spn/select-org - Organization selector
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                /admin/users - User management (admin)
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                /admin/organizations/[slug] - Manage org members
              </div>
            </div>
          </Section>
        </Section>

        {/* Conclusion Section */}
        <Section id="conclusion" title="Key Takeaways">
          <ContentBlock>
            <p className="mb-4">
              Understanding the user lifecycle is essential for proper platform
              administration. Here are the key points to remember:
            </p>
          </ContentBlock>

          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">1</div>
              <div>
                <h4 className="font-semibold">Users Authenticate via SSO Only</h4>
                <p className="text-sm text-muted-foreground">
                  No Databricks account is needed - users log in through Okta
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-semibold shrink-0">2</div>
              <div>
                <h4 className="font-semibold">Multi-Organization Membership</h4>
                <p className="text-sm text-muted-foreground">
                  Users can belong to multiple orgs with different roles in each
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold shrink-0">3</div>
              <div>
                <h4 className="font-semibold">Session Tracks Active Org</h4>
                <p className="text-sm text-muted-foreground">
                  The activeOrganizationId in session determines API routing
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-semibold shrink-0">4</div>
              <div>
                <h4 className="font-semibold">SPN Mapping Enables Tracking</h4>
                <p className="text-sm text-muted-foreground">
                  Per-user SPNs enable audit trails and individual permissions
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-sm font-semibold shrink-0">5</div>
              <div>
                <h4 className="font-semibold">Databricks Group Access is Manual</h4>
                <p className="text-sm text-muted-foreground">
                  Users must be manually added to the Databricks group for data access
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 rounded-lg text-white mt-8">
            <h3 className="font-bold text-2xl mb-2">Related Documentation</h3>
            <p className="mb-4">
              Learn more about how organizations work and how the platform
              handles authentication and API routing.
            </p>
            <div className="flex gap-4">
              <a
                href="/docs/architecture/iam/organizations"
                className="inline-block bg-white text-green-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Organizations
              </a>
              <a
                href="/docs/architecture/authentication/databricks-identity"
                className="inline-block bg-white text-green-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Authentication
              </a>
            </div>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

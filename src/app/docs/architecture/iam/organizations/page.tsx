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

async function loadMermaidFile(subdir: string, filename: string): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "public/architecture/iam",
    subdir,
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function OrganizationsDocsPage() {
  // Load all mermaid diagrams
  const entityRelationship = await loadMermaidFile("organizations", "01-entity-relationship.mermaid");
  const orgSetupFlow = await loadMermaidFile("organizations", "02-org-setup-flow.mermaid");
  const orgCreationSequence = await loadMermaidFile("organizations", "03-org-creation-sequence.mermaid");
  const memberOnboarding = await loadMermaidFile("users", "04-member-onboarding.mermaid");
  const authFlow = await loadMermaidFile("users", "05-auth-flow.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Architecture / IAM / Organizations
          </div>
          <PageTitle>Organizations in FireFly</PageTitle>
          <p className="text-xl text-muted-foreground">
            A comprehensive guide to how organizations are created, mapped, and
            managed in the FireFly platform, including Databricks resource
            mappings and automation status.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              Organizations are the primary multi-tenancy unit in FireFly. Each
              organization is an isolated data silo with its own members,
              Service Principals, workspaces, and Unity Catalog configurations.
            </p>
            <p className="mb-6">
              This document describes how organizations are created, what
              Databricks resources they map to, and what steps are automated vs
              manual.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Concepts">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Multi-Tenant Isolation</strong>: Each org has isolated resources and members</li>
              <li><strong>SSO + SPN Authentication</strong>: Users auth via SSO, API calls via Service Principal</li>
              <li><strong>Unity Catalog Access</strong>: Per-org catalogs with group-based permissions</li>
              <li><strong>Role-Based Access Control</strong>: Owner, Admin, Member roles per organization</li>
            </ul>
          </HighlightBox>

          <HighlightBox variant="warning" title="Automation Status">
            <p className="text-sm mb-2">
              Not all organization setup steps are automated. Some require manual
              Databricks admin intervention:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Automated</strong>: Org creation, member management, SPN storage, workspace mapping</li>
              <li><strong>Manual</strong>: SPN creation in Databricks, group creation, catalog permissions</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* What Organizations Map To Section */}
        <Section id="resource-mapping" title="What Organizations Map To">
          <ContentBlock>
            <p className="mb-4">
              Organizations map to resources in both the FireFly PostgreSQL
              database and Databricks. Understanding these mappings is crucial
              for proper organization setup.
            </p>
          </ContentBlock>

          <Section id="firefly-resources" title="FireFly Database Resources">
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">organization</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Core organization record with identity and configuration
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">id</code>: Unique org identifier (org_timestamp_random)</li>
                  <li><code className="bg-white px-2 py-1 rounded">name</code>: Display name</li>
                  <li><code className="bg-white px-2 py-1 rounded">slug</code>: URL-friendly identifier</li>
                  <li><code className="bg-white px-2 py-1 rounded">workspaceUrl</code>: Primary Databricks workspace URL</li>
                  <li><code className="bg-white px-2 py-1 rounded">ssoEnabled</code>: Whether SSO is enabled (default: true)</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">member</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  User-organization relationships with role-based access
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">organizationId</code>: Reference to organization</li>
                  <li><code className="bg-white px-2 py-1 rounded">userId</code>: Reference to user</li>
                  <li><code className="bg-white px-2 py-1 rounded">role</code>: &quot;owner&quot;, &quot;admin&quot;, or &quot;member&quot;</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">byodDatabricksSpns</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Service Principal credentials for Databricks API access
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">organizationId</code>: Reference to organization</li>
                  <li><code className="bg-white px-2 py-1 rounded">clientId</code>: SPN OAuth client ID</li>
                  <li><code className="bg-white px-2 py-1 rounded">clientSecret</code>: Encrypted SPN client secret</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">byodDatabricksWorkspaces</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Workspace-to-SPN mappings for API routing
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">workspaceUrl</code>: Databricks workspace URL</li>
                  <li><code className="bg-white px-2 py-1 rounded">spnId</code>: Reference to SPN credentials</li>
                  <li><code className="bg-white px-2 py-1 rounded">deltaSharingGlobalMetastoreId</code>: For Delta Sharing</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">organizationStorageSettings</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Unity Catalog group and catalog configuration
                </p>
                <ul className="text-sm space-y-1">
                  <li><code className="bg-white px-2 py-1 rounded">primaryOrganizationGroup</code>: Databricks group name</li>
                  <li><code className="bg-white px-2 py-1 rounded">primaryOrganizationGroupId</code>: Databricks group ID</li>
                  <li><code className="bg-white px-2 py-1 rounded">organizationEditableCatalog</code>: Writable catalog name</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="databricks-resources" title="Databricks Resources">
            <ContentBlock>
              <p className="mb-4">
                Organizations map to the following Databricks resources, which
                must be created manually:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-cyan-50">
                <h4 className="font-semibold mb-2 text-blue-900">Workspace</h4>
                <p className="text-sm text-blue-800">
                  One or more Databricks workspaces per organization. The workspace
                  URL is stored in the organization record.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-emerald-50">
                <h4 className="font-semibold mb-2 text-green-900">Service Principal</h4>
                <p className="text-sm text-green-800">
                  OAuth credentials for API access. Created in Databricks and
                  stored in FireFly for token exchange.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-violet-50">
                <h4 className="font-semibold mb-2 text-purple-900">Unity Catalog Group</h4>
                <p className="text-sm text-purple-800">
                  Access control for org members. Users must be added to this
                  group to access org data.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-amber-50">
                <h4 className="font-semibold mb-2 text-orange-900">Catalog</h4>
                <p className="text-sm text-orange-800">
                  Data storage with granted permissions. The group receives
                  READ/WRITE access to specific catalogs.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Database Schema Section */}
        <Section id="database-schema" title="Database Schema">
          <ContentBlock>
            <p className="mb-4">
              The following entity-relationship diagram shows all tables involved
              in organization management and their relationships.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={entityRelationship} id="entity-relationship" />
        </Section>

        {/* Automation Status Section */}
        <Section id="automation-status" title="Automation Status">
          <ContentBlock>
            <p className="mb-4">
              Understanding which steps are automated and which require manual
              intervention is critical for organization setup and onboarding.
            </p>
          </ContentBlock>

          <Section id="automated-steps" title="Automated (via APIs)">
            <HighlightBox variant="success" title="These steps are handled by FireFly">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Organization creation in FireFly database (POST /api/admin/organizations)</li>
                <li>Member addition to organizations (POST /api/admin/add-member)</li>
                <li>SPN credential storage (POST /api/sso-spn/byod/databricks/spns)</li>
                <li>Workspace mapping configuration (POST /api/sso-spn/byod/databricks/workspaces)</li>
                <li>SCIM user ID lookup and mapping (POST /api/admin/databricks/accounts/map-scim-user)</li>
                <li>Workspace validation (POST /api/sso-spn/byod/databricks/workspaces/validate)</li>
                <li>Storage settings configuration</li>
              </ul>
            </HighlightBox>
          </Section>

          <Section id="manual-steps" title="Manual Steps Required">
            <HighlightBox variant="danger" title="These steps require Databricks admin">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Create Service Principal in Databricks Account Console</li>
                <li>Grant SPN access to workspace(s)</li>
                <li>Create organization group in Databricks</li>
                <li>Create catalog for organization in Unity Catalog</li>
                <li>Grant Unity Catalog permissions to group (SELECT, MODIFY on catalogs)</li>
                <li>Add users to Databricks group (no automated API)</li>
                <li>Configure Delta Sharing providers and shares</li>
                <li>Create uploads schema and user volumes</li>
              </ul>
            </HighlightBox>
          </Section>
        </Section>

        {/* Complete Setup Flow Section */}
        <Section id="complete-setup-flow" title="Complete Organization Setup Flow">
          <ContentBlock>
            <p className="mb-4">
              The following diagram shows the complete flow for setting up a new
              organization. Red boxes indicate manual steps that require
              Databricks admin intervention.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={orgSetupFlow} id="org-setup-flow" />

          <Section id="setup-phases" title="Setup Phases Explained">
            <div className="space-y-4">
              <div className="pl-4 border-l-4 border-blue-500 py-2">
                <h4 className="font-semibold mb-2">1. Organization Creation</h4>
                <p className="text-sm text-muted-foreground">
                  Admin creates organization via the Admin UI. This creates a record
                  in PostgreSQL with name and slug.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-cyan-500 py-2">
                <h4 className="font-semibold mb-2">2. Databricks Setup</h4>
                <p className="text-sm text-muted-foreground">
                  A Databricks workspace must exist or be created for the organization to map to.
                  Set the workspace URL for the organization and map the organization
                  to the Databricks workspace.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-red-500 py-2">
                <h4 className="font-semibold mb-2">3. Workspace Setup (MANUAL)</h4>
                <p className="text-sm text-muted-foreground">
                  Admin must manually create Service Principal, grant workspace access,
                  create Unity Catalog group, create catalog, and configure permissions in Databricks.
                </p>
                <p className="text-sm text-muted-foreground mt-2 italic">
                  Note: This step is currently manual but can be automated via Terraform,
                  or made self-service by building a UI wired to Databricks APIs that provides
                  customers the ability to self-service the setup via an organization onboarding wizard.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">4. FireFly Configuration</h4>
                <p className="text-sm text-muted-foreground">
                  Admin adds SPN credentials to FireFly via BYOD settings, maps
                  workspaces to SPNs, validates connections, and configures storage.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-purple-500 py-2">
                <h4 className="font-semibold mb-2">5. Member Management</h4>
                <p className="text-sm text-muted-foreground">
                  Admin adds users as members in FireFly, creates user SPNs in Databricks
                  (manual), maps users to SPNs in FireFly, and adds users to the
                  Databricks group (manual) for data access.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Organization Creation Sequence Section */}
        <Section id="org-creation" title="Organization Creation Sequence">
          <ContentBlock>
            <p className="mb-4">
              This sequence diagram shows the detailed flow for creating a new
              organization, including both automated and manual steps.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={orgCreationSequence} id="org-creation-seq" />

          <Section id="creation-api" title="Creation API Details">
            <CodeBlock title="POST /api/admin/organizations">
{`{
  "name": "Acme Corporation",     // Required
  "slug": "acme-corp",            // Optional (auto-generated from name)
  "workspaceUrl": "https://acme.cloud.databricks.com",  // Optional
  "ssoEnabled": true              // Optional (default: true)
}

// Response
{
  "id": "org_1706123456_abc123",
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "workspaceUrl": "https://acme.cloud.databricks.com",
  "ssoEnabled": true,
  "createdAt": "2024-01-24T12:00:00Z"
}`}
            </CodeBlock>
          </Section>
        </Section>

        {/* Member Onboarding Section */}
        <Section id="member-onboarding" title="Member Onboarding Sequence">
          <ContentBlock>
            <p className="mb-4">
              This sequence diagram shows the complete flow for adding a user to
              an organization and granting them access to Databricks resources.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={memberOnboarding} id="member-onboarding-seq" />

          <Section id="member-roles" title="Member Roles">
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Owner</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Full administrative access</li>
                  <li>Can manage organization settings</li>
                  <li>Can add/remove other owners</li>
                  <li>Can delete the organization</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Admin</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Can manage members</li>
                  <li>Can configure settings</li>
                  <li>Cannot delete organization</li>
                  <li>Cannot manage owners</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Member</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Basic access to org features</li>
                  <li>Can view data and run queries</li>
                  <li>Cannot manage other users</li>
                  <li>Cannot modify settings</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* Authentication Flow Section */}
        <Section id="authentication-flow" title="SSO-SPN Authentication Flow">
          <ContentBlock>
            <p className="mb-4">
              This diagram shows how users authenticate via SSO and how their
              requests are authorized using the organization&apos;s Service Principal.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={authFlow} id="auth-flow-seq" />

          <HighlightBox variant="note" title="Key Authentication Points">
            <ul className="list-disc pl-5 space-y-1">
              <li>Users authenticate via Okta (or other OIDC provider) - no Databricks account needed</li>
              <li>Organization selection stores activeOrganizationId in session</li>
              <li>All Databricks API calls use the organization&apos;s SPN credentials</li>
              <li>SPN tokens are cached and refreshed automatically</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* API Reference Section */}
        <Section id="api-reference" title="API Reference">
          <ContentBlock>
            <p className="mb-4">
              These are the key API endpoints for organization management.
            </p>
          </ContentBlock>

          <Section id="admin-apis" title="Admin APIs">
            <ContentBlock>
              <p className="text-sm text-muted-foreground mb-4">
                Require admin access (@databricks.com email)
              </p>
            </ContentBlock>

            <div className="space-y-2 font-mono text-sm">
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-green-600 font-semibold">GET</span> /api/admin/organizations - List all organizations
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/admin/organizations - Create organization
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/admin/update-organization - Update organization
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
            </div>
          </Section>

          <Section id="byod-apis" title="BYOD Configuration APIs">
            <div className="space-y-2 font-mono text-sm">
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-green-600 font-semibold">GET</span> /api/sso-spn/byod/databricks/spns - List SPNs
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/sso-spn/byod/databricks/spns - Add SPN
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-green-600 font-semibold">GET</span> /api/sso-spn/byod/databricks/workspaces - List workspaces
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/sso-spn/byod/databricks/workspaces - Add workspace
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <span className="text-blue-600 font-semibold">POST</span> /api/sso-spn/byod/databricks/workspaces/validate - Validate workspace
              </div>
            </div>
          </Section>

          <Section id="frontend-pages" title="Frontend Locations">
            <div className="space-y-2 font-mono text-sm">
              <div className="p-3 bg-gray-50 rounded border">
                /admin/organizations - Manage organizations
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                /admin/organizations/[slug] - Manage org members
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                /admin/users - Manage users and SCIM mapping
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                /sso-spn/[orgId]/settings/bring-your-own-data - BYOD configuration
              </div>
            </div>
          </Section>
        </Section>

        {/* Conclusion Section */}
        <Section id="conclusion" title="Key Takeaways">
          <ContentBlock>
            <p className="mb-4">
              Understanding the organization model is essential for proper
              platform administration. Here are the key points to remember:
            </p>
          </ContentBlock>

          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">1</div>
              <div>
                <h4 className="font-semibold">Organizations are Multi-Tenancy Units</h4>
                <p className="text-sm text-muted-foreground">
                  Each org has isolated members, SPNs, and configurations
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-semibold shrink-0">2</div>
              <div>
                <h4 className="font-semibold">Creation is Partially Automated</h4>
                <p className="text-sm text-muted-foreground">
                  FireFly DB records are created via API, but Databricks resources require manual setup
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold shrink-0">3</div>
              <div>
                <h4 className="font-semibold">Service Principals are Per-Organization</h4>
                <p className="text-sm text-muted-foreground">
                  Stored in byodDatabricksSpns and used for all Databricks API calls
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-semibold shrink-0">4</div>
              <div>
                <h4 className="font-semibold">Users Authenticate via SSO</h4>
                <p className="text-sm text-muted-foreground">
                  But API calls use the organization&apos;s SPN credentials
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">5</div>
              <div>
                <h4 className="font-semibold">Unity Catalog Access is Group-Based</h4>
                <p className="text-sm text-muted-foreground">
                  Users must be added to the Databricks group (manual step)
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-6 rounded-lg text-white mt-8">
            <h3 className="font-bold text-2xl mb-2">Full Automation Roadmap</h3>
            <p className="mb-4">
              To fully automate organization setup, the following APIs would need
              to be integrated: Databricks Account API for SPN creation, SCIM API
              for group management, and Unity Catalog APIs for permissions.
            </p>
            <a
              href="/docs/architecture/authentication/databricks-identity"
              className="inline-block bg-white text-blue-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Learn About Authentication
            </a>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

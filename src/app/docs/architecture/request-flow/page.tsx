import { promises as fs } from "fs";
import path from "path";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import {
  Section,
  SectionContainer,
  ContentBlock,
  HighlightBox,
} from "@/components/docs/section";

async function loadMermaidFile(filename: string): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "public/architecture/request-flow",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function RequestFlowPage() {
  // Load all mermaid diagrams
  const highLevelOverview = await loadMermaidFile("00-high-level-overview.mermaid");
  const apiRequestSequence = await loadMermaidFile("01-api-request-sequence.mermaid");
  const unityCatalogFlow = await loadMermaidFile("02-unity-catalog-flow.mermaid");
  const fileUploadFlow = await loadMermaidFile("03-file-upload-flow.mermaid");
  const servicePrincipalFlow = await loadMermaidFile("04-service-principal-flow.mermaid");
  const sqlExecutionFlow = await loadMermaidFile("05-sql-execution-flow.mermaid");
  const databaseInteractions = await loadMermaidFile("06-database-interactions.mermaid");
  const completeLifecycle = await loadMermaidFile("07-complete-request-lifecycle.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Architecture / Request Flow
          </div>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-orange-500 to-yellow-500 bg-clip-text text-transparent">
            Request Flow Architecture
          </h1>
          <p className="text-xl text-muted-foreground">
            A comprehensive guide to how data flows through FireFly Analytics
            using Service Principal (SPN) authentication. Users authenticate via
            any OAuth 2.0/OIDC provider (Okta in our case), while all Databricks
            API calls use organization-specific Service Principals.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              FireFly Analytics acts as a secure intermediary between users and
              the Databricks platform. The architecture uses a two-layer authentication
              model: users authenticate via any OAuth 2.0/OIDC provider (Okta in FireFly&apos;s
              case), while all Databricks API calls use organization-specific
              Service Principals (SPN).
            </p>
            <p className="mb-6">
              This document describes the complete request lifecycle, including
              user session validation, SPN token management, and API proxying to
              various Databricks services.
            </p>
          </ContentBlock>

          <HighlightBox variant="note" title="OAuth 2.0 / OIDC Compatible">
            <p className="text-sm">
              While this documentation references <strong>Okta</strong> as the identity provider,
              the architecture is designed to work with <strong>any OAuth 2.0 or OIDC-compliant provider</strong> including
              Azure AD, Auth0, Google, Keycloak, or custom OIDC servers. The user authentication
              layer is decoupled from the Databricks SPN authentication, making it easy to swap providers.
            </p>
          </HighlightBox>

          <HighlightBox variant="success" title="SSO-SPN Authentication Model">
            <p className="mb-2 text-sm">Users authenticate via OAuth 2.0/OIDC (e.g., Okta), but Databricks operations use Service Principals:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Users don&apos;t need individual Databricks accounts</li>
              <li>Centralized permission management via SPN per organization</li>
              <li>Clear audit trail with organization-level access control</li>
              <li>Simplified onboarding - just add users to your identity provider</li>
            </ul>
          </HighlightBox>

          <HighlightBox variant="info" title="Key Components">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>FireFly Frontend</strong>: React/Next.js application with TanStack Query for data fetching</li>
              <li><strong>Next.js API Routes</strong>: Server-side endpoints that handle all Databricks communication</li>
              <li><strong>Better-Auth</strong>: Authentication framework managing user sessions</li>
              <li><strong>PostgreSQL</strong>: Persistent storage for sessions, SPN credentials, and application data</li>
              <li><strong>OAuth 2.0/OIDC Provider</strong>: Any compliant IDP for user authentication (Okta, Azure AD, Auth0, etc.)</li>
              <li><strong>Service Principal</strong>: Databricks service principal for API authentication (per organization)</li>
              <li><strong>Databricks APIs</strong>: Unity Catalog, SQL, DBFS, and other platform services</li>
            </ul>
          </HighlightBox>

          <Section id="high-level-architecture" title="High-Level Architecture">
            <ContentBlock>
              <p className="mb-4">
                The following diagram shows the high-level request flow through
                all system components. Notice how the frontend never directly
                communicates with Databricks - all requests are proxied through
                the Next.js backend.
              </p>
            </ContentBlock>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <MermaidDiagram chart={highLevelOverview} id="high-level-overview" />
            </div>

            <div className="mt-6">
              <h4 className="font-semibold mb-4">Request Flow Steps:</h4>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">1</div>
                  <div>
                    <p className="text-sm"><strong>API Request</strong>: Frontend sends request to Next.js API route</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">2</div>
                  <div>
                    <p className="text-sm"><strong>Validate User Session</strong>: Better-Auth validates the session cookie</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">3</div>
                  <div>
                    <p className="text-sm"><strong>Lookup Session</strong>: Query PostgreSQL for session and user data</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">4</div>
                  <div>
                    <p className="text-sm"><strong>Verify OIDC Token</strong>: Validate user&apos;s SSO token if needed</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">5</div>
                  <div>
                    <p className="text-sm"><strong>Get SPN Credentials</strong>: Retrieve organization&apos;s Service Principal config</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">6</div>
                  <div>
                    <p className="text-sm"><strong>Read Encrypted SPN</strong>: Get encrypted SPN credentials from database</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">7</div>
                  <div>
                    <p className="text-sm"><strong>Get/Refresh SPN Token</strong>: Exchange credentials for Databricks access token</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">8</div>
                  <div>
                    <p className="text-sm"><strong>Make API Call</strong>: Call Databricks API with SPN bearer token</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">9</div>
                  <div>
                    <p className="text-sm"><strong>Response</strong>: Databricks returns data (Unity Catalog, SQL, etc.)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-semibold shrink-0">10</div>
                  <div>
                    <p className="text-sm"><strong>Return Data</strong>: API route returns response to frontend</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>User Auth (OIDC)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span>SPN Token</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span>Databricks API</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span>Response</span>
                </div>
              </div>
            </div>
          </Section>
        </Section>

        {/* API Request Flow Section */}
        <Section id="api-request-flow" title="API Request Flow">
          <ContentBlock>
            <p className="mb-4">
              Every API request from the frontend goes through a standardized
              flow that handles authentication, token management, and error
              handling. This ensures consistent security and user experience
              across all operations.
            </p>
          </ContentBlock>

          <Section id="request-sequence" title="Request Sequence Diagram">
            <ContentBlock>
              <p className="mb-6">
                The following sequence diagram shows the detailed flow of a
                typical API request, including user session validation via your
                OIDC provider and SPN token retrieval for Databricks API calls.
              </p>
            </ContentBlock>
            <MermaidDiagram chart={apiRequestSequence} id="api-request-sequence" />
          </Section>

          <Section id="request-phases" title="Request Phases">
            <div className="space-y-4">
              <div className="pl-4 border-l-4 border-blue-500 py-2">
                <h4 className="font-semibold mb-2">1. User Session Validation Phase</h4>
                <p className="text-sm text-muted-foreground">
                  Every request begins with user session validation. The session cookie
                  is extracted and verified against the database. The user&apos;s OIDC token
                  is validated if needed. Invalid or expired sessions redirect to the identity provider login.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">2. SPN Token Retrieval Phase</h4>
                <p className="text-sm text-muted-foreground">
                  Once the user session is validated, the organization&apos;s Service Principal
                  credentials are retrieved from the database. If the SPN access token
                  is missing or expired, a new token is obtained from Databricks using
                  the client_credentials grant and cached for future requests.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-purple-500 py-2">
                <h4 className="font-semibold mb-2">3. Databricks API Call Phase</h4>
                <p className="text-sm text-muted-foreground">
                  With a valid SPN access token, the request is forwarded to the
                  appropriate Databricks API. The SPN&apos;s permissions determine what
                  data the user can access.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-orange-500 py-2">
                <h4 className="font-semibold mb-2">4. Response Handling Phase</h4>
                <p className="text-sm text-muted-foreground">
                  The API response is transformed as needed and sent back to the
                  frontend. TanStack Query caches the response client-side for
                  subsequent requests.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Unity Catalog Flow Section */}
        <Section id="unity-catalog-flow" title="Unity Catalog API Flow">
          <ContentBlock>
            <p className="mb-4">
              Unity Catalog operations are among the most common API calls in
              FireFly Analytics. Users browse catalogs, schemas, tables, and
              preview data - all through a consistent request pattern.
            </p>
          </ContentBlock>

          <HighlightBox variant="note" title="Unity Catalog Operations">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>List Catalogs</strong>: GET /api/2.1/unity-catalog/catalogs</li>
              <li><strong>List Schemas</strong>: GET /api/2.1/unity-catalog/schemas</li>
              <li><strong>List Tables</strong>: GET /api/2.1/unity-catalog/tables</li>
              <li><strong>Get Table Details</strong>: GET /api/2.1/unity-catalog/tables/{"{full_name}"}</li>
              <li><strong>Preview Data</strong>: Uses Statement Execution API for samples</li>
            </ul>
          </HighlightBox>

          <Section id="catalog-sequence" title="Catalog Browsing Sequence">
            <ContentBlock>
              <p className="mb-6">
                This diagram shows the complete flow for browsing the Unity Catalog
                hierarchy, from listing catalogs to previewing table data.
              </p>
            </ContentBlock>
            <MermaidDiagram chart={unityCatalogFlow} id="unity-catalog-flow" />
          </Section>

          <Section id="catalog-caching" title="Catalog Caching Strategy">
            <ContentBlock>
              <p className="mb-4">
                Catalog metadata is cached at multiple levels to improve performance:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Server-Side Caching</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>unstable_cache with catalog tags</li>
                  <li>Revalidated on schema changes</li>
                  <li>Shared across all users</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Client-Side Caching</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>TanStack Query with staleTime</li>
                  <li>Refetch on window focus</li>
                  <li>Per-user cache isolation</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* File Upload Flow Section */}
        <Section id="file-upload-flow" title="File Upload Flow">
          <ContentBlock>
            <p className="mb-4">
              File uploads to Databricks (DBFS or Unity Catalog Volumes) follow
              a streaming pattern that handles both small and large files
              efficiently without overwhelming server memory.
            </p>
          </ContentBlock>

          <HighlightBox variant="warning" title="Upload Considerations">
            <ul className="list-disc pl-5 space-y-1">
              <li>Small files (&lt;10MB): Single PUT request</li>
              <li>Large files (&gt;10MB): Chunked upload with progress tracking</li>
              <li>All uploads are streamed to avoid memory issues</li>
              <li>Upload metadata stored in PostgreSQL for audit trail</li>
            </ul>
          </HighlightBox>

          <Section id="upload-sequence" title="Upload Sequence Diagram">
            <ContentBlock>
              <p className="mb-6">
                The following diagram shows both small and large file upload
                patterns, including chunked uploads for large datasets.
              </p>
            </ContentBlock>
            <MermaidDiagram chart={fileUploadFlow} id="file-upload-flow" />
          </Section>
        </Section>

        {/* Service Principal Flow Section */}
        <Section id="service-principal-flow" title="Service Principal Authentication">
          <ContentBlock>
            <p className="mb-4">
              FireFly Analytics uses a two-layer authentication model: users
              authenticate via any OAuth 2.0/OIDC provider (Okta in our case), while all Databricks operations use
              organization-specific Service Principals. This separation provides
              maximum security and flexibility.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="Benefits of SSO-SPN Architecture">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>No Databricks accounts needed</strong>: Users only need their OIDC provider credentials</li>
              <li><strong>Centralized permissions</strong>: SPN permissions apply to all org users</li>
              <li><strong>Clear audit trail</strong>: All API calls traced to organization SPN</li>
              <li><strong>Simplified management</strong>: One SPN per organization to manage</li>
              <li><strong>Consistent access</strong>: All users in an org have same Databricks access</li>
              <li><strong>Easy onboarding</strong>: Add user to your identity provider, they immediately have access</li>
            </ul>
          </HighlightBox>

          <Section id="spn-sequence" title="SPN Authentication Sequence">
            <ContentBlock>
              <p className="mb-6">
                This diagram shows the complete flow: user authentication via your
                OIDC provider is validated first, then the organization&apos;s Service Principal token
                is used for all Databricks API calls.
              </p>
            </ContentBlock>
            <MermaidDiagram chart={servicePrincipalFlow} id="service-principal-flow" />
          </Section>

          <Section id="spn-token-caching" title="SPN Token Caching">
            <ContentBlock>
              <p className="mb-4">
                Service Principal tokens are cached to avoid unnecessary token
                exchanges. The caching strategy includes:
              </p>
              <ul className="list-disc pl-6 mb-6 space-y-2">
                <li>
                  <strong>In-memory cache</strong>: Fast lookup for active requests
                </li>
                <li>
                  <strong>Database backup</strong>: Encrypted tokens stored in PostgreSQL
                </li>
                <li>
                  <strong>Proactive refresh</strong>: Tokens refreshed 5 minutes before expiry
                </li>
                <li>
                  <strong>Per-organization isolation</strong>: Each org has its own SPN token
                </li>
              </ul>
            </ContentBlock>
          </Section>
        </Section>

        {/* SQL Execution Flow Section */}
        <Section id="sql-execution-flow" title="SQL Execution Flow">
          <ContentBlock>
            <p className="mb-4">
              SQL query execution uses the Databricks Statement Execution API,
              which supports both synchronous (short queries) and asynchronous
              (long-running queries) execution patterns.
            </p>
          </ContentBlock>

          <Section id="sql-sequence" title="SQL Execution Sequence">
            <ContentBlock>
              <p className="mb-6">
                The following diagram shows the complete SQL execution flow,
                including handling for long-running queries with polling.
              </p>
            </ContentBlock>
            <MermaidDiagram chart={sqlExecutionFlow} id="sql-execution-flow" />
          </Section>

          <Section id="sql-execution-modes" title="Execution Modes">
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-emerald-50">
                <h4 className="font-semibold mb-2 text-green-900">Synchronous Mode</h4>
                <p className="text-sm text-green-800 mb-2">
                  For queries completing within 50 seconds
                </p>
                <ul className="text-sm space-y-1 text-green-700">
                  <li>Single request-response</li>
                  <li>Results returned immediately</li>
                  <li>Simpler client implementation</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-cyan-50">
                <h4 className="font-semibold mb-2 text-blue-900">Asynchronous Mode</h4>
                <p className="text-sm text-blue-800 mb-2">
                  For long-running analytical queries
                </p>
                <ul className="text-sm space-y-1 text-blue-700">
                  <li>Statement ID returned immediately</li>
                  <li>Client polls for status/results</li>
                  <li>Supports query cancellation</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* Database Interactions Section */}
        <Section id="database-interactions" title="Database Interactions">
          <ContentBlock>
            <p className="mb-4">
              PostgreSQL serves as the central data store for all authentication
              and application data. Understanding the database interaction
              patterns is crucial for performance optimization.
            </p>
          </ContentBlock>

          <Section id="database-schema" title="Database Schema Overview">
            <MermaidDiagram chart={databaseInteractions} id="database-interactions" />
          </Section>
        </Section>

        {/* Complete Request Lifecycle Section */}
        <Section id="complete-lifecycle" title="Complete Request Lifecycle">
          <ContentBlock>
            <p className="mb-4">
              This comprehensive diagram shows the complete lifecycle of a
              request from user action to rendered response, including Okta
              user validation, SPN token management, and caching layers.
            </p>
          </ContentBlock>

          <MermaidDiagram chart={completeLifecycle} id="complete-lifecycle" />

          <Section id="lifecycle-summary" title="Lifecycle Summary">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">1</div>
                <div>
                  <h4 className="font-semibold">User Action</h4>
                  <p className="text-sm text-muted-foreground">
                    User interacts with the FireFly UI (click, form submit, etc.)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-semibold shrink-0">2</div>
                <div>
                  <h4 className="font-semibold">User Session Validation (OIDC)</h4>
                  <p className="text-sm text-muted-foreground">
                    Session cookie verified against PostgreSQL, OIDC token validated if needed
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-semibold shrink-0">3</div>
                <div>
                  <h4 className="font-semibold">SPN Token Retrieval</h4>
                  <p className="text-sm text-muted-foreground">
                    Organization&apos;s Service Principal token retrieved from cache or refreshed via Databricks OAuth
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-semibold shrink-0">4</div>
                <div>
                  <h4 className="font-semibold">Databricks API Call</h4>
                  <p className="text-sm text-muted-foreground">
                    Request proxied to Databricks with SPN bearer token
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">5</div>
                <div>
                  <h4 className="font-semibold">Response & Caching</h4>
                  <p className="text-sm text-muted-foreground">
                    Response cached (server and client), UI updated
                  </p>
                </div>
              </div>
            </div>
          </Section>
        </Section>

        {/* Error Handling Section */}
        <Section id="error-handling" title="Error Handling">
          <ContentBlock>
            <p className="mb-4">
              Errors can occur at any stage of the request flow. The system
              implements consistent error handling to provide meaningful
              feedback to users while protecting sensitive information.
            </p>
          </ContentBlock>

          <div className="space-y-4">
            <HighlightBox variant="danger" title="Authentication Errors">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>401 Unauthorized</strong>: Session invalid or expired - redirect to login</li>
                <li><strong>403 Forbidden</strong>: User lacks permission - show access denied</li>
                <li><strong>Token Refresh Failed</strong>: Clear session, force re-authentication</li>
              </ul>
            </HighlightBox>

            <HighlightBox variant="warning" title="Databricks API Errors">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>400 Bad Request</strong>: Invalid query syntax - show error message</li>
                <li><strong>404 Not Found</strong>: Resource doesn&apos;t exist - show helpful message</li>
                <li><strong>429 Rate Limited</strong>: Implement backoff and retry</li>
                <li><strong>500+ Server Error</strong>: Show generic error, log details</li>
              </ul>
            </HighlightBox>

            <HighlightBox variant="info" title="Client-Side Error Handling">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>TanStack Query automatic retries (3 attempts by default)</li>
                <li>Error boundaries for component-level failures</li>
                <li>Toast notifications for transient errors</li>
                <li>Error pages for unrecoverable failures</li>
              </ul>
            </HighlightBox>
          </div>
        </Section>

        {/* Conclusion Section */}
        <Section id="conclusion" title="Conclusion">
          <ContentBlock>
            <p className="mb-4">
              The SSO-SPN request flow architecture ensures secure, performant, and
              reliable communication between FireFly Analytics and Databricks.
              Every request follows these 4 high-level steps:
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="border-2 border-blue-500 rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">1</div>
                <h3 className="font-semibold text-blue-900">User Session Validation</h3>
              </div>
              <p className="text-sm text-blue-800">
                Validate session cookie and verify user&apos;s OIDC token.
                Users authenticate via your identity provider - no Databricks account needed.
              </p>
            </div>

            <div className="border-2 border-green-500 rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">2</div>
                <h3 className="font-semibold text-green-900">SPN Token Retrieval</h3>
              </div>
              <p className="text-sm text-green-800">
                Get organization&apos;s Service Principal credentials from database.
                Refresh SPN token via Databricks OAuth if expired.
              </p>
            </div>

            <div className="border-2 border-purple-500 rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold">3</div>
                <h3 className="font-semibold text-purple-900">Databricks API Call</h3>
              </div>
              <p className="text-sm text-purple-800">
                Make API request to Databricks with SPN bearer token.
                Access Unity Catalog, SQL, DBFS, and other services.
              </p>
            </div>

            <div className="border-2 border-orange-500 rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold">4</div>
                <h3 className="font-semibold text-orange-900">Response & Caching</h3>
              </div>
              <p className="text-sm text-orange-800">
                Return data to frontend with server and client caching.
                TanStack Query manages client-side cache invalidation.
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-orange-500 to-yellow-500 p-6 rounded-lg text-white mt-8">
            <h3 className="font-bold text-2xl mb-2">Explore More</h3>
            <p className="mb-4">
              Learn about other aspects of the FireFly Analytics architecture.
            </p>
            <div className="flex gap-4">
              <a
                href="/docs/architecture/authentication/databricks-identity"
                className="inline-block bg-white text-orange-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Authentication Docs
              </a>
              <a
                href="/docs/architecture/lakehouse-apps-proxy"
                className="inline-block bg-white/20 text-white border border-white px-6 py-2 rounded-lg font-semibold hover:bg-white/30 transition-colors"
              >
                Apps Proxy Docs
              </a>
            </div>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

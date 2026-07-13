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
import Link from "next/link";

async function loadMermaidFile(filename: string): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "public/solutions/data-catalog",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function DataCatalogPage() {
  const architecture = await loadMermaidFile("architecture.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            <Link href="/docs/solutions" className="hover:text-foreground">
              Solutions
            </Link>
          </div>
          <PageTitle>Data Catalog</PageTitle>
          <p className="text-xl text-muted-foreground">
            A hierarchical browser for Unity Catalog, allowing users to explore
            catalogs, schemas, tables, and columns with a modern, intuitive interface.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              The Data Catalog provides a native React interface for browsing Unity Catalog
              metadata. It features a hierarchical tree view that loads data on-demand as
              users expand nodes, with client-side caching for performance.
            </p>
            <p className="mb-4">
              Like the SQL Editor, the Data Catalog is implemented as a native component
              rather than an iframe, enabling tight integration with other features like
              SQL autocomplete and pipeline node configuration. All API calls use the{" "}
              <Link href="/docs/architecture/authentication/sso-mapped-spn" className="text-blue-600 hover:underline">
                SSO-SPN authentication pattern
              </Link>.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Benefits">
            <ul className="list-disc pl-5 space-y-1">
              <li>Hierarchical navigation (Catalogs → Schemas → Tables → Columns)</li>
              <li>Lazy loading for fast initial render</li>
              <li>Client-side caching to minimize API calls</li>
              <li>Integration with SQL Editor for autocomplete</li>
              <li>Support for BYOD (Bring Your Own Data) Delta Sharing catalogs</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* How It Works Section */}
        <Section id="how-it-works" title="How It Works">
          <ContentBlock>
            <p className="mb-4">
              The Data Catalog fetches Unity Catalog metadata through Next.js API routes.
              Each level of the hierarchy has a dedicated endpoint, and metadata is loaded
              on-demand when users expand tree nodes.
            </p>
          </ContentBlock>

          <Section id="architecture-diagram" title="Architecture">
            <MermaidDiagram chart={architecture} id="data-catalog-architecture" />
          </Section>

          <Section id="lazy-loading" title="Lazy Loading Strategy">
            <ContentBlock>
              <p className="mb-4">
                The tree view uses a lazy loading strategy to ensure fast initial render
                and efficient API usage:
              </p>
            </ContentBlock>

            <ol className="list-decimal pl-6 space-y-3">
              <li>
                <strong>Initial load</strong>: Only top-level catalogs are fetched
              </li>
              <li>
                <strong>Expand catalog</strong>: Schemas for that catalog are fetched
              </li>
              <li>
                <strong>Expand schema</strong>: Tables in that schema are fetched
              </li>
              <li>
                <strong>Select table</strong>: Column details are fetched and displayed
              </li>
              <li>
                <strong>Cache hit</strong>: If data is already cached, no API call is made
              </li>
            </ol>
          </Section>
        </Section>

        {/* User Experience Section */}
        <Section id="user-experience" title="User Experience">
          <ContentBlock>
            <p className="mb-4">
              The Data Catalog features a two-panel interface with tree navigation
              on the left and detailed metadata display on the right.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="Features">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Hierarchical tree view (Catalogs → Schemas → Tables → Columns)</li>
              <li>Expand/collapse nodes with click or keyboard navigation</li>
              <li>Detailed metadata panel showing column names, types, and descriptions</li>
              <li>Two view modes: compact (editor sidebar) and full (dedicated page)</li>
              <li>Client-side caching to prevent redundant API calls</li>
              <li>Search/filter within each level of the hierarchy</li>
              <li>Quick copy of fully-qualified table names</li>
            </ul>
          </HighlightBox>

          <Section id="metadata-display" title="Metadata Display">
            <ContentBlock>
              <p className="mb-4">
                When a table is selected, the metadata panel shows detailed information:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Table Information</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><strong>Name</strong>: Full three-level name (catalog.schema.table)</li>
                  <li><strong>Type</strong>: MANAGED, EXTERNAL, or VIEW</li>
                  <li><strong>Format</strong>: DELTA, PARQUET, CSV, etc.</li>
                  <li><strong>Location</strong>: Storage path (for external tables)</li>
                  <li><strong>Owner</strong>: User or group that owns the table</li>
                  <li><strong>Comment</strong>: Table description if provided</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Column Details</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><strong>Name</strong>: Column identifier</li>
                  <li><strong>Type</strong>: Data type (STRING, INT, TIMESTAMP, etc.)</li>
                  <li><strong>Nullable</strong>: Whether NULL values are allowed</li>
                  <li><strong>Comment</strong>: Column description if provided</li>
                  <li><strong>Partition</strong>: Whether column is a partition key</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* Backend Architecture Section */}
        <Section id="backend-architecture" title="Backend Architecture">
          <ContentBlock>
            <p className="mb-4">
              The Data Catalog uses Unity Catalog REST APIs through Next.js API routes.
              Each level of the hierarchy has a dedicated endpoint.
            </p>
          </ContentBlock>

          <Section id="api-routes" title="API Routes">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">Route</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Description</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Databricks API</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/unity-catalog/catalogs</code></td>
                    <td className="border border-gray-200 px-4 py-2">List all accessible catalogs</td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">GET /api/2.1/unity-catalog/catalogs</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/unity-catalog/schemas</code></td>
                    <td className="border border-gray-200 px-4 py-2">List schemas in a catalog</td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">GET /api/2.1/unity-catalog/schemas</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/unity-catalog/tables</code></td>
                    <td className="border border-gray-200 px-4 py-2">List tables in a schema</td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">GET /api/2.1/unity-catalog/tables</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/unity-catalog/table-details</code></td>
                    <td className="border border-gray-200 px-4 py-2">Get column details for a table</td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">GET /api/2.1/unity-catalog/tables/{"{name}"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="caching" title="Client-Side Caching">
            <ContentBlock>
              <p className="mb-4">
                The Data Catalog maintains a client-side cache to avoid redundant API calls.
                This cache is shared across components, enabling the SQL Editor to use
                cached metadata for autocomplete.
              </p>
            </ContentBlock>

            <CodeBlock>
{`// Catalog metadata cache structure
interface CatalogMetadataCache {
  [catalogName: string]: {
    schemas?: Schema[];
    [schemaName: string]: {
      tables?: Table[];
      [tableName: string]: {
        columns?: Column[];
      };
    };
  };
}

// Example: Load schemas with caching
const handleExpandCatalog = async (catalogName: string) => {
  // Check cache first
  if (catalogCache[catalogName]?.schemas) {
    return; // Already loaded
  }

  // Fetch from API
  const response = await fetch(
    \`/api/databricks/unity-catalog/schemas?catalog_name=\${catalogName}\`
  );
  const { schemas } = await response.json();

  // Update cache
  setCatalogCache(prev => ({
    ...prev,
    [catalogName]: { ...prev[catalogName], schemas }
  }));
};`}
            </CodeBlock>
          </Section>
        </Section>

        {/* BYOD Integration Section */}
        <Section id="byod-integration" title="BYOD Integration">
          <ContentBlock>
            <p className="mb-4">
              For organizations using Bring Your Own Data (BYOD), the Data Catalog supports
              Delta Sharing catalogs. These are external catalogs shared from other Databricks
              workspaces or providers.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="BYOD Catalog Flow">
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              <li>Organization admin configures Delta Sharing provider in settings</li>
              <li>System validates provider credentials and discovers available shares</li>
              <li>Admin selects which catalogs to mount for their organization</li>
              <li>Users see shared catalogs in the Data Catalog alongside regular catalogs</li>
              <li>Queries against shared catalogs use Delta Sharing protocol</li>
            </ol>
          </HighlightBox>

          <Section id="byod-validation" title="Catalog Validation">
            <CodeBlock>
{`// POST /api/sso-spn/byod/databricks/catalogs
// Validates that Delta Sharing catalogs are properly configured

const validateCatalogs = async (orgId: string) => {
  // Uses global admin SPN to validate Delta Sharing providers
  const adminToken = await getGlobalAdminToken();

  // List providers and their shares
  const providers = await listDeltaSharingProviders(adminToken);

  // Validate each configured catalog still exists
  const validCatalogs = await Promise.all(
    catalogs.map(async (catalog) => {
      const exists = providers.some(
        p => p.sharingCode === catalog.providerCode &&
             p.shares.includes(catalog.shareName)
      );
      return { ...catalog, valid: exists };
    })
  );

  // Update cache with validation status
  await updateCatalogCache(orgId, validCatalogs);

  return validCatalogs;
};`}
            </CodeBlock>
          </Section>
        </Section>

        {/* Enhancement Opportunities Section */}
        <Section id="enhancements" title="Enhancement Opportunities">
          <ContentBlock>
            <p className="mb-4">
              The Data Catalog can be extended with additional features to improve
              data discovery and governance.
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h4 className="font-semibold mb-2 text-blue-900">Full-Text Search</h4>
              <p className="text-sm text-blue-800">
                Add search across all catalog objects (catalogs, schemas, tables, columns)
                to quickly find data assets by name or description.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <h4 className="font-semibold mb-2 text-green-900">Data Lineage</h4>
              <p className="text-sm text-green-800">
                Visualize table dependencies and data flow using Unity Catalog
                lineage APIs to understand how data moves through pipelines.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
              <h4 className="font-semibold mb-2 text-purple-900">Data Preview</h4>
              <p className="text-sm text-purple-800">
                Sample rows from selected tables directly in the catalog interface
                for quick data exploration without writing queries.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
              <h4 className="font-semibold mb-2 text-orange-900">Permissions View</h4>
              <p className="text-sm text-orange-800">
                Display user/group permissions on catalog objects to help users
                understand their access and request additional permissions.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-red-50 to-red-100">
              <h4 className="font-semibold mb-2 text-red-900">Data Quality</h4>
              <p className="text-sm text-red-800">
                Show data quality metrics, freshness indicators, and validation
                status for tables to help users trust their data.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-teal-50 to-teal-100">
              <h4 className="font-semibold mb-2 text-teal-900">Favorites & Tags</h4>
              <p className="text-sm text-teal-800">
                Allow users to bookmark frequently-used tables and add custom
                tags for organization-specific categorization.
              </p>
            </div>
          </div>
        </Section>

        {/* Related Documentation Section */}
        <Section id="related" title="Related Documentation">
          <div className="grid md:grid-cols-2 gap-4">
            <Link
              href="/docs/solutions/sql-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">SQL Editor</h4>
              <p className="text-sm text-muted-foreground">
                Use catalog metadata for query autocomplete
              </p>
            </Link>

            <Link
              href="/docs/architecture/authentication/sso-mapped-spn"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">SSO-Mapped SPN Authentication</h4>
              <p className="text-sm text-muted-foreground">
                Learn how API authentication works
              </p>
            </Link>

            <Link
              href="/docs/solutions/agent"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Agent Panel</h4>
              <p className="text-sm text-muted-foreground">
                Natural-language queries over catalog data via Genie One
              </p>
            </Link>

            <Link
              href="/docs/solutions/pipeline-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Pipeline Editor</h4>
              <p className="text-sm text-muted-foreground">
                Use catalog data for pipeline node configuration
              </p>
            </Link>

            <Link
              href="/docs/architecture/iam/organizations"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Organizations</h4>
              <p className="text-sm text-muted-foreground">
                Configure BYOD settings for your organization
              </p>
            </Link>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

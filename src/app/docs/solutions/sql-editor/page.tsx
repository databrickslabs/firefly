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
    "public/solutions/sql-editor",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function SQLEditorPage() {
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
          <PageTitle>SQL Editor</PageTitle>
          <p className="text-xl text-muted-foreground">
            A native SQL query interface with warehouse integration, featuring
            multi-tab file editing, streaming results, and a catalog sidebar
            for data exploration.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              Unlike the Notebook and Code Editors which embed Databricks Lakehouse Apps
              via iframe, the SQL Editor is implemented as a <strong>native React component</strong>.
              This provides tighter integration with your application&apos;s UI, state management,
              and user experience.
            </p>
            <p className="mb-4">
              The SQL Editor communicates directly with Databricks SQL Warehouse APIs through
              Next.js API routes. All requests are authenticated using the{" "}
              <Link href="/docs/architecture/authentication/sso-mapped-spn" className="text-blue-600 hover:underline">
                SSO-SPN token acquisition flow
              </Link>, ensuring users never see Databricks login screens.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Why Native Instead of Iframe?">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Custom UI/UX</strong>: Full control over the interface design and interactions</li>
              <li><strong>State Integration</strong>: Share state with other parts of your application</li>
              <li><strong>Feature Control</strong>: Add custom features like saved queries, query history, result export</li>
              <li><strong>Performance</strong>: Direct API calls without iframe overhead</li>
              <li><strong>Catalog Integration</strong>: Tight coupling with the Data Catalog for autocomplete</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* How It Works Section */}
        <Section id="how-it-works" title="How It Works">
          <ContentBlock>
            <p className="mb-4">
              The SQL Editor is a client-side React component that makes API calls to
              Next.js routes, which in turn communicate with Databricks SQL Warehouse APIs.
              The architecture follows a typical React application pattern with TanStack Query
              for data fetching and caching.
            </p>
          </ContentBlock>

          <Section id="architecture-diagram" title="Architecture">
            <MermaidDiagram chart={architecture} id="sql-editor-architecture" />
          </Section>

          <Section id="query-execution-flow" title="Query Execution Flow">
            <ContentBlock>
              <ol className="list-decimal pl-6 space-y-3">
                <li>
                  <strong>User writes SQL</strong> in the Monaco-based editor with syntax
                  highlighting and autocomplete
                </li>
                <li>
                  <strong>Query is submitted</strong> via <code>POST /api/databricks/sql/execute</code>
                  to the selected SQL Warehouse
                </li>
                <li>
                  <strong>Server acquires SPN token</strong> using the user&apos;s mapped credentials
                </li>
                <li>
                  <strong>API returns statement_id</strong> immediately (async execution)
                </li>
                <li>
                  <strong>Client polls for results</strong> via <code>GET /api/databricks/sql/status/{"{id}"}</code>
                </li>
                <li>
                  <strong>Results stream in</strong> and are displayed in the results table
                </li>
              </ol>
            </ContentBlock>
          </Section>
        </Section>

        {/* User Experience Section */}
        <Section id="user-experience" title="User Experience">
          <ContentBlock>
            <p className="mb-4">
              The SQL Editor features a three-panel layout optimized for data exploration
              and query development.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="Features">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Multi-tab file editing with persistence across sessions</li>
              <li>Warehouse selection with real-time status indicator</li>
              <li>Start/stop warehouse controls</li>
              <li>Real-time query execution with streaming results</li>
              <li>Query cancellation for long-running statements</li>
              <li>Catalog sidebar for browsing tables and autocomplete</li>
              <li>Result table with column metadata and row counts</li>
              <li>Keyboard shortcuts (Cmd+Enter to run, Cmd+S to save)</li>
              <li>Syntax highlighting for Spark SQL dialect</li>
              <li>Error highlighting with line number references</li>
            </ul>
          </HighlightBox>

          <Section id="layout" title="Three-Panel Layout">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Left Panel</h4>
                <p className="text-sm text-blue-800">
                  <strong>Catalog Browser</strong>: Hierarchical tree view of catalogs,
                  schemas, and tables. Click to expand, double-click to insert into query.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Top Right Panel</h4>
                <p className="text-sm text-green-800">
                  <strong>Query Editor</strong>: Monaco-based SQL editor with multi-tab
                  support, syntax highlighting, and autocomplete from catalog metadata.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
                <h4 className="font-semibold mb-2 text-purple-900">Bottom Right Panel</h4>
                <p className="text-sm text-purple-800">
                  <strong>Results Table</strong>: Paginated results display with column
                  headers, data types, and row counts. Supports large result sets.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Backend Architecture Section */}
        <Section id="backend-architecture" title="Backend Architecture">
          <ContentBlock>
            <p className="mb-4">
              The SQL Editor uses several API routes that interface with Databricks
              SQL Statement Execution API and SQL Warehouses.
            </p>
          </ContentBlock>

          <Section id="api-routes" title="API Routes">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">Route</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Method</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/sql/execute</code></td>
                    <td className="border border-gray-200 px-4 py-2">POST</td>
                    <td className="border border-gray-200 px-4 py-2">Submit SQL statement for execution</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/sql/status/{"{id}"}</code></td>
                    <td className="border border-gray-200 px-4 py-2">GET</td>
                    <td className="border border-gray-200 px-4 py-2">Poll for query status and results</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/sql/cancel/{"{id}"}</code></td>
                    <td className="border border-gray-200 px-4 py-2">POST</td>
                    <td className="border border-gray-200 px-4 py-2">Cancel a running query</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/warehouses</code></td>
                    <td className="border border-gray-200 px-4 py-2">GET</td>
                    <td className="border border-gray-200 px-4 py-2">List available SQL warehouses</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/warehouses/{"{id}"}/start</code></td>
                    <td className="border border-gray-200 px-4 py-2">POST</td>
                    <td className="border border-gray-200 px-4 py-2">Start a stopped warehouse</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/warehouses/{"{id}"}/stop</code></td>
                    <td className="border border-gray-200 px-4 py-2">POST</td>
                    <td className="border border-gray-200 px-4 py-2">Stop a running warehouse</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="code-example" title="Query Execution Example">
            <CodeBlock>
{`// Execute SQL statement
const executeQuery = async (sql: string, warehouseId: string) => {
  // Submit query (returns immediately with statement_id)
  const response = await fetch("/api/databricks/sql/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      warehouse_id: warehouseId,
      statement: sql,
      wait_timeout: "0s", // Return immediately, poll for results
    }),
  });

  const { statement_id } = await response.json();

  // Poll for results
  const pollResults = async (): Promise<QueryResult> => {
    const status = await fetch(\`/api/databricks/sql/status/\${statement_id}\`);
    const data = await status.json();

    switch (data.status.state) {
      case "SUCCEEDED":
        return {
          columns: data.manifest.schema.columns,
          rows: data.result.data_array,
          rowCount: data.manifest.total_row_count,
        };
      case "FAILED":
        throw new Error(data.status.error.message);
      case "RUNNING":
      case "PENDING":
        await new Promise(r => setTimeout(r, 1000));
        return pollResults();
      default:
        throw new Error(\`Unknown state: \${data.status.state}\`);
    }
  };

  return pollResults();
};`}
            </CodeBlock>
          </Section>

          <Section id="warehouse-management" title="Warehouse Management">
            <ContentBlock>
              <p className="mb-4">
                The SQL Editor includes controls for managing SQL Warehouses, allowing
                users to start stopped warehouses and monitor their status.
              </p>
            </ContentBlock>

            <CodeBlock>
{`// Warehouse selector with status and controls
function WarehouseSelector({ onSelect }) {
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => fetch("/api/databricks/warehouses").then(r => r.json()),
    refetchInterval: 10000, // Poll every 10 seconds for status updates
  });

  const startMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(\`/api/databricks/warehouses/\${id}/start\`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries(["warehouses"]),
  });

  return (
    <Select onValueChange={onSelect}>
      {warehouses?.map(wh => (
        <SelectItem key={wh.id} value={wh.id}>
          <span>{wh.name}</span>
          <Badge variant={wh.state === "RUNNING" ? "success" : "secondary"}>
            {wh.state}
          </Badge>
          {wh.state === "STOPPED" && (
            <Button size="sm" onClick={() => startMutation.mutate(wh.id)}>
              Start
            </Button>
          )}
        </SelectItem>
      ))}
    </Select>
  );
}`}
            </CodeBlock>
          </Section>
        </Section>

        {/* Enhancement Opportunities Section */}
        <Section id="enhancements" title="Enhancement Opportunities">
          <ContentBlock>
            <p className="mb-4">
              The SQL Editor can be extended with additional features to improve
              productivity and collaboration.
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h4 className="font-semibold mb-2 text-blue-900">Query History</h4>
              <p className="text-sm text-blue-800">
                Persist executed queries with timestamps, execution time, and row counts
                for easy re-running and analysis of past queries.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <h4 className="font-semibold mb-2 text-green-900">Saved Queries</h4>
              <p className="text-sm text-green-800">
                Allow users to save, name, and organize frequently-used queries
                into folders for quick access and sharing.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
              <h4 className="font-semibold mb-2 text-purple-900">Result Export</h4>
              <p className="text-sm text-purple-800">
                Export query results to CSV, Excel, or JSON formats for external
                analysis, reporting, and sharing with stakeholders.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
              <h4 className="font-semibold mb-2 text-orange-900">Query Scheduling</h4>
              <p className="text-sm text-orange-800">
                Schedule queries to run at specific times or intervals with result
                delivery via email, Slack, or webhook.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-red-50 to-red-100">
              <h4 className="font-semibold mb-2 text-red-900">Query Explain</h4>
              <p className="text-sm text-red-800">
                Show query execution plans with cost estimates to help users
                optimize their queries before running.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-teal-50 to-teal-100">
              <h4 className="font-semibold mb-2 text-teal-900">Result Visualization</h4>
              <p className="text-sm text-teal-800">
                Add charting capabilities to visualize query results directly
                in the editor without external tools.
              </p>
            </div>
          </div>
        </Section>

        {/* Related Documentation Section */}
        <Section id="related" title="Related Documentation">
          <div className="grid md:grid-cols-2 gap-4">
            <Link
              href="/docs/solutions/data-catalog"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Data Catalog</h4>
              <p className="text-sm text-muted-foreground">
                Browse Unity Catalog metadata for query autocomplete
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
              href="/docs/solutions/notebook-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Notebook Editor</h4>
              <p className="text-sm text-muted-foreground">
                Interactive Python notebooks for data analysis
              </p>
            </Link>

            <Link
              href="/docs/solutions/agent"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Agent Panel</h4>
              <p className="text-sm text-muted-foreground">
                Ask questions over workspace data with Genie One
              </p>
            </Link>

            <Link
              href="/docs/solutions/pipeline-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Pipeline Editor</h4>
              <p className="text-sm text-muted-foreground">
                Visual pipeline design with DLT integration
              </p>
            </Link>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

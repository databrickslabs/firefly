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
    "public/solutions/pipeline-editor",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function PipelineEditorPage() {
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
          <PageTitle>Pipeline Editor</PageTitle>
          <p className="text-xl text-muted-foreground">
            A visual, node-based interface for designing data pipelines. Drag and drop
            nodes, connect them with edges, and execute pipelines against Databricks
            Delta Live Tables.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              The Pipeline Editor provides a no-code/low-code interface for building
              data pipelines. Users can visually design ETL workflows by dragging
              transformation nodes onto a canvas and connecting them to define data flow.
            </p>
            <p className="mb-4">
              Pipelines are stored in the application database and can be executed
              against Databricks Delta Live Tables (DLT) for production workloads.
              The editor integrates with the{" "}
              <Link href="/docs/solutions/data-catalog" className="text-blue-600 hover:underline">
                Data Catalog
              </Link>{" "}
              for table selection and the{" "}
              <Link href="/docs/solutions/sql-editor" className="text-blue-600 hover:underline">
                SQL Editor
              </Link>{" "}
              for custom transformations.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Benefits">
            <ul className="list-disc pl-5 space-y-1">
              <li>Visual pipeline design without writing code</li>
              <li>Drag-and-drop node palette with common transformations</li>
              <li>Real-time execution preview with sample data</li>
              <li>Integration with Databricks Delta Live Tables</li>
              <li>Pipeline sharing and collaboration</li>
              <li>Version history and rollback (enhancement)</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* How It Works Section */}
        <Section id="how-it-works" title="How It Works">
          <ContentBlock>
            <p className="mb-4">
              The Pipeline Editor is built with React Flow for the visual canvas,
              Zustand for state management, and TanStack Query for persistence.
              Pipeline definitions are stored in PostgreSQL and can be executed
              via Databricks DLT APIs.
            </p>
          </ContentBlock>

          <Section id="architecture-diagram" title="Architecture">
            <MermaidDiagram chart={architecture} id="pipeline-editor-architecture" />
          </Section>

          <Section id="data-model" title="Data Model">
            <ContentBlock>
              <p className="mb-4">
                Pipelines are stored as JSON documents containing React Flow nodes
                and edges, along with metadata like name, description, and access
                controls.
              </p>
            </ContentBlock>

            <CodeBlock>
{`-- Pipeline storage schema
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  nodes JSONB NOT NULL,           -- React Flow nodes
  edges JSONB NOT NULL,           -- React Flow edges
  organization_id INTEGER REFERENCES organizations(id),
  created_by_id INTEGER REFERENCES users(id),
  access VARCHAR(50) DEFAULT 'private',  -- private, organization, public
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Example node structure
{
  "id": "source-1",
  "type": "source",
  "position": { "x": 100, "y": 100 },
  "data": {
    "label": "Customer Data",
    "catalog": "main",
    "schema": "sales",
    "table": "customers"
  }
}`}
            </CodeBlock>
          </Section>
        </Section>

        {/* User Experience Section */}
        <Section id="user-experience" title="User Experience">
          <ContentBlock>
            <p className="mb-4">
              The Pipeline Editor features a multi-panel layout with a node palette,
              canvas, properties panel, and execution console.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="Features">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Drag-and-drop node palette with common data transformations</li>
              <li>Visual canvas with zoom, pan, and minimap navigation</li>
              <li>Properties panel for configuring selected nodes</li>
              <li>Edge connections representing data flow between nodes</li>
              <li>Execution console with live output and logs</li>
              <li>Save, rename, and share pipelines</li>
              <li>Parallel sampling for data preview at each stage</li>
              <li>Undo/redo for design changes</li>
            </ul>
          </HighlightBox>

          <Section id="node-types" title="Node Types">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Source Nodes</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>Unity Catalog Table</li>
                  <li>Delta Sharing Table</li>
                  <li>File Upload (CSV, JSON)</li>
                  <li>External Database</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Transform Nodes</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>Select/Project Columns</li>
                  <li>Filter Rows</li>
                  <li>Join Tables</li>
                  <li>Aggregate/Group By</li>
                  <li>Custom SQL</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
                <h4 className="font-semibold mb-2 text-purple-900">Sink Nodes</h4>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>Delta Table</li>
                  <li>Unity Catalog Table</li>
                  <li>File Export</li>
                  <li>Webhook/API</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="canvas-interactions" title="Canvas Interactions">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Mouse Controls</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><strong>Drag from palette</strong>: Add new node</li>
                  <li><strong>Click node</strong>: Select and show properties</li>
                  <li><strong>Drag node</strong>: Reposition on canvas</li>
                  <li><strong>Drag from handle</strong>: Create edge connection</li>
                  <li><strong>Scroll wheel</strong>: Zoom in/out</li>
                  <li><strong>Click + drag canvas</strong>: Pan view</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Keyboard Shortcuts</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><strong>Delete/Backspace</strong>: Remove selected node</li>
                  <li><strong>Cmd+Z</strong>: Undo</li>
                  <li><strong>Cmd+Shift+Z</strong>: Redo</li>
                  <li><strong>Cmd+S</strong>: Save pipeline</li>
                  <li><strong>Cmd+Enter</strong>: Run pipeline</li>
                  <li><strong>Escape</strong>: Deselect</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* Backend Architecture Section */}
        <Section id="backend-architecture" title="Backend Architecture">
          <ContentBlock>
            <p className="mb-4">
              Pipeline definitions are persisted to PostgreSQL with Zustand managing
              the in-memory state. Execution is handled via Databricks Delta Live
              Tables APIs.
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
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/pipelines</code></td>
                    <td className="border border-gray-200 px-4 py-2">GET</td>
                    <td className="border border-gray-200 px-4 py-2">List user&apos;s pipelines</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/pipelines</code></td>
                    <td className="border border-gray-200 px-4 py-2">POST</td>
                    <td className="border border-gray-200 px-4 py-2">Create new pipeline</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/pipelines/{"{id}"}</code></td>
                    <td className="border border-gray-200 px-4 py-2">GET</td>
                    <td className="border border-gray-200 px-4 py-2">Load pipeline definition</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/pipelines/{"{id}"}</code></td>
                    <td className="border border-gray-200 px-4 py-2">PUT</td>
                    <td className="border border-gray-200 px-4 py-2">Save pipeline definition</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/pipelines/{"{id}"}/clone</code></td>
                    <td className="border border-gray-200 px-4 py-2">POST</td>
                    <td className="border border-gray-200 px-4 py-2">Clone pipeline</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/pipelines/{"{id}"}/start</code></td>
                    <td className="border border-gray-200 px-4 py-2">POST</td>
                    <td className="border border-gray-200 px-4 py-2">Trigger DLT execution</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">/api/databricks/pipelines/{"{id}"}/stop</code></td>
                    <td className="border border-gray-200 px-4 py-2">POST</td>
                    <td className="border border-gray-200 px-4 py-2">Stop running pipeline</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="state-management" title="State Management">
            <ContentBlock>
              <p className="mb-4">
                The Pipeline Editor uses Zustand for client-side state management,
                providing a simple API for updating nodes, edges, and selection state.
              </p>
            </ContentBlock>

            <CodeBlock>
{`// Zustand store for pipeline state
import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';

interface PipelineStore {
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;

  // Node operations
  addNode: (node: Node) => void;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
  removeNode: (nodeId: string) => void;

  // Edge operations
  connectNodes: (connection: Connection) => void;
  removeEdge: (edgeId: string) => void;

  // Selection
  selectNode: (node: Node | null) => void;

  // Persistence
  loadPipeline: (pipeline: Pipeline) => void;
  savePipeline: () => Pipeline;
}

const usePipelineStore = create<PipelineStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,

  addNode: (node) => set((state) => ({
    nodes: [...state.nodes, node]
  })),

  updateNodeData: (nodeId, data) => set((state) => ({
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    )
  })),

  connectNodes: (connection) => set((state) => ({
    edges: addEdge(connection, state.edges)
  })),

  selectNode: (node) => set({ selectedNode: node }),

  loadPipeline: (pipeline) => set({
    nodes: pipeline.nodes,
    edges: pipeline.edges,
  }),

  savePipeline: () => ({
    nodes: get().nodes,
    edges: get().edges,
  }),
}));`}
            </CodeBlock>
          </Section>

          <Section id="dlt-execution" title="Delta Live Tables Execution">
            <ContentBlock>
              <p className="mb-4">
                When a pipeline is executed, the visual definition is converted to
                DLT code and submitted to Databricks for processing.
              </p>
            </ContentBlock>

            <CodeBlock>
{`// Convert visual pipeline to DLT code
const convertToDLT = (nodes: Node[], edges: Edge[]): string => {
  const dltCode: string[] = [];

  // Process nodes in topological order
  const sortedNodes = topologicalSort(nodes, edges);

  for (const node of sortedNodes) {
    switch (node.type) {
      case 'source':
        dltCode.push(\`
@dlt.table(name="\${node.data.outputName}")
def \${node.id.replace('-', '_')}():
    return spark.table("\${node.data.catalog}.\${node.data.schema}.\${node.data.table}")
\`);
        break;

      case 'filter':
        const inputNode = getInputNode(node, edges);
        dltCode.push(\`
@dlt.table(name="\${node.data.outputName}")
def \${node.id.replace('-', '_')}():
    return dlt.read("\${inputNode.data.outputName}").filter("\${node.data.condition}")
\`);
        break;

      // ... more node types
    }
  }

  return dltCode.join('\\n');
};`}
            </CodeBlock>
          </Section>
        </Section>

        {/* Enhancement Opportunities Section */}
        <Section id="enhancements" title="Enhancement Opportunities">
          <ContentBlock>
            <p className="mb-4">
              The Pipeline Editor can be extended with additional features to improve
              productivity and enable more advanced use cases.
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h4 className="font-semibold mb-2 text-blue-900">Version History</h4>
              <p className="text-sm text-blue-800">
                Track changes to pipeline definitions over time with ability to
                view diffs, compare versions, and rollback to previous states.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <h4 className="font-semibold mb-2 text-green-900">Real-time Collaboration</h4>
              <p className="text-sm text-green-800">
                Enable multiple users to edit pipelines simultaneously with
                cursors, presence indicators, and conflict resolution.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
              <h4 className="font-semibold mb-2 text-purple-900">Pipeline Templates</h4>
              <p className="text-sm text-purple-800">
                Provide pre-built templates for common patterns like ETL,
                CDC, medallion architecture, and ML feature pipelines.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
              <h4 className="font-semibold mb-2 text-orange-900">Execution Scheduling</h4>
              <p className="text-sm text-orange-800">
                Schedule pipeline runs with cron expressions, dependencies,
                and monitoring with alerts for failures.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-red-50 to-red-100">
              <h4 className="font-semibold mb-2 text-red-900">Data Quality Rules</h4>
              <p className="text-sm text-red-800">
                Add data quality expectations to nodes with automatic validation
                and alerting when constraints are violated.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-teal-50 to-teal-100">
              <h4 className="font-semibold mb-2 text-teal-900">Custom Node Types</h4>
              <p className="text-sm text-teal-800">
                Allow developers to create custom node types with custom UIs
                for organization-specific transformations.
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
                Browse tables for pipeline source configuration
              </p>
            </Link>

            <Link
              href="/docs/solutions/sql-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">SQL Editor</h4>
              <p className="text-sm text-muted-foreground">
                Write custom SQL for transformation nodes
              </p>
            </Link>

            <Link
              href="/docs/solutions/agent"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Agent Panel</h4>
              <p className="text-sm text-muted-foreground">
                Genie Agent chat assistant for pipeline and catalog questions
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
              href="/docs/architecture/request-flow"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Request Flow</h4>
              <p className="text-sm text-muted-foreground">
                Understand how requests flow through the system
              </p>
            </Link>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

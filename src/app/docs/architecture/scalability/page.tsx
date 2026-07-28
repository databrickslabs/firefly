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
    "public/architecture/scalability",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function ScalabilityPage() {
  // Load all mermaid diagrams
  const scalabilityOverview = await loadMermaidFile("00-scalability-overview.mermaid");
  const appScaling = await loadMermaidFile("01-app-scaling.mermaid");
  const serverlessSQL = await loadMermaidFile("02-serverless-sql.mermaid");
  const workspaceIsolation = await loadMermaidFile("03-workspace-isolation.mermaid");
  const databricksAppsIsolation = await loadMermaidFile("04-databricks-apps-isolation.mermaid");
  // Note: caching diagram removed - FireFly doesn't implement caching

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Architecture / Scalability
          </div>
          <PageTitle>Scalability Architecture</PageTitle>
          <p className="text-xl text-muted-foreground">
            A comprehensive guide to how FireFly Analytics scales to handle
            growing workloads, from application tier auto-scaling to Databricks
            Serverless SQL and isolated compute environments.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              FireFly Analytics is designed to scale seamlessly from a handful of
              users to thousands, leveraging cloud-native patterns and Databricks&apos;
              elastic compute capabilities. The platform scales at multiple levels:
              application tier, database tier, and compute tier.
            </p>
            <p className="mb-6">
              This document covers the scalability architecture, including auto-scaling
              patterns, serverless compute, workspace isolation, and Databricks Apps
              that enable high performance at any scale.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="Scalability Highlights">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Application auto-scaling</strong>: Next.js and Go proxy scale horizontally based on demand</li>
              <li><strong>Serverless SQL</strong>: Databricks warehouses scale from 0 to N clusters automatically (nodes per cluster are fixed)</li>
              <li><strong>Isolated compute</strong>: Databricks Apps run in containerized, isolated environments (2 vCPU, 6GB RAM)</li>
              <li><strong>Workspace per organization</strong>: Each organization is configured with its own Databricks workspace by default</li>
              <li><strong>Pay-per-use</strong>: Serverless architecture means you only pay for what you use</li>
            </ul>
          </HighlightBox>

          <Section id="scaling-overview" title="Scaling Architecture Overview">
            <ContentBlock>
              <p className="mb-4">
                The following diagram shows how FireFly scales across all tiers,
                from user traffic through application processing to Databricks compute:
              </p>
            </ContentBlock>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <MermaidDiagram chart={scalabilityOverview} id="scalability-overview" />
            </div>

            <div className="grid md:grid-cols-3 gap-4 mt-6">
              <div className="border-2 border-orange-500 rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
                <h4 className="font-semibold mb-2 text-orange-900">Application Tier</h4>
                <p className="text-sm text-orange-800">
                  Next.js and Go proxy auto-scale based on CPU, memory, and request
                  rate metrics.
                </p>
              </div>
              <div className="border-2 border-green-500 rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Data Tier</h4>
                <p className="text-sm text-green-800">
                  PostgreSQL scales horizontally with read replicas for session
                  and configuration data.
                </p>
              </div>
              <div className="border-2 border-blue-500 rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Databricks Tier</h4>
                <p className="text-sm text-blue-800">
                  Serverless SQL warehouses scale vertically and horizontally.
                  Containerized apps provide isolation between users for the
                  code and notebook editors.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Application Scaling Section */}
        <Section id="app-scaling" title="Application Tier Scaling">
          <ContentBlock>
            <p className="mb-4">
              The application tier consists of Next.js API routes and Go proxy
              servers, both designed for horizontal scaling with zero shared state.
            </p>
          </ContentBlock>

          <Section id="app-scaling-architecture" title="Scaling Architecture">
            <MermaidDiagram chart={appScaling} id="app-scaling" />
          </Section>

          <Section id="nextjs-scaling" title="Next.js Application Scaling">
            <ContentBlock>
              <p className="mb-4">
                Next.js can be deployed in multiple modes, each with different
                scaling characteristics:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Serverless Mode</h4>
                <p className="text-sm text-blue-800 mb-2">
                  Deploy as serverless functions (Vercel, AWS Lambda, Cloud Functions)
                </p>
                <ul className="text-sm space-y-1 text-blue-700">
                  <li>Auto-scales to zero when idle</li>
                  <li>Instant scaling on traffic spikes</li>
                  <li>Pay-per-invocation pricing</li>
                  <li>Cold start latency (~100-500ms)</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Container Mode</h4>
                <p className="text-sm text-green-800 mb-2">
                  Deploy as containers (Kubernetes, ECS, Cloud Run)
                </p>
                <ul className="text-sm space-y-1 text-green-700">
                  <li>Horizontal Pod Autoscaler (HPA)</li>
                  <li>Predictable performance</li>
                  <li>No cold starts with warm pods</li>
                  <li>More control over resources</li>
                </ul>
              </div>
            </div>

            <HighlightBox variant="info" title="Stateless Design">
              <p className="text-sm mb-2">
                Next.js instances are completely stateless, enabling seamless horizontal scaling:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>No in-memory sessions - all sessions stored in PostgreSQL</li>
                <li>No shared state between instances</li>
                <li>Any instance can handle any request</li>
                <li>Load balancer distributes traffic evenly</li>
              </ul>
            </HighlightBox>
          </Section>

          <Section id="proxy-scaling" title="Go Proxy Scaling">
            <ContentBlock>
              <p className="mb-4">
                The Go proxy is optimized for high concurrency and low resource usage:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Resource Efficiency</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Binary size: ~15MB</li>
                  <li>Memory: ~50MB per instance</li>
                  <li>Startup time: &lt;1 second</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Concurrency</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>10,000+ concurrent connections</li>
                  <li>Goroutines for parallelism</li>
                  <li>Efficient WebSocket handling</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Performance</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Token decrypt: &lt;1ms</li>
                  <li>Request latency: &lt;5ms overhead</li>
                  <li>Low GC pause times (&lt;1ms)</li>
                </ul>
              </div>
            </div>

            <CodeBlock title="Kubernetes HPA Configuration">
{`apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: go-proxy-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: go-proxy
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
      - type: Pods
        value: 4
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300`}
            </CodeBlock>
          </Section>
        </Section>

        {/* Serverless SQL Section */}
        <Section id="serverless-sql" title="Databricks Serverless SQL">
          <ContentBlock>
            <p className="mb-4">
              Databricks Serverless SQL Warehouses provide elastic compute that
              automatically scales based on query workload. This is the recommended
              compute option for FireFly Analytics.
            </p>
          </ContentBlock>

          <Section id="serverless-architecture" title="Serverless SQL Architecture">
            <MermaidDiagram chart={serverlessSQL} id="serverless-sql" />
          </Section>

          <Section id="serverless-features" title="Key Features">
            <HighlightBox variant="info" title="Cluster vs Node Scaling">
              <p className="text-sm">
                Serverless SQL scales by adding more <strong>clusters</strong>, not by adding nodes
                to existing clusters. Each warehouse size has a fixed number of nodes per cluster.
                When query load increases, Databricks spins up additional clusters to handle
                concurrent queries.
              </p>
            </HighlightBox>

            <div className="grid md:grid-cols-2 gap-4 mb-6 mt-4">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Cluster Auto-Scaling</h4>
                <p className="text-sm text-blue-800 mb-2">
                  Warehouses scale clusters automatically based on query load:
                </p>
                <ul className="text-sm space-y-1 text-blue-700">
                  <li><strong>Scale to zero</strong>: No charges when idle (0 clusters)</li>
                  <li><strong>Instant scale-up</strong>: ~5 second cold start for new cluster</li>
                  <li><strong>Parallel queries</strong>: Multiple clusters for concurrent users</li>
                  <li><strong>Workload isolation</strong>: Heavy queries get dedicated clusters</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Cost Optimization</h4>
                <p className="text-sm text-green-800 mb-2">
                  Pay only for the compute you actually use:
                </p>
                <ul className="text-sm space-y-1 text-green-700">
                  <li><strong>Per-second billing</strong>: Charges stop when queries complete</li>
                  <li><strong>No idle costs</strong>: Zero charges when scaled to zero</li>
                  <li><strong>Shared infrastructure</strong>: Databricks manages underlying clusters</li>
                  <li><strong>Predictable performance</strong>: SLA-backed query latency</li>
                </ul>
              </div>
            </div>

            <HighlightBox variant="note" title="Warehouse Sizing">
              <p className="text-sm mb-2">
                Choose the right warehouse size based on your workload:
              </p>
              <div className="grid md:grid-cols-4 gap-2 mt-2">
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-xs font-semibold text-gray-600">2X-Small</div>
                  <div className="text-sm">Light queries</div>
                  <div className="text-xs text-muted-foreground">Metadata, LIMIT queries</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-xs font-semibold text-gray-600">Small</div>
                  <div className="text-sm">Standard BI</div>
                  <div className="text-xs text-muted-foreground">Dashboards, reports</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-xs font-semibold text-gray-600">Medium</div>
                  <div className="text-sm">Analytics</div>
                  <div className="text-xs text-muted-foreground">Complex joins, aggregations</div>
                </div>
                <div className="text-center p-2 bg-white rounded">
                  <div className="text-xs font-semibold text-gray-600">Large+</div>
                  <div className="text-sm">Heavy workloads</div>
                  <div className="text-xs text-muted-foreground">Full table scans, ML prep</div>
                </div>
              </div>
            </HighlightBox>
          </Section>

          <Section id="query-optimization" title="Query Performance Tips">
            <div className="space-y-4">
              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">Use LIMIT for Previews</h4>
                <p className="text-sm text-muted-foreground">
                  When previewing data, always use LIMIT to avoid scanning entire tables.
                  FireFly automatically applies LIMIT 1000 for data previews.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-blue-500 py-2">
                <h4 className="font-semibold mb-2">Leverage Delta Lake Caching</h4>
                <p className="text-sm text-muted-foreground">
                  Delta Lake automatically caches frequently accessed data. Repeated
                  queries on the same tables benefit from cached results.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-orange-500 py-2">
                <h4 className="font-semibold mb-2">Filter Early</h4>
                <p className="text-sm text-muted-foreground">
                  Apply WHERE clauses as early as possible in your queries. Predicates
                  on partition columns are especially efficient.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-purple-500 py-2">
                <h4 className="font-semibold mb-2">Select Only Needed Columns</h4>
                <p className="text-sm text-muted-foreground">
                  Avoid SELECT * when possible. Selecting only needed columns reduces
                  data scanned and improves query performance.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Workspace Scaling Section */}
        <Section id="workspace-scaling" title="Workspace Scaling & Isolation">
          <ContentBlock>
            <p className="mb-4">
              By default, FireFly is designed to configure each organization with its own
              dedicated Databricks workspace. This provides the strongest isolation guarantees
              and simplifies access control management.
            </p>
          </ContentBlock>

          <HighlightBox variant="warning" title="Default: One Workspace Per Organization">
            <p className="text-sm mb-2">
              FireFly&apos;s default architecture maps each organization to its own Databricks workspace.
              This design provides:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Complete isolation</strong>: No risk of data leakage between organizations</li>
              <li><strong>Simple auditing</strong>: All activity in a workspace belongs to one org</li>
              <li><strong>Independent scaling</strong>: Each org&apos;s compute is fully separate</li>
              <li><strong>Clear billing</strong>: Costs are naturally separated by workspace</li>
            </ul>
          </HighlightBox>

          <HighlightBox variant="danger" title="Multi-Org Per Workspace (Advanced)" className="mt-4">
            <p className="text-sm mb-2">
              FireFly can be modified to support multiple organizations sharing the same workspace,
              but this requires significant additional safeguards:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Rigorous Unity Catalog permissions</strong>: Catalog-level grants must be carefully managed per SPN</li>
              <li><strong>Enhanced auditing</strong>: Additional logging to track which org accessed what data</li>
              <li><strong>Code review practices</strong>: All changes must be reviewed for potential cross-org data leakage</li>
              <li><strong>SPN isolation</strong>: Each org must still have its own SPN with strict permission boundaries</li>
              <li><strong>Regular security audits</strong>: Periodic reviews to ensure no permission drift</li>
            </ul>
            <p className="text-sm mt-2 text-red-700">
              This configuration is not recommended unless you have specific requirements that necessitate
              shared workspace infrastructure.
            </p>
          </HighlightBox>

          <Section id="workspace-architecture" title="Multi-Workspace Architecture">
            <MermaidDiagram chart={workspaceIsolation} id="workspace-isolation" />
          </Section>

          <Section id="workspace-patterns" title="Common Workspace Patterns">
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Environment Separation</h4>
                <p className="text-sm text-blue-800 mb-2">
                  Separate workspaces for different environments:
                </p>
                <ul className="text-sm space-y-1 text-blue-700">
                  <li><strong>Production</strong>: Business-critical data access</li>
                  <li><strong>Staging</strong>: Pre-production testing</li>
                  <li><strong>Development</strong>: Experimentation and feature dev</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Geographic Distribution</h4>
                <p className="text-sm text-green-800 mb-2">
                  Workspaces in different regions for:
                </p>
                <ul className="text-sm space-y-1 text-green-700">
                  <li><strong>Data residency</strong>: GDPR, data sovereignty</li>
                  <li><strong>Latency</strong>: Users closer to data</li>
                  <li><strong>Disaster recovery</strong>: Cross-region redundancy</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
                <h4 className="font-semibold mb-2 text-orange-900">Team Isolation</h4>
                <p className="text-sm text-orange-800 mb-2">
                  Separate workspaces for different teams:
                </p>
                <ul className="text-sm space-y-1 text-orange-700">
                  <li><strong>Cost allocation</strong>: Chargeback by workspace</li>
                  <li><strong>Access control</strong>: Team-specific permissions</li>
                  <li><strong>Resource limits</strong>: Per-workspace quotas</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
                <h4 className="font-semibold mb-2 text-purple-900">Workload Isolation</h4>
                <p className="text-sm text-purple-800 mb-2">
                  Separate workspaces for different workloads:
                </p>
                <ul className="text-sm space-y-1 text-purple-700">
                  <li><strong>ETL</strong>: Heavy batch processing</li>
                  <li><strong>BI/Analytics</strong>: Interactive queries</li>
                  <li><strong>ML/AI</strong>: GPU-intensive workloads</li>
                </ul>
              </div>
            </div>

            <HighlightBox variant="info" title="Workspace Isolation Guarantees">
              <p className="text-sm mb-2">
                Each Databricks workspace provides strong isolation:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>Network isolation</strong>: Separate VPC/VNet per workspace (optional)</li>
                <li><strong>Compute isolation</strong>: Separate clusters and warehouses</li>
                <li><strong>Storage isolation</strong>: Separate managed storage</li>
                <li><strong>Identity isolation</strong>: Separate user/SPN namespaces</li>
              </ul>
            </HighlightBox>
          </Section>
        </Section>

        {/* Databricks Apps Section */}
        <Section id="databricks-apps" title="Databricks Apps Isolation">
          <ContentBlock>
            <p className="mb-4">
              Databricks Apps (like the VSCode code editor) run in isolated containers,
              providing secure compute for interactive workloads. FireFly
              embeds these apps using the Go proxy for transparent authentication.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Fixed Container Resources">
            <p className="text-sm mb-2">
              All Databricks Apps run with fixed, standardized resources:
            </p>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="bg-white rounded p-2 text-center">
                <div className="text-lg font-semibold text-blue-600">2 vCPU</div>
                <div className="text-xs text-muted-foreground">Processing power</div>
              </div>
              <div className="bg-white rounded p-2 text-center">
                <div className="text-lg font-semibold text-green-600">6 GB RAM</div>
                <div className="text-xs text-muted-foreground">Memory allocation</div>
              </div>
            </div>
            <p className="text-sm mt-2 text-muted-foreground">
              Custom resource configurations are not currently supported by Databricks Apps.
            </p>
          </HighlightBox>

          <Section id="apps-architecture" title="Container Isolation Architecture">
            <MermaidDiagram chart={databricksAppsIsolation} id="databricks-apps-isolation" />
          </Section>

          <Section id="apps-isolation" title="Isolation Features">
            <div className="space-y-4 mt-4">
              <div className="border rounded-lg p-4 bg-blue-50">
                <h4 className="font-semibold mb-2 text-blue-900">Process Isolation</h4>
                <p className="text-sm text-blue-800 mb-2">
                  Each app instance runs in its own container with:
                </p>
                <ul className="text-sm space-y-1 text-blue-700">
                  <li>Separate PID namespace (processes isolated)</li>
                  <li>Fixed resource limits (2 vCPU, 6GB RAM)</li>
                  <li>No access to other containers or host system</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-green-50">
                <h4 className="font-semibold mb-2 text-green-900">Network Isolation</h4>
                <p className="text-sm text-green-800 mb-2">
                  Network access is strictly controlled:
                </p>
                <ul className="text-sm space-y-1 text-green-700">
                  <li>Sandboxed network namespace</li>
                  <li>Outbound access only to approved endpoints</li>
                  <li>No inbound connections except through proxy</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-orange-50">
                <h4 className="font-semibold mb-2 text-orange-900">Ephemeral Storage</h4>
                <p className="text-sm text-orange-800 mb-2">
                  Storage is ephemeral - all data is lost on container restart:
                </p>
                <ul className="text-sm space-y-1 text-orange-700">
                  <li>Filesystem cleared on every restart or timeout</li>
                  <li>No persistent storage available</li>
                  <li>Files read from Unity Catalog volumes (read-only)</li>
                  <li>Local changes exist only during active session</li>
                </ul>
              </div>
            </div>

            <HighlightBox variant="warning" title="Data Loss Warning" className="mt-6">
              <p className="text-sm">
                <strong>Important:</strong> Any files created or modified within a Databricks App
                are lost when the container restarts. Users should save important work to
                Unity Catalog volumes or external storage before ending their session.
              </p>
            </HighlightBox>

            <HighlightBox variant="note" title="Future Improvement: Volume Sync" className="mt-4">
              <p className="text-sm mb-2">
                A planned enhancement is to implement automatic file synchronization with
                Databricks Volumes:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Auto-backup workspace files to user&apos;s Unity Catalog volume</li>
                <li>Restore files on container startup</li>
                <li>Periodic sync during active sessions</li>
                <li>Versioned backups for recovery</li>
              </ul>
            </HighlightBox>
          </Section>

          <Section id="apps-use-cases" title="Embedded Apps Use Cases">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Link
                href="/docs/solutions/code-editor"
                className="block border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 transition-colors"
              >
                <h4 className="font-semibold mb-2 text-blue-900">Code Editor</h4>
                <p className="text-sm text-blue-800">
                  VSCode-based editor for notebooks, Python, SQL with full IDE
                  features (IntelliSense, debugging, Git).
                </p>
              </Link>

              <Link
                href="/docs/solutions/agent"
                className="block border rounded-lg p-4 bg-gradient-to-br from-violet-50 to-violet-100 hover:from-violet-100 hover:to-violet-200 transition-colors"
              >
                <h4 className="font-semibold mb-2 text-violet-900">Agent Panel</h4>
                <p className="text-sm text-violet-800">
                  Genie Agent + managed-memory chat assistant embedded via the
                  Vercel-native <code className="text-xs">/api/agent-proxy</code> route.
                </p>
              </Link>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Notebook Viewer</h4>
                <p className="text-sm text-green-800">
                  Read-only notebook rendering for viewing outputs and visualizations
                  without execution capability.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
                <h4 className="font-semibold mb-2 text-orange-900">Custom Apps</h4>
                <p className="text-sm text-orange-800">
                  Build custom Databricks Apps for specialized workflows (data
                  quality tools, ML experiments, dashboards).
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              See the{" "}
              <Link href="/docs/solutions" className="text-blue-600 hover:underline">
                full solutions index
              </Link>{" "}
              for all documented platform capabilities.
            </p>
          </Section>
        </Section>

        {/* Performance Monitoring Section */}
        <Section id="monitoring" title="Performance Monitoring">
          <ContentBlock>
            <p className="mb-4">
              Effective scaling requires visibility into system performance.
              FireFly recommends monitoring these key metrics:
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h4 className="font-semibold mb-2 text-blue-900">Application Metrics</h4>
              <ul className="text-sm space-y-1 text-blue-700">
                <li>Request rate (req/sec)</li>
                <li>Response time (P50, P95, P99)</li>
                <li>Error rate (4xx, 5xx)</li>
                <li>Instance count (scaling)</li>
                <li>CPU/memory utilization</li>
              </ul>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <h4 className="font-semibold mb-2 text-green-900">Database Metrics</h4>
              <ul className="text-sm space-y-1 text-green-700">
                <li>Query duration</li>
                <li>Connection pool usage</li>
                <li>Active connections</li>
                <li>Rows read/written</li>
                <li>Replication lag</li>
              </ul>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
              <h4 className="font-semibold mb-2 text-orange-900">Databricks Metrics</h4>
              <ul className="text-sm space-y-1 text-orange-700">
                <li>Warehouse uptime/utilization</li>
                <li>Query queue depth</li>
                <li>Query duration by type</li>
                <li>SPN token refresh rate</li>
                <li>API error rate</li>
              </ul>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
              <h4 className="font-semibold mb-2 text-purple-900">User Experience</h4>
              <ul className="text-sm space-y-1 text-purple-700">
                <li>Time to first byte (TTFB)</li>
                <li>Largest contentful paint (LCP)</li>
                <li>Page load time</li>
                <li>Query completion time</li>
                <li>Error page views</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* Conclusion Section */}
        <Section id="conclusion" title="Conclusion">
          <ContentBlock>
            <p className="mb-4">
              FireFly Analytics is designed for scalability at every layer. By
              combining auto-scaling application infrastructure, Databricks
              Serverless SQL, and workspace-per-organization isolation, the platform
              can grow seamlessly from small teams to enterprise deployments.
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
              <h3 className="font-semibold mb-2 text-orange-900">Horizontal Scaling</h3>
              <p className="text-sm text-orange-800">
                Stateless Next.js and Go proxy instances scale horizontally
                based on demand with zero manual intervention.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h3 className="font-semibold mb-2 text-blue-900">Elastic Compute</h3>
              <p className="text-sm text-blue-800">
                Databricks Serverless SQL scales from zero to handle any query
                workload with automatic resource management.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <h3 className="font-semibold mb-2 text-green-900">Cost Efficiency</h3>
              <p className="text-sm text-green-800">
                Pay-per-use pricing and scale-to-zero capabilities ensure you
                only pay for what you actually use.
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
                href="/docs/architecture/security"
                className="inline-block bg-white text-orange-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Security Docs
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

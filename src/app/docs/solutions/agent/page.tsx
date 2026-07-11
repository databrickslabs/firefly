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
    "public/solutions/agent",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function AgentPage() {
  const architecture = await loadMermaidFile("architecture.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Solutions
          </div>
          <PageTitle>Agent Panel</PageTitle>
          <p className="text-xl text-muted-foreground">
            A slide-out chat assistant that answers questions over your
            workspace data with Genie One and remembers context across sessions
            with managed memory &mdash; embedded without exposing Databricks SSO.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              The Agent panel embeds a Databricks App built from the{" "}
              <code className="text-sm">agent-openai-agents-sdk</code> template
              (vendored as a git submodule under{" "}
              <code className="text-sm">vendor/app-templates</code>). It pairs the
              OpenAI Agents SDK with two capabilities: <strong>Genie One</strong>{" "}
              for natural-language questions over Unity Catalog data, and{" "}
              <strong>managed memory</strong> for durable, per-user context.
            </p>
            <p className="mb-4">
              Unlike the code and notebook editors, the agent is embedded through
              a <strong>Vercel-native reverse proxy</strong> rather than the Go
              proxy &mdash; so guests never see a Databricks login. See{" "}
              <Link href="#backend-configuration" className="text-blue-600 hover:underline">
                Backend Configuration
              </Link>{" "}
              for how the proxy mints tokens and forwards requests.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Benefits">
            <ul className="list-disc pl-5 space-y-1">
              <li>Genie One answers over workspace data, with source attribution</li>
              <li>Managed long-term memory (UC store) across conversations</li>
              <li>Guest / BYOD users work &mdash; the proxy mints their mapped SPN token</li>
              <li>Same-origin embedding; users never see a Databricks login</li>
              <li>No Go proxy or Cloud Run dependency for the agent</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* How It Works Section */}
        <Section id="how-it-works" title="How It Works">
          <ContentBlock>
            <p className="mb-4">
              When a user opens the panel, the iframe loads{" "}
              <code className="text-sm">/api/agent-proxy</code> on the same origin.
              The route resolves the session and active organization, mints a
              workspace bearer token from the user&apos;s mapped SPN, and forwards
              to <code className="text-sm">DATABRICKS_AGENT_APP_URL</code>. The
              HTML document is rewritten (a <code className="text-sm">&lt;base&gt;</code>{" "}
              tag plus a forced light theme) so the chat UI&apos;s relative assets
              resolve under the mount and match the light Firefly UI. Chat
              responses stream back as Server-Sent Events.
            </p>
          </ContentBlock>

          <Section id="architecture-diagram" title="Architecture">
            <MermaidDiagram chart={architecture} id="agent-architecture" />
          </Section>
        </Section>

        {/* Genie One + Memory Section */}
        <Section id="genie-and-memory" title="Genie One & Managed Memory">
          <ContentBlock>
            <p className="mb-4">
              The agent answers data questions with <strong>Genie One</strong>,
              the workspace-wide unified Genie, served over the Genie MCP endpoint
              (<code className="text-sm">/api/2.0/mcp/genie</code>). The{" "}
              <code className="text-sm">ask_genie_one</code> tool calls{" "}
              <code className="text-sm">genie_ask</code> and polls{" "}
              <code className="text-sm">genie_poll_response</code> until complete,
              authenticating with the agent App&apos;s service principal. It is not
              scoped to a single Genie space (<code className="text-sm">GENIE_MCP_MODE=one</code>).
            </p>
            <p className="mb-4">
              Managed memory persists per-user context in a Unity Catalog store, so
              the agent can recall earlier facts and preferences across sessions.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="Agent behavior">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Genie-first</strong>: data questions call <code>ask_genie_one</code> before asking the user to clarify</li>
              <li><strong>Concrete assets</strong>: broad prompts request catalogs, schemas, tables, key columns, and row counts</li>
              <li><strong>Attribution</strong>: replies surface Genie asset links and a &ldquo;Powered by Genie &middot; Genie One&rdquo; link</li>
              <li><strong>Memory</strong>: relevant context is read/written to the UC memory store per user</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* Backend Configuration Section */}
        <Section id="backend-configuration" title="Backend Configuration">
          <ContentBlock>
            <p className="mb-4">
              The frontend panel is gated by an env flag and points the proxy at the
              deployed agent App. Genie and memory are configured at the{" "}
              <strong>agent App layer</strong> in{" "}
              <code className="text-sm">agent/databricks.yml</code> (not the frontend
              environment).
            </p>
          </ContentBlock>

          <Section id="proxy-architecture" title="Vercel-Native Reverse Proxy">
            <ContentBlock>
              <p className="mb-4">
                Unlike the code and notebook editors, the agent is{" "}
                <strong>not</strong> embedded through the Go proxy. It uses a{" "}
                <strong>Vercel-native reverse proxy</strong> &mdash; a Next.js route
                at <code className="text-sm">/api/agent-proxy</code> &mdash; that
                mints the current user&apos;s (or guest&apos;s){" "}
                <Link href="/docs/architecture/authentication/sso-mapped-spn" className="text-blue-600 hover:underline">
                  SSO-mapped Service Principal
                </Link>{" "}
                token and forwards requests (including the streaming chat) to the
                agent App. No Go proxy or Cloud Run is required.
              </p>
            </ContentBlock>

            <HighlightBox variant="info" title="What the proxy route does">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Resolves the session + active organization, then mints a workspace bearer from the user&apos;s mapped SPN (guest / BYOD supported)</li>
                <li>Injects the bearer and forwards HTTP + SSE (streaming chat) to <code>DATABRICKS_AGENT_APP_URL</code></li>
                <li>Relaxes frame headers for same-origin embedding</li>
                <li>Rewrites the HTML document (<code>&lt;base&gt;</code> tag + forced light theme) so relative assets resolve under the mount and match the Firefly UI</li>
              </ul>
            </HighlightBox>
          </Section>

          <Section id="environment-variables" title="Environment Variables">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">Variable</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Where</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">NEXT_PUBLIC_AGENT_ENABLED</code></td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">Frontend</td>
                    <td className="border border-gray-200 px-4 py-2">Show the Agent panel when set to <code>true</code></td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">DATABRICKS_AGENT_APP_URL</code></td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">Frontend</td>
                    <td className="border border-gray-200 px-4 py-2">Deployed agent App URL the proxy forwards to</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">GENIE_MCP_MODE</code></td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">Agent App</td>
                    <td className="border border-gray-200 px-4 py-2">Set to <code>one</code> to use Genie One (workspace-wide)</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">GENIE_ONE_URL</code></td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">Agent App</td>
                    <td className="border border-gray-200 px-4 py-2">Attribution link surfaced to the UI via <code>/api/config</code></td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">DATABRICKS_MEMORY_STORE</code></td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">Agent App</td>
                    <td className="border border-gray-200 px-4 py-2">Store identifier/namespace for the agent&apos;s managed memory (persisted via the app&apos;s managed-memory store; not a standalone UC table you create)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="build-and-deploy" title="Build & Deploy">
            <ContentBlock>
              <p className="mb-4">
                The deployable app is assembled from the pristine submodule plus the
                local overlay in <code className="text-sm">agent/</code>, then
                deployed as a Databricks App bundle.
              </p>
            </ContentBlock>
            <CodeBlock>
{`# Fetch the submodule (first time only)
git submodule update --init

# Merge vendor submodule + agent/ overlay into ./agent-build (gitignored)
bash scripts/assemble_agent.sh

cd agent-build

# Validate, then deploy + start the app. 'bundle run' requires the app resource
# KEY (agent_openai_agents_sdk, from databricks.yml); without it the CLI errors
# "expected a KEY of the resource to run".
databricks bundle validate -p <your-cli-profile>
databricks bundle deploy   -p <your-cli-profile>
databricks bundle run agent_openai_agents_sdk -p <your-cli-profile>

# Then point DATABRICKS_AGENT_APP_URL at the deployed app URL`}
            </CodeBlock>
            <ContentBlock>
              <p className="mt-4">
                The project <code className="text-sm">README.md</code> (&ldquo;Build &amp;
                deploy the agent app&rdquo;) is the canonical procedure and covers the
                operational notes: the first request returns <code>503</code> while the
                container builds (check <code className="text-sm">databricks apps get
                &lt;app-name&gt;</code> for status RUNNING), pinning Python 3.12 for the
                build, and the local <code className="text-sm">agent-build</code> git
                boundary that <code className="text-sm">assemble_agent.sh</code> creates so
                the bundle syncs files.
              </p>
            </ContentBlock>
          </Section>
        </Section>

        {/* Related Documentation Section */}
        <Section id="related" title="Related Documentation">
          <div className="grid md:grid-cols-2 gap-4">
            <Link
              href="/docs/architecture/authentication/sso-mapped-spn"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">SSO-Mapped SPN Authentication</h4>
              <p className="text-sm text-muted-foreground">
                How the mapped service principal token (reused by the agent proxy) is issued
              </p>
            </Link>

            <Link
              href="/docs/solutions/embedding-apps"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Embedding Databricks Apps</h4>
              <p className="text-sm text-muted-foreground">
                The Go-proxy embedding path used by the code and notebook editors
              </p>
            </Link>

            <Link
              href="/docs/solutions/data-catalog"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Data Catalog</h4>
              <p className="text-sm text-muted-foreground">
                Browse the Unity Catalog data the agent queries via Genie
              </p>
            </Link>

            <Link
              href="/docs/solutions/sql-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">SQL Editor</h4>
              <p className="text-sm text-muted-foreground">
                Native SQL query interface with warehouse integration
              </p>
            </Link>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

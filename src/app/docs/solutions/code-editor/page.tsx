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
    "public/solutions/code-editor",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function CodeEditorPage() {
  const architecture = await loadMermaidFile("architecture.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Solutions
          </div>
          <PageTitle>Code Editor</PageTitle>
          <p className="text-xl text-muted-foreground">
            A VS Code-style development environment embedded directly within your
            platform, providing file-based code editing with syntax highlighting,
            terminal access, and full workspace navigation.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              The Code Editor embeds a full VS Code-style interface by leveraging
              Databricks&apos; Code Editor Lakehouse App. This provides developers with
              a familiar IDE experience directly within your platform, without requiring
              them to authenticate with Databricks separately.
            </p>
            <p className="mb-4">
              Users authenticate via your application&apos;s SSO, and all API calls use{" "}
              <Link href="/docs/architecture/authentication/sso-mapped-spn" className="text-blue-600 hover:underline">
                SSO-Mapped Service Principal credentials
              </Link>
              . The Go reverse proxy handles token encryption and WebSocket connections
              for real-time features like terminal sessions and language server protocol (LSP).
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Benefits">
            <ul className="list-disc pl-5 space-y-1">
              <li>Full VS Code experience without Databricks SSO exposure</li>
              <li>Integrated terminal for shell commands and git operations</li>
              <li>Language Server Protocol for autocomplete and linting</li>
              <li>Direct access to workspace files and repositories</li>
              <li>Extension support for additional functionality</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* How It Works Section */}
        <Section id="how-it-works" title="How It Works">
          <ContentBlock>
            <p className="mb-4">
              The Code Editor uses the same iframe proxy architecture as the Notebook Editor.
              When a user navigates to the code editor, the server fetches their SPN token,
              encrypts it, and generates a proxy URL pointing to the VS Code Lakehouse App.
            </p>
          </ContentBlock>

          <Section id="architecture-diagram" title="Architecture">
            <MermaidDiagram chart={architecture} id="code-editor-architecture" />
          </Section>

          <Section id="websocket-support" title="WebSocket Support">
            <ContentBlock>
              <p className="mb-4">
                The Code Editor relies heavily on WebSocket connections for real-time features.
                The Go proxy automatically detects WebSocket upgrade requests and establishes
                bidirectional tunnels with proper authentication.
              </p>
            </ContentBlock>

            <HighlightBox variant="success" title="WebSocket Features">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>Terminal Sessions</strong>: Interactive shell access for command execution</li>
                <li><strong>Language Server Protocol</strong>: Real-time code completion, linting, and diagnostics</li>
                <li><strong>File Watching</strong>: Automatic refresh when files change on the server</li>
                <li><strong>Debugging</strong>: Interactive debugger with breakpoints and variable inspection</li>
                <li><strong>Live Reload</strong>: Hot module reloading during development</li>
              </ul>
            </HighlightBox>
          </Section>
        </Section>

        {/* User Experience Section */}
        <Section id="user-experience" title="User Experience">
          <ContentBlock>
            <p className="mb-4">
              The Code Editor provides a comprehensive development environment familiar
              to VS Code users.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="Features">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>VS Code-style interface with file tree navigation</li>
              <li>Syntax highlighting for Python, SQL, Scala, R, and more</li>
              <li>Integrated terminal for command execution</li>
              <li>Git integration for version control (status, diff, commit)</li>
              <li>Multi-file editing with tabs</li>
              <li>Search and replace across files</li>
              <li>Extension support for additional languages and tools</li>
              <li>Keyboard shortcuts matching VS Code defaults</li>
            </ul>
          </HighlightBox>

          <Section id="supported-languages" title="Supported Languages">
            <ContentBlock>
              <p className="mb-4">
                The Code Editor supports all languages commonly used in data engineering
                and data science workflows:
              </p>
            </ContentBlock>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border rounded-lg p-3 text-center">
                <div className="font-semibold">Python</div>
                <div className="text-sm text-muted-foreground">Full LSP support</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="font-semibold">SQL</div>
                <div className="text-sm text-muted-foreground">Spark SQL dialect</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="font-semibold">Scala</div>
                <div className="text-sm text-muted-foreground">With Metals LSP</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="font-semibold">R</div>
                <div className="text-sm text-muted-foreground">Syntax highlighting</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="font-semibold">JSON/YAML</div>
                <div className="text-sm text-muted-foreground">Config files</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="font-semibold">Markdown</div>
                <div className="text-sm text-muted-foreground">Documentation</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="font-semibold">Shell</div>
                <div className="text-sm text-muted-foreground">Bash scripts</div>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <div className="font-semibold">Terraform</div>
                <div className="text-sm text-muted-foreground">IaC files</div>
              </div>
            </div>
          </Section>
        </Section>

        {/* Backend Configuration Section */}
        <Section id="backend-configuration" title="Backend Configuration">
          <ContentBlock>
            <p className="mb-4">
              The Code Editor component follows the same pattern as the Notebook Editor,
              implemented as a server-side rendered React component.
            </p>
          </ContentBlock>

          <Section id="component-implementation" title="Component Implementation">
            <CodeBlock>
{`// src/components/sso-spn-code-editor-iframe.tsx
import { redirect } from "next/navigation";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { generateProxyUrl } from "@/lib/token-encryption";

export default async function CodeEditorIframe() {
  const tokenResult = await getDatabricksWorkspaceToken();

  if (!tokenResult.success) {
    redirect("/sso-spn");
  }

  const { accessToken } = tokenResult.data;
  const appUrl = process.env.DATABRICKS_APP_URL; // VS Code Lakehouse App
  const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL;

  const proxyPath = generateProxyUrl(accessToken, appUrl, "/");
  const fullProxyUrl = \`\${proxyBaseUrl}\${proxyPath}\`;

  return (
    <div className="h-full flex flex-col">
      <iframe
        src={fullProxyUrl}
        className="w-full h-full border-0"
        title="Code Editor"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        allow="clipboard-write; clipboard-read"
      />
    </div>
  );
}`}
            </CodeBlock>
          </Section>

          <Section id="environment-variables" title="Environment Variables">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">Variable</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Description</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Example</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">DATABRICKS_APP_URL</code></td>
                    <td className="border border-gray-200 px-4 py-2">URL of the VS Code Lakehouse App</td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">https://code-editor-shared-xxx.aws.databricksapps.com</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">NEXT_PUBLIC_PROXY_URL</code></td>
                    <td className="border border-gray-200 px-4 py-2">Base URL of the Go proxy server</td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">https://app-proxy.your-domain.com</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">ENCRYPTION_KEY</code></td>
                    <td className="border border-gray-200 px-4 py-2">AES-256 encryption key (64 hex chars)</td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">Generated via <code>openssl rand -hex 32</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
        </Section>

        {/* Enhancement Opportunities Section */}
        <Section id="enhancements" title="Enhancement Opportunities">
          <ContentBlock>
            <p className="mb-4">
              The Code Editor can be extended with additional features to provide
              a more integrated development experience.
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h4 className="font-semibold mb-2 text-blue-900">Deep Linking</h4>
              <p className="text-sm text-blue-800">
                Open specific files at specific line numbers via URL parameters
                to enable cross-linking from other parts of your application (e.g., error logs).
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <h4 className="font-semibold mb-2 text-green-900">Custom Extensions</h4>
              <p className="text-sm text-green-800">
                Pre-install organization-specific VS Code extensions for
                custom linting rules, code snippets, or integrations.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
              <h4 className="font-semibold mb-2 text-purple-900">Git Integration</h4>
              <p className="text-sm text-purple-800">
                Enable deeper Git integration to show commit history,
                pull request status, and code review comments inline.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
              <h4 className="font-semibold mb-2 text-orange-900">Workspace Templates</h4>
              <p className="text-sm text-orange-800">
                Provide pre-configured workspace templates with common folder
                structures, config files, and starter code.
              </p>
            </div>
          </div>
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
                Learn how the SSO-SPN authentication pattern works
              </p>
            </Link>

            <Link
              href="/docs/solutions/embedding-apps"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Embedding Databricks Apps</h4>
              <p className="text-sm text-muted-foreground">
                Technical details on the proxy architecture and token encryption
              </p>
            </Link>

            <Link
              href="/docs/solutions/notebook-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Notebook Editor</h4>
              <p className="text-sm text-muted-foreground">
                Interactive notebook editing with Marimo
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

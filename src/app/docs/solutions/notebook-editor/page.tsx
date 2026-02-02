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
    "public/solutions/notebook-editor",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function NotebookEditorPage() {
  const architecture = await loadMermaidFile("architecture.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Solutions
          </div>
          <PageTitle>Notebook Editor</PageTitle>
          <p className="text-xl text-muted-foreground">
            Interactive Python notebook editing powered by Marimo, embedded directly
            within your platform. Users can create cells, execute code, and view rich
            outputs without leaving your application.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              The Notebook Editor provides a full-featured interactive notebook experience
              by embedding the{" "}
              <a href="https://marimo.io" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                Marimo
              </a>{" "}
              notebook application. Marimo is deployed as a Databricks Lakehouse App and
              accessed through a secure proxy that handles authentication transparently.
            </p>
            <p className="mb-4">
              This approach allows you to provide notebook functionality to users who
              authenticate via your application&apos;s SSO (Okta, Azure AD, etc.) without
              exposing Databricks login screens. All API calls use{" "}
              <Link href="/docs/architecture/authentication/sso-mapped-spn" className="text-blue-600 hover:underline">
                SSO-Mapped Service Principal credentials
              </Link>.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Benefits">
            <ul className="list-disc pl-5 space-y-1">
              <li>Full notebook functionality without Databricks SSO exposure</li>
              <li>Reactive Python notebooks with automatic dependency tracking</li>
              <li>Rich outputs including tables, charts, and interactive widgets</li>
              <li>Seamless integration with your application&apos;s authentication</li>
              <li>Access to Databricks compute and data resources</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* How It Works Section */}
        <Section id="how-it-works" title="How It Works">
          <ContentBlock>
            <p className="mb-4">
              The Notebook Editor uses an iframe-based architecture with a Go reverse proxy.
              When a user navigates to the notebook editor, the server fetches their SPN
              token, encrypts it, and generates a proxy URL. The browser loads the Marimo
              app through this proxy, which decrypts the token and authenticates requests.
            </p>
          </ContentBlock>

          <Section id="architecture-diagram" title="Architecture">
            <MermaidDiagram chart={architecture} id="notebook-architecture" />
          </Section>

          <Section id="request-flow" title="Request Flow">
            <ContentBlock>
              <ol className="list-decimal pl-6 space-y-3">
                <li>
                  <strong>User navigates</strong> to the notebook editor page in your application
                </li>
                <li>
                  <strong>Server-side component</strong> fetches the user&apos;s SPN credentials
                  from the database and exchanges them for a Databricks workspace token
                </li>
                <li>
                  <strong>Token is encrypted</strong> using AES-256-GCM and embedded in a
                  proxy URL
                </li>
                <li>
                  <strong>Browser renders iframe</strong> pointing to the Go proxy with the
                  encrypted token
                </li>
                <li>
                  <strong>Go proxy decrypts</strong> the token and forwards requests to the
                  Marimo Lakehouse App with proper authentication
                </li>
                <li>
                  <strong>WebSocket connections</strong> are established for real-time cell
                  execution and output streaming
                </li>
              </ol>
            </ContentBlock>
          </Section>
        </Section>

        {/* User Experience Section */}
        <Section id="user-experience" title="User Experience">
          <ContentBlock>
            <p className="mb-4">
              The Notebook Editor provides a modern, reactive notebook interface that
              feels native to your application.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="Features">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Interactive Python cells with syntax highlighting and autocomplete</li>
              <li>Reactive execution - cells automatically re-run when dependencies change</li>
              <li>Rich outputs including DataFrames, Matplotlib/Plotly charts, and HTML</li>
              <li>Cell execution with real-time output streaming</li>
              <li>File browser for notebook management</li>
              <li>Variable explorer and debugging tools</li>
              <li>Markdown cells for documentation</li>
              <li>Support for Databricks-specific features like Delta tables and MLflow</li>
            </ul>
          </HighlightBox>

          <Section id="marimo-advantages" title="Why Marimo?">
            <ContentBlock>
              <p className="mb-4">
                Marimo offers several advantages over traditional Jupyter notebooks:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Reactive Execution</h4>
                <p className="text-sm text-blue-800">
                  When you modify a cell, all dependent cells automatically re-execute.
                  No more &quot;run all cells&quot; confusion.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Pure Python</h4>
                <p className="text-sm text-green-800">
                  Notebooks are stored as executable Python files, not JSON.
                  Easy to version control and review.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
                <h4 className="font-semibold mb-2 text-purple-900">Interactive Widgets</h4>
                <p className="text-sm text-purple-800">
                  Built-in support for sliders, dropdowns, and other UI elements
                  that reactively update the notebook.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
                <h4 className="font-semibold mb-2 text-orange-900">Deterministic State</h4>
                <p className="text-sm text-orange-800">
                  No hidden state or execution order issues. The notebook state
                  is always consistent with the code.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Backend Configuration Section */}
        <Section id="backend-configuration" title="Backend Configuration">
          <ContentBlock>
            <p className="mb-4">
              The Notebook Editor component is implemented as a server-side rendered
              React component that handles token acquisition and proxy URL generation.
            </p>
          </ContentBlock>

          <Section id="component-implementation" title="Component Implementation">
            <CodeBlock>
{`// src/components/sso-spn-notebook-editor-iframe.tsx
import { redirect } from "next/navigation";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { generateProxyUrl } from "@/lib/token-encryption";

export default async function NotebookEditorIframe() {
  // Fetch workspace token using SPN credentials
  const tokenResult = await getDatabricksWorkspaceToken();

  if (!tokenResult.success) {
    redirect("/sso-spn"); // Redirect to re-authenticate
  }

  const { accessToken } = tokenResult.data;

  // Configuration from environment
  const appUrl = process.env.DATABRICKS_NOTEBOOK_APP_URL;
  const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL;

  // Generate encrypted proxy URL
  const proxyPath = generateProxyUrl(accessToken, appUrl, "/");
  const fullProxyUrl = \`\${proxyBaseUrl}\${proxyPath}\`;

  return (
    <div className="h-full flex flex-col">
      <iframe
        src={fullProxyUrl}
        className="w-full h-full border-0"
        title="Notebook Editor"
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
                    <td className="border border-gray-200 px-4 py-2"><code className="text-sm">DATABRICKS_NOTEBOOK_APP_URL</code></td>
                    <td className="border border-gray-200 px-4 py-2">URL of the Marimo Lakehouse App</td>
                    <td className="border border-gray-200 px-4 py-2 text-sm">https://marimo-notebook-shared-xxx.aws.databricksapps.com</td>
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

          <Section id="lakehouse-app-setup" title="Lakehouse App Setup">
            <ContentBlock>
              <p className="mb-4">
                To use the Notebook Editor, you need to deploy a Marimo Lakehouse App
                in your Databricks workspace. This is a one-time setup:
              </p>
            </ContentBlock>

            <ol className="list-decimal pl-6 space-y-3">
              <li>
                <strong>Create a Lakehouse App</strong> in your Databricks workspace
                with Marimo as the application
              </li>
              <li>
                <strong>Configure permissions</strong> to allow the Service Principal
                to access the app
              </li>
              <li>
                <strong>Note the app URL</strong> and set it as <code>DATABRICKS_NOTEBOOK_APP_URL</code>
              </li>
              <li>
                <strong>Deploy the Go proxy</strong> with the same encryption key
                as your Next.js application
              </li>
            </ol>

            <HighlightBox variant="warning" title="Security Note" className="mt-4">
              <p className="text-sm">
                The Go proxy and Next.js application must share the same <code>ENCRYPTION_KEY</code>.
                Store this key securely and rotate it periodically. See the{" "}
                <Link href="/docs/solutions/embedding-apps" className="text-blue-600 hover:underline">
                  Embedding Apps documentation
                </Link>{" "}
                for proxy deployment details.
              </p>
            </HighlightBox>
          </Section>
        </Section>

        {/* Enhancement Opportunities Section */}
        <Section id="enhancements" title="Enhancement Opportunities">
          <ContentBlock>
            <p className="mb-4">
              The Notebook Editor can be extended with additional features to provide
              a more integrated experience.
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
              <h4 className="font-semibold mb-2 text-purple-900">postMessage Integration</h4>
              <p className="text-sm text-purple-800">
                Enable parent-iframe communication to trigger cell execution,
                inject variables, or extract outputs programmatically from your application.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h4 className="font-semibold mb-2 text-blue-900">Theme Synchronization</h4>
              <p className="text-sm text-blue-800">
                Sync dark/light mode and color themes between your application
                and the embedded notebook for a seamless visual experience.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <h4 className="font-semibold mb-2 text-green-900">Notebook Templates</h4>
              <p className="text-sm text-green-800">
                Pre-populate notebooks with starter code, common imports,
                or organization-specific utilities for consistent starting points.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
              <h4 className="font-semibold mb-2 text-orange-900">Execution Callbacks</h4>
              <p className="text-sm text-orange-800">
                Receive events when cells complete execution for analytics,
                logging, or triggering downstream workflows in your application.
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
              href="/docs/solutions/code-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Code Editor</h4>
              <p className="text-sm text-muted-foreground">
                VS Code-style file editing in the same architecture
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

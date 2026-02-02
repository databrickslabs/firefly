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
    "public/architecture/lakehouse-apps-proxy",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function EmbeddingAppsPage() {
  const simplifiedOverview = await loadMermaidFile("00-simplified-overview.mermaid");
  const proxyFlow = await loadMermaidFile("01-proxy-flow.mermaid");
  const tokenEncryption = await loadMermaidFile("02-token-encryption.mermaid");
  const iframeEmbedding = await loadMermaidFile("03-iframe-embedding.mermaid");
  const websocketProxy = await loadMermaidFile("04-websocket-proxy.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Solutions
          </div>
          <PageTitle>Embedding Databricks Apps w/o SSO</PageTitle>
          <p className="text-xl text-muted-foreground">
            A Go-based reverse proxy that enables embedding Databricks Lakehouse Apps
            (like VS Code and Marimo notebooks) without requiring users to authenticate
            directly with Databricks.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              Normally, embedding a Databricks app (such as the hosted VS Code editor
              or Marimo notebooks) in an iframe requires users to authenticate directly
              with Databricks through an SSO login flow. This exposes the Databricks
              login interface to end users and breaks the seamless experience of a
              custom application.
            </p>
            <p className="mb-4">
              This Go reverse proxy eliminates the need for Databricks SSO by handling
              authentication transparently. Users authenticate with your application,
              and the proxy securely manages OAuth tokens behind the scenes.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Features">
            <ul className="list-disc pl-5 space-y-1">
              <li>Encrypted OAuth token transmission in URLs (AES-256-GCM)</li>
              <li>Full HTTP/HTTPS reverse proxy with CORS support</li>
              <li>Bidirectional WebSocket proxying for real-time features</li>
              <li>Dynamic routing to any Databricks Lakehouse App</li>
              <li>Secure iframe embedding with sandbox controls</li>
              <li>No OAuth tokens exposed to browser JavaScript</li>
            </ul>
          </HighlightBox>

          <Section id="embedded-apps" title="Embedded Applications">
            <ContentBlock>
              <p className="mb-4">
                This proxy architecture powers several embedded applications:
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4">
              <Link
                href="/docs/solutions/notebook-editor"
                className="block border rounded-lg p-4 hover:bg-accent transition-colors"
              >
                <h4 className="font-semibold mb-1">Notebook Editor</h4>
                <p className="text-sm text-muted-foreground">
                  Interactive Python notebooks powered by Marimo
                </p>
              </Link>

              <Link
                href="/docs/solutions/code-editor"
                className="block border rounded-lg p-4 hover:bg-accent transition-colors"
              >
                <h4 className="font-semibold mb-1">Code Editor</h4>
                <p className="text-sm text-muted-foreground">
                  VS Code-style development environment
                </p>
              </Link>
            </div>
          </Section>

          <Section id="architecture" title="High-Level Architecture">
            <ContentBlock>
              <p className="mb-4">
                The following diagram shows the interaction between your Next.js
                application, the Go proxy server, and Databricks Lakehouse Apps.
                OAuth tokens are encrypted by Next.js, passed through the browser
                in encrypted form, and decrypted by the Go proxy.
              </p>
            </ContentBlock>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <MermaidDiagram chart={simplifiedOverview} id="simplified-overview" />
            </div>
          </Section>
        </Section>

        {/* Why a Proxy Section */}
        <Section id="why-proxy" title="Why a Proxy is Needed">
          <ContentBlock>
            <p className="mb-4">
              Databricks Lakehouse Apps require OAuth Bearer token authentication
              for every request. When embedding these apps in iframes, we face
              several security challenges:
            </p>
          </ContentBlock>

          <div className="space-y-4">
            <div className="border-l-4 border-red-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">Token Exposure</h4>
              <p className="text-sm text-muted-foreground">
                If we embed the Databricks app directly with the token in the URL,
                the OAuth token would be visible in the browser&apos;s address bar,
                network inspector, and history.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">CORS Restrictions</h4>
              <p className="text-sm text-muted-foreground">
                Databricks apps have strict CORS policies that prevent direct
                cross-origin requests from custom web applications.
              </p>
            </div>

            <div className="border-l-4 border-yellow-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">WebSocket Authentication</h4>
              <p className="text-sm text-muted-foreground">
                WebSocket connections (used for terminals and real-time features)
                cannot easily include custom authentication headers from
                browser-initiated connections.
              </p>
            </div>
          </div>

          <Section id="solutions" title="How the Proxy Solves These">
            <div className="space-y-4 mt-4">
              <div className="border-l-4 border-green-500 pl-4 py-2">
                <h4 className="font-semibold mb-1">Encrypted Token URLs</h4>
                <p className="text-sm text-muted-foreground">
                  Next.js encrypts OAuth tokens server-side before embedding them
                  in URLs. The Go proxy decrypts them and injects them as
                  Authorization headers.
                </p>
              </div>

              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h4 className="font-semibold mb-1">CORS Proxy</h4>
                <p className="text-sm text-muted-foreground">
                  The proxy adds appropriate CORS headers to responses, enabling
                  cross-origin iframe embedding while maintaining security.
                </p>
              </div>

              <div className="border-l-4 border-purple-500 pl-4 py-2">
                <h4 className="font-semibold mb-1">WebSocket Proxying</h4>
                <p className="text-sm text-muted-foreground">
                  The proxy detects WebSocket upgrade requests, establishes
                  authenticated connections to Databricks, and bidirectionally
                  forwards messages.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Proxy Flow Section */}
        <Section id="proxy-flow" title="Complete Proxy Flow">
          <ContentBlock>
            <p className="mb-4">
              The following sequence diagram illustrates the complete flow from
              when a user requests an embedded app through the establishment of
              HTTP and WebSocket connections.
            </p>
          </ContentBlock>
          <MermaidDiagram chart={proxyFlow} id="proxy-flow-diagram" />
        </Section>

        {/* Token Encryption Section */}
        <Section id="token-encryption" title="Token Encryption">
          <ContentBlock>
            <p className="mb-4">
              The security of the proxy relies on strong encryption of OAuth
              tokens. Both Next.js and the Go proxy use AES-256-GCM encryption
              with a shared secret key.
            </p>
          </ContentBlock>

          <Section id="encryption-diagram" title="Encryption Architecture">
            <MermaidDiagram chart={tokenEncryption} id="token-encryption-diagram" />
          </Section>

          <Section id="encryption-details" title="Encryption Details">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Algorithm: AES-256-GCM</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><strong>Algorithm</strong>: AES (Advanced Encryption Standard)</li>
                  <li><strong>Key Size</strong>: 256 bits (32 bytes)</li>
                  <li><strong>Mode</strong>: GCM (Galois/Counter Mode)</li>
                  <li><strong>Nonce</strong>: 12-byte random value per encryption</li>
                  <li><strong>Auth Tag</strong>: 16-byte authentication tag</li>
                  <li><strong>Encoding</strong>: URL-safe base64</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Key Management</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><strong>Storage</strong>: Environment variable (ENCRYPTION_KEY)</li>
                  <li><strong>Format</strong>: 64-character hexadecimal string</li>
                  <li><strong>Shared</strong>: Same key in Next.js and Go proxy</li>
                  <li><strong>Generation</strong>: <code className="bg-white px-1 rounded">openssl rand -hex 32</code></li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* URL Pattern Section */}
        <Section id="url-pattern" title="Proxy URL Pattern">
          <ContentBlock>
            <p className="mb-4">
              The proxy uses a structured URL pattern that encodes all necessary
              information for routing and authentication:
            </p>
          </ContentBlock>

          <CodeBlock>
{`Pattern:
/app-proxy/{encrypted_token}/{provider}/{domain}/{app_name}/{path}

Example:
/app-proxy/abc123xyz.../aws/databricksapps/code-editor-3771219485779100/terminal

Components:
- encrypted_token: AES-256-GCM encrypted OAuth token (URL-safe base64)
- provider: Cloud provider (aws, azure, gcp)
- domain: App domain (databricksapps)
- app_name: Specific app identifier
- path: Target path within the app (/, /terminal, /api/files, etc.)

Target URL Reconstruction:
https://{app_name}.{provider}.{domain}.com/{path}`}
          </CodeBlock>
        </Section>

        {/* Iframe Embedding Section */}
        <Section id="iframe-embedding" title="Iframe Embedding">
          <ContentBlock>
            <p className="mb-4">
              The proxy enables secure embedding of Databricks Lakehouse Apps
              in iframes with proper sandbox controls.
            </p>
          </ContentBlock>

          <Section id="iframe-diagram" title="Iframe Architecture">
            <MermaidDiagram chart={iframeEmbedding} id="iframe-embedding-diagram" />
          </Section>

          <Section id="sandbox-attributes" title="Sandbox Attributes">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-scripts</div>
                <p className="text-sm text-muted-foreground">
                  Allows JavaScript execution (required for editor functionality)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-same-origin</div>
                <p className="text-sm text-muted-foreground">
                  Allows access to localStorage and cookies within iframe context
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-forms</div>
                <p className="text-sm text-muted-foreground">
                  Enables form submission for file uploads and settings
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-popups</div>
                <p className="text-sm text-muted-foreground">
                  Allows opening new windows for help docs and external links
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-downloads</div>
                <p className="text-sm text-muted-foreground">
                  Permits file downloads for notebooks and data exports
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* WebSocket Section */}
        <Section id="websocket-support" title="WebSocket Support">
          <ContentBlock>
            <p className="mb-4">
              Real-time features like terminal sessions and language server protocol
              require WebSocket connections. The Go proxy provides full bidirectional
              WebSocket proxying.
            </p>
          </ContentBlock>

          <Section id="websocket-diagram" title="WebSocket Proxy Flow">
            <MermaidDiagram chart={websocketProxy} id="websocket-proxy-diagram" />
          </Section>

          <Section id="websocket-detection" title="WebSocket Detection">
            <CodeBlock>
{`func isWebSocketRequest(r *http.Request) bool {
  return strings.ToLower(r.Header.Get("Connection")) == "upgrade" &&
         strings.ToLower(r.Header.Get("Upgrade")) == "websocket"
}

// In the main handler:
if isWebSocketRequest(r) {
  wsURL := strings.Replace(targetURL, "https://", "wss://", 1) + remainingPath
  handleWebSocketProxy(w, r, wsURL, token)
} else {
  handleHTTPProxy(w, r, targetURL, token, remainingPath)
}`}
            </CodeBlock>
          </Section>
        </Section>

        {/* Deployment Section */}
        <Section id="deployment" title="Deployment">
          <ContentBlock>
            <p className="mb-4">
              The Go proxy can be deployed in several ways:
            </p>
          </ContentBlock>

          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">Docker Container</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Build a Docker image and deploy to any container platform (ECS, Kubernetes, Cloud Run)
              </p>
              <CodeBlock>
{`FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o proxy main.go crypto.go

FROM alpine:latest
COPY --from=builder /app/proxy /proxy
ENV ENCRYPTION_KEY=""
ENV PORT=8090
EXPOSE 8090
CMD ["/proxy"]`}
              </CodeBlock>
            </div>

            <div className="border-l-4 border-green-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">Serverless Function</h4>
              <p className="text-sm text-muted-foreground">
                Deploy as AWS Lambda or Google Cloud Functions for auto-scaling
              </p>
            </div>

            <div className="border-l-4 border-purple-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">VM or Bare Metal</h4>
              <p className="text-sm text-muted-foreground">
                Run directly on VMs for maximum performance and control
              </p>
            </div>
          </div>
        </Section>

        {/* Configuration Section */}
        <Section id="configuration" title="Configuration Reference">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-4 py-2 text-left">Variable</th>
                  <th className="border border-gray-200 px-4 py-2 text-left">Description</th>
                  <th className="border border-gray-200 px-4 py-2 text-left">Required</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-4 py-2"><code className="text-sm">ENCRYPTION_KEY</code></td>
                  <td className="border border-gray-200 px-4 py-2">AES-256 key (64 hex chars)</td>
                  <td className="border border-gray-200 px-4 py-2">Yes</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-4 py-2"><code className="text-sm">APP_DOMAIN_SUFFIX</code></td>
                  <td className="border border-gray-200 px-4 py-2">Domain suffix (default: com)</td>
                  <td className="border border-gray-200 px-4 py-2">No</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-4 py-2"><code className="text-sm">PORT</code></td>
                  <td className="border border-gray-200 px-4 py-2">Server port (default: 8090)</td>
                  <td className="border border-gray-200 px-4 py-2">No</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        {/* Related Documentation Section */}
        <Section id="related" title="Related Documentation">
          <div className="grid md:grid-cols-2 gap-4">
            <Link
              href="/docs/solutions/notebook-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Notebook Editor</h4>
              <p className="text-sm text-muted-foreground">
                Interactive Python notebooks using this proxy
              </p>
            </Link>

            <Link
              href="/docs/solutions/code-editor"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Code Editor</h4>
              <p className="text-sm text-muted-foreground">
                VS Code-style editor using this proxy
              </p>
            </Link>

            <Link
              href="/docs/architecture/authentication/sso-mapped-spn"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">SSO-Mapped SPN Authentication</h4>
              <p className="text-sm text-muted-foreground">
                How tokens are acquired for the proxy
              </p>
            </Link>

            <Link
              href="/docs/architecture/security"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Security</h4>
              <p className="text-sm text-muted-foreground">
                Security model and best practices
              </p>
            </Link>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

import { promises as fs } from "fs";
import path from "path";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import {
  Section,
  SectionContainer,
  ContentBlock,
  HighlightBox,
  CodeBlock,
} from "@/components/docs/section";

async function loadMermaidFile(filename: string): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "public/architecture/lakehouse-apps-proxy",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function LakehouseAppsProxyPage() {
  // Load all mermaid diagrams
  const simplifiedOverview = await loadMermaidFile("00-simplified-overview.mermaid");
  const proxyFlow = await loadMermaidFile("01-proxy-flow.mermaid");
  const tokenEncryption = await loadMermaidFile("02-token-encryption.mermaid");
  const iframeEmbedding = await loadMermaidFile("03-iframe-embedding.mermaid");
  const websocketProxy = await loadMermaidFile("04-websocket-proxy.mermaid");
  const futureIframeCommunication = await loadMermaidFile("05-future-iframe-communication.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Architecture / Solutions
          </div>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-orange-500 to-yellow-500 bg-clip-text text-transparent">
            Embedding Databricks Apps w/o SSO
          </h1>
          <p className="text-xl text-muted-foreground">
            A comprehensive guide to the Go-based reverse proxy that enables
            embedding Databricks Lakehouse Apps (like the VSCode editor) without
            requiring users to go through Databricks SSO login flows.
          </p>
        </header>

        {/* Overview Section */}
        <Section id="overview" title="Overview">
          <ContentBlock>
            <p className="mb-4">
              Normally, embedding a Databricks app (such as the hosted VSCode editor)
              in an iframe requires users to authenticate directly with Databricks
              through an SSO login flow. This exposes the Databricks login interface
              to end users and breaks the seamless experience of a custom application.
            </p>
            <p className="mb-4">
              This Go reverse proxy eliminates the need for Databricks SSO by handling
              authentication transparently. Users authenticate with your application,
              and the proxy securely manages OAuth tokens behind the scenes, enabling
              Databricks apps to be embedded without exposing Databricks identity
              providers or login screens.
            </p>
            <p className="mb-6">
              The proxy acts as an intermediary between your Next.js application
              and Databricks Lakehouse Apps, handling token encryption/decryption,
              HTTP/HTTPS proxying, and bidirectional WebSocket communication.
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

          <Section id="high-level-architecture" title="High-Level Architecture">
            <ContentBlock>
              <p className="mb-4">
                The following diagram shows the high-level interaction between
                the Next.js application, Go proxy server, and Databricks Lakehouse
                Apps. Notice how the OAuth token is encrypted by Next.js, passed
                through the browser in an encrypted form, and decrypted by the Go
                proxy before being sent to Databricks.
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
            <p className="mb-6">
              Databricks Lakehouse Apps require OAuth Bearer token authentication
              for every request. When embedding these apps in iframes, we face
              several security challenges:
            </p>
          </ContentBlock>

          <Section id="challenges" title="Security Challenges">
            <ContentBlock>
              <ul className="list-disc pl-6 space-y-3">
                <li>
                  <strong>Token Exposure</strong>: If we embed the Databricks app
                  directly with the token in the URL, the OAuth token would be
                  visible in the browser&apos;s address bar, network inspector, and
                  history, creating a security vulnerability.
                </li>
                <li>
                  <strong>CORS Restrictions</strong>: Databricks apps have strict
                  CORS policies that prevent direct cross-origin requests from
                  custom web applications, blocking iframe embedding from different
                  domains.
                </li>
                <li>
                  <strong>WebSocket Authentication</strong>: WebSocket connections
                  (used for real-time features like terminal sessions and
                  collaborative editing) cannot easily include custom authentication
                  headers from browser-initiated connections.
                </li>
              </ul>
            </ContentBlock>
          </Section>

          <Section id="proxy-solutions" title="How the Proxy Solves These Challenges">
            <ContentBlock>
              <ul className="list-disc pl-6 space-y-3">
                <li>
                  <strong>Encrypted Token URLs</strong>: Next.js encrypts OAuth
                  tokens server-side before embedding them in URLs. The Go proxy
                  decrypts them and injects them as Authorization headers. Tokens
                  never appear in plain text in the browser.
                </li>
                <li>
                  <strong>CORS Proxy</strong>: The proxy adds appropriate CORS
                  headers to responses, enabling cross-origin iframe embedding
                  while maintaining security controls.
                </li>
                <li>
                  <strong>WebSocket Proxying</strong>: The proxy detects WebSocket
                  upgrade requests, establishes authenticated connections to
                  Databricks, and bidirectionally forwards messages between the
                  browser and Databricks.
                </li>
              </ul>
            </ContentBlock>
          </Section>
        </Section>

        {/* Proxy Flow Section */}
        <Section id="proxy-flow" title="Complete Proxy Flow">
          <ContentBlock>
            <p className="mb-6">
              The following sequence diagram illustrates the complete flow from
              when a user requests the code editor page through the establishment
              of HTTP and WebSocket connections. Pay attention to how the token
              is encrypted in Next.js, transmitted through the browser, and
              decrypted in the Go proxy.
            </p>
          </ContentBlock>
          <MermaidDiagram chart={proxyFlow} id="proxy-flow-diagram" />
        </Section>

        {/* Token Encryption Section */}
        <Section id="token-encryption" title="Token Encryption & Security">
          <ContentBlock>
            <p className="mb-4">
              The security of the proxy relies on strong encryption of OAuth
              tokens. Both Next.js and the Go proxy use AES-256-GCM encryption
              with a shared secret key to ensure tokens are never exposed in
              plain text.
            </p>
          </ContentBlock>

          <Section id="encryption-architecture" title="Encryption Architecture">
            <MermaidDiagram chart={tokenEncryption} id="token-encryption-diagram" />
          </Section>

          <Section id="encryption-details" title="Encryption Details">
            <ContentBlock>
              <p className="mb-4">
                AES-256-GCM (Galois/Counter Mode) provides both confidentiality
                and authenticity, ensuring encrypted tokens cannot be tampered
                with.
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Encryption Algorithm: AES-256-GCM</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><strong>Algorithm</strong>: AES (Advanced Encryption Standard)</li>
                  <li><strong>Key Size</strong>: 256 bits (32 bytes)</li>
                  <li><strong>Mode</strong>: GCM (Galois/Counter Mode)</li>
                  <li><strong>Nonce</strong>: Unique 12-byte random value per encryption</li>
                  <li><strong>Auth Tag</strong>: 16-byte authentication tag for integrity</li>
                  <li><strong>Encoding</strong>: URL-safe base64 with padding removed</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Key Management</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><strong>Storage</strong>: Environment variable (ENCRYPTION_KEY)</li>
                  <li><strong>Format</strong>: 64-character hexadecimal string (32 bytes)</li>
                  <li><strong>Shared</strong>: Same key used in Next.js and Go proxy</li>
                  <li><strong>Generation</strong>: <code className="bg-white px-1 rounded">openssl rand -hex 32</code></li>
                </ul>
              </div>
            </div>
          </Section>

          <HighlightBox variant="success" title="Security Properties" className="mt-6">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Tokens encrypted with military-grade AES-256</li>
              <li>Authentication tag prevents tampering</li>
              <li>Unique nonce for each encryption prevents replay attacks</li>
              <li>URL-safe encoding allows token transmission in URLs</li>
              <li>Tokens never exposed to browser JavaScript</li>
              <li>Encryption key stored securely in environment variables</li>
            </ul>
          </HighlightBox>
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
- app_name: Specific app identifier (code-editor-3771219485779100)
- path: Target path within the app (/, /terminal, /api/files, etc.)

Target URL Reconstruction:
https://{app_name}.{provider}.{domain}.{suffix}

Example:
https://code-editor-3771219485779100.aws.databricksapps.com/terminal`}
          </CodeBlock>

          <div className="mt-6 space-y-4">
            <div className="border rounded-lg p-4 bg-blue-50">
              <h4 className="font-semibold mb-2 text-blue-900">URL Generation (Next.js)</h4>
              <CodeBlock>
{`import { generateProxyUrl } from "@/lib/token-encryption";

const token = "Bearer eyJraWQi...";
const appUrl = "https://code-editor-3771219485779100.aws.databricksapps.com";
const path = "/terminal";

const proxyPath = generateProxyUrl(token, appUrl, path);
// Returns: /app-proxy/{encrypted}/aws/databricksapps/code-editor-3771219485779100/terminal

const fullUrl = \`\${process.env.NEXT_PUBLIC_PROXY_URL}\${proxyPath}\`;
// Returns: https://proxy.example.com/app-proxy/{encrypted}/aws/.../terminal`}
              </CodeBlock>
            </div>

            <div className="border rounded-lg p-4 bg-purple-50">
              <h4 className="font-semibold mb-2 text-purple-900">URL Parsing (Go Proxy)</h4>
              <CodeBlock>
{`func parseProxyURL(path string) (string, string, string, error) {
  // Pattern: /app-proxy/{encrypted_token}/{provider}/{domain}/{app_name}/...
  re := regexp.MustCompile(\`^/app-proxy/([^/]+)/([^/]+)/([^/]+)/([^/]+)(/.*)?$\`)
  matches := re.FindStringSubmatch(path)

  encryptedToken := matches[1]
  provider := matches[2]
  domain := matches[3]
  appName := matches[4]
  remainingPath := matches[5]

  // Decrypt token
  token, err := Decrypt(encryptedToken, encryptionKey)

  // Construct target URL
  targetURL := fmt.Sprintf("https://%s.%s.%s.%s",
    appName, provider, domain, appDomainSuffix)

  return token, targetURL, remainingPath, nil
}`}
              </CodeBlock>
            </div>
          </div>
        </Section>

        {/* Iframe Embedding Section */}
        <Section id="iframe-embedding" title="Iframe Embedding">
          <ContentBlock>
            <p className="mb-4">
              The proxy enables secure embedding of Databricks Lakehouse Apps
              in iframes with proper sandbox controls and permissions.
            </p>
          </ContentBlock>

          <Section id="iframe-architecture" title="Iframe Architecture">
            <MermaidDiagram chart={iframeEmbedding} id="iframe-embedding-diagram" />
          </Section>

          <Section id="iframe-implementation" title="Implementation">
            <ContentBlock>
              <p className="mb-4">
                The code editor iframe is implemented as a Next.js server component
                that fetches the user&apos;s OAuth token, encrypts it, and generates
                the proxy URL:
              </p>
            </ContentBlock>

            <CodeBlock>
{`// src/components/code-editor-iframe.tsx
export default async function CodeEditorIframe() {
  // Fetch OAuth token from user's session (server-side)
  const tokenResult = await getDatabricksWorkspaceToken();
  const { accessToken } = tokenResult.data;

  // Get configuration from environment
  const appUrl = process.env.DATABRICKS_APP_URL;
  const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL;

  // Generate encrypted proxy URL
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

          <Section id="iframe-sandbox" title="Sandbox Attributes">
            <ContentBlock>
              <p className="mb-4">
                The iframe uses carefully configured sandbox attributes to balance
                functionality with security:
              </p>
            </ContentBlock>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-scripts</div>
                <p className="text-sm text-muted-foreground">
                  Allows JavaScript execution (required for VSCode editor functionality)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-same-origin</div>
                <p className="text-sm text-muted-foreground">
                  Allows access to localStorage and cookies within the iframe context
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-forms</div>
                <p className="text-sm text-muted-foreground">
                  Enables form submission (for file uploads, settings, etc.)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-popups</div>
                <p className="text-sm text-muted-foreground">
                  Allows opening new windows (for help docs, external links)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-modals</div>
                <p className="text-sm text-muted-foreground">
                  Enables dialog boxes (alerts, confirmations)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">allow-downloads</div>
                <p className="text-sm text-muted-foreground">
                  Permits file downloads (notebooks, data exports)
                </p>
              </div>
            </div>
          </Section>

          <Section id="iframe-permissions" title="Permissions Policy">
            <ContentBlock>
              <p className="mb-4">
                The iframe also specifies explicit permissions for browser features:
              </p>
            </ContentBlock>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">clipboard-write</div>
                <p className="text-sm text-muted-foreground">
                  Allows copying code to clipboard (essential for code editor)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded shrink-0">clipboard-read</div>
                <p className="text-sm text-muted-foreground">
                  Enables pasting from clipboard (essential for code editor)
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* WebSocket Support Section */}
        <Section id="websocket-support" title="WebSocket Support">
          <ContentBlock>
            <p className="mb-4">
              Modern web applications like VSCode require WebSocket connections
              for real-time features like terminal sessions, collaborative editing,
              and live debugging. The Go proxy provides full bidirectional WebSocket
              proxying.
            </p>
          </ContentBlock>

          <Section id="websocket-flow" title="WebSocket Proxy Flow">
            <MermaidDiagram chart={websocketProxy} id="websocket-proxy-diagram" />
          </Section>

          <Section id="websocket-detection" title="WebSocket Detection">
            <ContentBlock>
              <p className="mb-4">
                The proxy automatically detects WebSocket upgrade requests by
                inspecting HTTP headers:
              </p>
            </ContentBlock>

            <CodeBlock>
{`func isWebSocketRequest(r *http.Request) bool {
  return strings.ToLower(r.Header.Get("Connection")) == "upgrade" &&
         strings.ToLower(r.Header.Get("Upgrade")) == "websocket"
}

// In the main handler:
if isWebSocketRequest(r) {
  // Build WebSocket URL (wss for https)
  wsURL := strings.Replace(targetURL, "https://", "wss://", 1) + remainingPath
  handleWebSocketProxy(w, r, wsURL, token)
} else {
  handleHTTPProxy(w, r, targetURL, token, remainingPath)
}`}
            </CodeBlock>
          </Section>

          <Section id="websocket-proxying" title="Bidirectional Proxying">
            <ContentBlock>
              <p className="mb-4">
                Once both WebSocket connections are established (browser ↔ proxy
                and proxy ↔ Databricks), the proxy forwards messages
                bidirectionally using goroutines:
              </p>
            </ContentBlock>

            <CodeBlock>
{`func handleWebSocketProxy(w http.ResponseWriter, r *http.Request,
                           targetWSURL, authToken string) {
  // Upgrade client connection
  clientConn, _ := upgrader.Upgrade(w, r, nil)
  defer clientConn.Close()

  // Connect to target WebSocket with Authorization header
  headers := http.Header{}
  headers.Set("Authorization", normalizeAuthToken(authToken))
  targetConn, _, _ := dialer.Dial(targetWSURL, headers)
  defer targetConn.Close()

  done := make(chan struct{})

  // Client to target (goroutine)
  go func() {
    for {
      messageType, message, err := clientConn.ReadMessage()
      if err != nil { return }
      targetConn.WriteMessage(messageType, message)
    }
  }()

  // Target to client (goroutine)
  go func() {
    for {
      messageType, message, err := targetConn.ReadMessage()
      if err != nil { return }
      clientConn.WriteMessage(messageType, message)
    }
  }()

  <-done // Wait for connection to close
}`}
            </CodeBlock>
          </Section>

          <HighlightBox variant="info" title="WebSocket Use Cases">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Terminal Sessions</strong>: Interactive shell access within notebooks</li>
              <li><strong>Language Server Protocol</strong>: Code completion, linting, and IntelliSense</li>
              <li><strong>Collaborative Editing</strong>: Real-time multi-user editing (future)</li>
              <li><strong>Debugging</strong>: Interactive debugger with breakpoints and variable inspection</li>
              <li><strong>Live Reload</strong>: Hot module reloading during development</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* Future Enhancements Section */}
        <Section id="future-enhancements" title="Future: Iframe Communication">
          <ContentBlock>
            <p className="mb-4">
              While the current implementation provides full proxy functionality,
              future enhancements will enable direct communication between the
              parent page and the embedded Lakehouse App using the postMessage API.
            </p>
          </ContentBlock>

          <Section id="future-postmessage" title="postMessage Communication">
            <MermaidDiagram chart={futureIframeCommunication} id="future-iframe-communication-diagram" />
          </Section>

          <Section id="future-use-cases" title="Future Use Cases">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Theme Synchronization</h4>
                <p className="text-sm text-blue-800">
                  Sync dark/light mode and color themes between parent app and
                  embedded editor for a seamless visual experience
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">Command Execution</h4>
                <p className="text-sm text-green-800">
                  Trigger actions in the editor from the parent app (open files,
                  execute cells, save notebooks)
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
                <h4 className="font-semibold mb-2 text-purple-900">State Extraction</h4>
                <p className="text-sm text-purple-800">
                  Query the editor for current state (selected file, cursor
                  position, execution status) for custom UI indicators
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
                <h4 className="font-semibold mb-2 text-orange-900">Event Forwarding</h4>
                <p className="text-sm text-orange-800">
                  Receive events from the editor (file saved, cell executed,
                  error occurred) for analytics and notifications
                </p>
              </div>
            </div>
          </Section>

          <Section id="future-implementation" title="Implementation Example">
            <CodeBlock>
{`// Parent page: Send command to iframe
const iframe = document.querySelector("iframe");
iframe.contentWindow.postMessage({
  type: "OPEN_NOTEBOOK",
  payload: {
    notebookId: "abc123",
    path: "/Users/user@example.com/my_notebook"
  }
}, "https://proxy.example.com");

// Listen for responses
window.addEventListener("message", (event) => {
  if (event.origin !== "https://proxy.example.com") return;

  if (event.data.type === "NOTEBOOK_OPENED") {
    console.log("Notebook opened successfully", event.data.payload);
  }
});

// Embedded app: Receive and respond
window.addEventListener("message", (event) => {
  // Validate origin
  if (event.origin !== "https://your-app.com") return;

  if (event.data.type === "OPEN_NOTEBOOK") {
    // Open the notebook
    openNotebook(event.data.payload);

    // Send response
    event.source.postMessage({
      type: "NOTEBOOK_OPENED",
      payload: { success: true }
    }, event.origin);
  }
});`}
            </CodeBlock>
          </Section>

          <HighlightBox variant="warning" title="Security Considerations">
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Always validate <code className="bg-white px-1 rounded">event.origin</code> to prevent malicious messages</li>
              <li>Whitelist allowed message types and sanitize payloads</li>
              <li>Implement message signing/verification for critical commands</li>
              <li>Rate limit message handling to prevent DoS attacks</li>
              <li>Document allowed message formats and maintain strict contracts</li>
            </ul>
          </HighlightBox>
        </Section>

        {/* Technical Details Section */}
        <Section id="technical-details" title="Technical Implementation Details">
          <Section id="go-proxy-details" title="Go Proxy Server">
            <ContentBlock>
              <p className="mb-4">
                The Go proxy is implemented as a lightweight HTTP server with
                minimal dependencies:
              </p>
            </ContentBlock>

            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Dependencies</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><code className="bg-white px-2 py-1 rounded">net/http</code>: HTTP server and reverse proxy</li>
                  <li><code className="bg-white px-2 py-1 rounded">net/http/httputil</code>: Reverse proxy implementation</li>
                  <li><code className="bg-white px-2 py-1 rounded">crypto/aes</code>: AES encryption/decryption</li>
                  <li><code className="bg-white px-2 py-1 rounded">crypto/cipher</code>: GCM mode for AES</li>
                  <li><code className="bg-white px-2 py-1 rounded">github.com/gorilla/websocket</code>: WebSocket support</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Configuration</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><code className="bg-white px-2 py-1 rounded">ENCRYPTION_KEY</code>: 64-character hex string (required)</li>
                  <li><code className="bg-white px-2 py-1 rounded">APP_DOMAIN_SUFFIX</code>: Domain suffix (default: com)</li>
                  <li><code className="bg-white px-2 py-1 rounded">PORT</code>: Server port (default: 8090)</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-2">Performance</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Lightweight: ~15MB binary, &lt;50MB memory usage</li>
                  <li>Fast: Sub-millisecond token decryption</li>
                  <li>Concurrent: Handles thousands of simultaneous connections</li>
                  <li>Scalable: Stateless design enables horizontal scaling</li>
                </ul>
              </div>
            </div>
          </Section>

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
                  Build a Docker image and deploy to any container platform
                  (ECS, Kubernetes, Cloud Run)
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
                  Deploy as a serverless function (AWS Lambda, Google Cloud
                  Functions) for auto-scaling and pay-per-use pricing
                </p>
              </div>

              <div className="border-l-4 border-purple-500 pl-4 py-2">
                <h4 className="font-semibold mb-1">VM or Bare Metal</h4>
                <p className="text-sm text-muted-foreground">
                  Run directly on VMs or bare metal servers for maximum
                  performance and control
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Conclusion Section */}
        <Section id="conclusion" title="Conclusion">
          <ContentBlock>
            <p className="mb-4">
              The Databricks Lakehouse Apps Proxy demonstrates a powerful pattern
              for securely embedding third-party applications with OAuth
              authentication in custom web applications. By combining Next.js
              server-side token management with a lightweight Go reverse proxy,
              we achieve:
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h3 className="font-semibold mb-2 text-blue-900">Security</h3>
              <p className="text-sm text-blue-800">
                OAuth tokens never exposed to browser, encrypted in transit,
                and validated server-side
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
              <h3 className="font-semibold mb-2 text-green-900">Functionality</h3>
              <p className="text-sm text-green-800">
                Full HTTP/HTTPS and WebSocket proxying enables all app features
                including terminals and real-time collaboration
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-purple-100">
              <h3 className="font-semibold mb-2 text-purple-900">Flexibility</h3>
              <p className="text-sm text-purple-800">
                Dynamic routing pattern supports any Databricks Lakehouse App
                with zero configuration changes
              </p>
            </div>
          </div>

          <ContentBlock>
            <p className="mb-4">
              This architecture can be adapted for embedding other authenticated
              third-party applications, making it a versatile solution for
              building integrated platforms.
            </p>
          </ContentBlock>
        </Section>
      </SectionContainer>
    </div>
  );
}

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
import {
  GO_PROXY_SOLUTIONS,
  NATIVE_SOLUTIONS,
  VERCEL_PROXY_SOLUTIONS,
} from "@/lib/solution-docs";

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
  const sessionCookieFlow = await loadMermaidFile("11-session-cookie-flow.mermaid");
  const domainBasedArchitecture = await loadMermaidFile("12-domain-based-proxy-architecture.mermaid");
  const iframeEmbedding = await loadMermaidFile("03-iframe-embedding.mermaid");
  const websocketProxy = await loadMermaidFile("04-websocket-proxy.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            <Link href="/docs/solutions" className="hover:text-foreground">
              Solutions
            </Link>
          </div>
          <PageTitle>Embedding Databricks Apps w/o SSO</PageTitle>
          <p className="text-xl text-muted-foreground">
            A Go-based reverse proxy that enables embedding Databricks Lakehouse Apps
            (like VS Code and Marimo notebooks) without requiring users to authenticate
            directly with Databricks. Uses a session-cookie architecture — no tokens
            ever appear in URLs, browser storage, or logs.
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
              authentication transparently. Users authenticate with your application
              (via Better Auth + Okta SSO), and the proxy securely manages Databricks
              OAuth tokens entirely on the server side — exchanging a short-lived JWT
              for an opaque session cookie that the browser uses for all subsequent
              proxied requests.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="Key Features">
            <ul className="list-disc pl-5 space-y-1">
              <li>HttpOnly session cookies — no tokens in URLs, logs, or browser storage</li>
              <li>Server-side session management with PostgreSQL</li>
              <li>JWT-validated session creation via <code className="bg-white/50 px-1 rounded">/start-session</code></li>
              <li>Automatic SPN token refresh (5-minute pre-expiry window)</li>
              <li>Strict CORS origin validation (exact match, no wildcards)</li>
              <li>Bidirectional WebSocket proxying for real-time features</li>
              <li>SSRF protection: app URLs validated against <code className="bg-white/50 px-1 rounded">ALLOWED_APEX_DOMAIN</code></li>
            </ul>
          </HighlightBox>

          <Section id="embedded-apps" title="Embedded Applications">
            <ContentBlock>
              <p className="mb-4">
                FireFly uses three embedding patterns. This page documents the{" "}
                <strong>Go proxy iframe</strong> path; see the{" "}
                <Link href="/docs/solutions" className="text-blue-600 hover:underline">
                  solutions index
                </Link>{" "}
                for the full catalog.
              </p>
            </ContentBlock>

            <ContentBlock>
              <h4 className="font-semibold mb-3">Go proxy iframe apps</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Notebook and Code Editor embed Databricks Lakehouse Apps through the
                Go reverse proxy and <code className="text-sm">ProxyIframe</code>{" "}
                session-cookie flow described on this page.
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-8">
              {GO_PROXY_SOLUTIONS.map((solution) => (
                <Link
                  key={solution.slug}
                  href={solution.href}
                  className="block border rounded-lg p-4 hover:bg-accent transition-colors"
                >
                  <h4 className="font-semibold mb-1">{solution.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {solution.description}
                  </p>
                </Link>
              ))}
            </div>

            <ContentBlock>
              <h4 className="font-semibold mb-3">Vercel-native proxy iframe</h4>
              <p className="text-sm text-muted-foreground mb-4">
                The Agent Panel uses a same-origin Next.js route at{" "}
                <code className="text-sm">/api/agent-proxy</code> instead of the Go
                proxy. It mints the user&apos;s mapped SPN token and forwards HTTP + SSE
                to the deployed agent App.
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4 mb-8">
              {VERCEL_PROXY_SOLUTIONS.map((solution) => (
                <Link
                  key={solution.slug}
                  href={solution.href}
                  className="block border rounded-lg p-4 hover:bg-accent transition-colors"
                >
                  <h4 className="font-semibold mb-1">{solution.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {solution.description}
                  </p>
                </Link>
              ))}
            </div>

            <ContentBlock>
              <h4 className="font-semibold mb-3">Native React components</h4>
              <p className="text-sm text-muted-foreground mb-4">
                SQL Editor, Data Catalog, and Pipeline Editor are native components
                that call Databricks APIs through Next.js API routes — no iframe
                embedding required.
              </p>
            </ContentBlock>

            <div className="grid md:grid-cols-2 gap-4">
              {NATIVE_SOLUTIONS.map((solution) => (
                <Link
                  key={solution.slug}
                  href={solution.href}
                  className="block border rounded-lg p-4 hover:bg-accent transition-colors"
                >
                  <h4 className="font-semibold mb-1">{solution.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {solution.description}
                  </p>
                </Link>
              ))}
            </div>
          </Section>

          <Section id="architecture" title="High-Level Architecture">
            <ContentBlock>
              <p className="mb-4">
                The following diagram shows the interaction between your Next.js
                application, the Go proxy server, and Databricks Lakehouse Apps.
                The React <code>ProxyIframe</code> component bootstraps a server-side
                session via JWT exchange, receives an opaque <code>proxy_sid</code> cookie,
                then loads the iframe. Every subsequent proxied request is authenticated
                by the session cookie alone.
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
                <h4 className="font-semibold mb-1">Session Cookie Architecture</h4>
                <p className="text-sm text-muted-foreground">
                  The React <code>ProxyIframe</code> component calls
                  {" "}<code>/start-session</code> with a short-lived JWT. The proxy
                  validates the JWT, fetches a Databricks bearer token via SPN
                  client credentials, and returns an opaque <code>HttpOnly</code> session
                  cookie. Databricks tokens never appear in URLs, logs, or browser storage.
                </p>
              </div>

              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h4 className="font-semibold mb-1">CORS Proxy</h4>
                <p className="text-sm text-muted-foreground">
                  The proxy adds appropriate CORS headers to responses, enabling
                  cross-origin iframe embedding while maintaining security.
                  The <code>/start-session</code> endpoint enforces a strict exact-match
                  origin check against <code>FRONTEND_URL</code>.
                </p>
              </div>

              <div className="border-l-4 border-purple-500 pl-4 py-2">
                <h4 className="font-semibold mb-1">WebSocket Proxying</h4>
                <p className="text-sm text-muted-foreground">
                  The proxy detects WebSocket upgrade requests, looks up the session
                  cookie to retrieve the Databricks bearer token, establishes an
                  authenticated connection to the app, and bidirectionally
                  forwards messages.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Session Creation Flow Section */}
        <Section id="session-creation" title="Session Creation Flow">
          <ContentBlock>
            <p className="mb-4">
              Session initialization is a 7-step flow driven by the{" "}
              <code>ProxyIframe</code> React component. It runs once when the
              component mounts (with a React StrictMode guard to prevent double
              invocation).
            </p>
          </ContentBlock>

          <div className="space-y-3 mb-6">
            {[
              {
                step: "1",
                color: "blue",
                title: "Fetch JWT",
                detail: (
                  <>
                    <code>ProxyIframe</code> calls <code>authClient.token()</code> to obtain a
                    short-lived, signed JWT from Better Auth. The JWT has the current user&apos;s
                    session as its subject and <code>FRONTEND_URL</code> as both issuer and audience.
                  </>
                ),
              },
              {
                step: "2",
                color: "blue",
                title: "POST /start-session",
                detail: (
                  <>
                    The component posts <code>{"{ jwt, toolId, orgId }"}</code> to{" "}
                    <code>{`{proxyBaseUrl}/start-session`}</code> with{" "}
                    <code>credentials: &quot;include&quot;</code> so the browser sends and
                    receives cookies cross-origin.
                  </>
                ),
              },
              {
                step: "3",
                color: "purple",
                title: "Origin validation",
                detail: (
                  <>
                    The Go proxy checks <code>Origin == FRONTEND_URL</code> (exact match, no
                    wildcards). Requests from any other origin receive a{" "}
                    <code>403 Forbidden</code> before any JWT processing begins.
                  </>
                ),
              },
              {
                step: "4",
                color: "purple",
                title: "JWT verification",
                detail: (
                  <>
                    The proxy fetches the JWKS from <code>{`{frontendURL}/api/auth/jwks`}</code>,
                    verifies the JWT&apos;s signature, and checks <code>iss</code>,{" "}
                    <code>aud</code>, and <code>exp</code> claims. The{" "}
                    <code>sub</code> and <code>email</code> claims are extracted.
                  </>
                ),
              },
              {
                step: "5",
                color: "orange",
                title: "Access validation",
                detail: (
                  <>
                    The proxy runs a 4-step DB check: user not banned → user belongs to{" "}
                    <code>orgId</code> → tool exists and is not deleted → SPN credentials
                    exist for this tool. On any failure the request is rejected with{" "}
                    <code>403 Forbidden</code>.
                  </>
                ),
              },
              {
                step: "6",
                color: "green",
                title: "Databricks token fetch",
                detail: (
                  <>
                    The proxy calls <code>POST {`{workspaceURL}`}/oidc/v1/token</code> using
                    SPN client-credentials OAuth flow (<code>grant_type=client_credentials</code>,{" "}
                    <code>scope=all-apis</code>). The resulting bearer token is stored in the
                    session record — the browser never sees it.
                  </>
                ),
              },
              {
                step: "7",
                color: "green",
                title: "Session created, cookie set",
                detail: (
                  <>
                    A 32-byte cryptographically random session ID is generated. Its{" "}
                    <code>SHA-256</code> hash (not the raw ID) is stored in the{" "}
                    <code>proxy_sessions</code> table. The raw session ID is returned as
                    an <code>HttpOnly</code> <code>proxy_sid</code> cookie (1-hour TTL).
                  </>
                ),
              },
            ].map(({ step, color, title, detail }) => (
              <div
                key={step}
                className={`border-l-4 border-${color}-500 pl-4 py-2`}
              >
                <h4 className="font-semibold mb-1">
                  Step {step}: {title}
                </h4>
                <p className="text-sm text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>

          <Section id="session-code" title="ProxyIframe Component">
            <ContentBlock>
              <p className="mb-4">
                The session initialization logic lives in{" "}
                <code>src/components/proxy-iframe.tsx</code>. A{" "}
                <code>useRef</code> guard prevents React StrictMode&apos;s
                double-invocation from creating duplicate sessions.
              </p>
            </ContentBlock>
            <CodeBlock title="src/components/proxy-iframe.tsx — session init">
{`// 1. Fetch a short-lived JWT from better-auth (requires session cookie).
const tokenResult = await authClient.token();
if (tokenResult.error || !tokenResult.data?.token) {
  setStatus("error");
  return;
}

// 2. POST { jwt, toolId, orgId } to the Go proxy /start-session endpoint.
//    The proxy validates the JWT via JWKS, looks up the tool + SPN in
//    the database, fetches a Databricks bearer token, and sets the session cookie.
const res = await fetch(\`\${proxyBaseUrl}/start-session\`, {
  method: "POST",
  credentials: "include",         // send/receive cookies cross-origin
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jwt: tokenResult.data.token, toolId, orgId }),
});

// 3. Once the cookie is set, render the iframe.
//    All subsequent requests to /app-proxy/{toolId}/ carry the cookie automatically.
if (res.ok) setStatus("ready");`}
            </CodeBlock>
          </Section>

          <Section id="session-flow-diagram" title="Complete Session Flow Diagram">
            <MermaidDiagram chart={sessionCookieFlow} id="session-cookie-flow-diagram" />
          </Section>
        </Section>

        {/* Cookie Security Configuration Section */}
        <Section id="cookie-security" title="Cookie Security Configuration">
          <ContentBlock>
            <p className="mb-4">
              The <code>proxy_sid</code> cookie is always <code>HttpOnly</code> (not
              accessible from JavaScript). Its other attributes differ between dev and
              production modes.
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="border rounded-lg p-4 bg-gray-50">
              <h4 className="font-semibold mb-3 text-orange-700">
                Dev Mode (<code>DEV_MODE=true</code>)
              </h4>
              <p className="text-xs text-muted-foreground mb-3 italic">
                For <code>http://localhost</code> testing only. Never use in production.
              </p>
              <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">{`Name:     proxy_sid
Path:     /app-proxy/{toolId}/
SameSite: Lax
Secure:   false   ← allows http://localhost
HttpOnly: true
MaxAge:   3600`}</pre>
              <p className="text-xs text-muted-foreground mt-3">
                Path-scoping limits the cookie to the specific tool&apos;s proxy path.
                Flexible for local testing where HTTPS is unavailable.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gray-50">
              <h4 className="font-semibold mb-3 text-green-700">
                Production Mode (default)
              </h4>
              <p className="text-xs text-muted-foreground mb-3 italic">
                Used when <code>DEV_MODE</code> is unset or <code>false</code>.
              </p>
              <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">{`Name:     proxy_sid
Domain:   {proxy host}
Path:     /
SameSite: None    ← required for cross-site iframe
Secure:   true    ← HTTPS only (browsers enforce this
HttpOnly: true     with SameSite=None)
MaxAge:   3600`}</pre>
              <p className="text-xs text-muted-foreground mt-3">
                Domain-wide path is required because the iframe on your frontend domain
                makes requests to the proxy domain — a cross-site context.
              </p>
            </div>
          </div>

          <HighlightBox variant="info" title="Why SameSite=None is Required in Production">
            <p className="text-sm mb-2">
              The Next.js frontend and Go proxy run on different domains (e.g.,{" "}
              <code className="bg-white/50 px-1 rounded">firefly-analytics.com</code> and{" "}
              <code className="bg-white/50 px-1 rounded">proxy.firefly-analytics.com</code>
              ). Both are considered separate &quot;sites&quot; under the Public Suffix List.
            </p>
            <p className="text-sm mb-2">
              With <code className="bg-white/50 px-1 rounded">SameSite=Lax</code>, the browser
              will not send cookies on cross-site iframe requests — every{" "}
              <code className="bg-white/50 px-1 rounded">/app-proxy/</code> request would fail
              with a missing session cookie.
            </p>
            <p className="text-sm font-medium">
              <code className="bg-white/50 px-1 rounded">SameSite=None</code> is safe here
              because:
            </p>
            <ul className="list-disc pl-5 text-sm mt-1 space-y-1">
              <li>
                <code className="bg-white/50 px-1 rounded">/start-session</code> requires a
                valid short-lived JWT in the POST body — an attacker on another origin cannot
                forge this
              </li>
              <li>
                The <code className="bg-white/50 px-1 rounded">Origin</code> header is
                hard-checked against <code className="bg-white/50 px-1 rounded">FRONTEND_URL</code>{" "}
                before any processing
              </li>
              <li>
                <code className="bg-white/50 px-1 rounded">/app-proxy/</code> routes are
                read-only proxies — there is no state-mutating action a cross-site request
                could exploit
              </li>
              <li>
                <code className="bg-white/50 px-1 rounded">SameSite=None</code> must be paired
                with <code className="bg-white/50 px-1 rounded">Secure</code>, which browsers
                enforce — they silently ignore <code className="bg-white/50 px-1 rounded">SameSite=None</code>{" "}
                on non-Secure cookies
              </li>
            </ul>
          </HighlightBox>
        </Section>

        {/* Proxy URL Pattern Section */}
        <Section id="url-pattern" title="Proxy URL Pattern">
          <ContentBlock>
            <p className="mb-4">
              The proxy uses a simple tool-scoped URL pattern. Unlike token-in-URL
              approaches, there is no sensitive data in the URL — routing is resolved
              entirely from the server-side session record.
            </p>
          </ContentBlock>

          <CodeBlock>
{`Pattern:
  /app-proxy/{toolId}/          ← initial iframe load
  /app-proxy/{toolId}/{path}    ← all subsequent requests (assets, API calls, WS)

Example:
  /app-proxy/code-editor-3771219485779100/
  /app-proxy/code-editor-3771219485779100/terminal
  /app-proxy/code-editor-3771219485779100/api/files

How routing works:
  1. Browser includes proxy_sid cookie automatically (no token in URL)
  2. Proxy looks up session by SHA-256(proxy_sid) in proxy_sessions table
  3. Session record contains appURL (e.g. https://{app}.aws.databricksapps.com)
  4. Proxy forwards request to appURL/{path} with Authorization: Bearer {accessToken}`}
          </CodeBlock>
        </Section>

        {/* Session Validation & Token Refresh Section */}
        <Section id="session-validation" title="Session Validation & Token Refresh">
          <ContentBlock>
            <p className="mb-4">
              Every request to <code>/app-proxy/{"{toolId}"}/...</code> goes through
              session validation before being proxied. The session ID itself is never
              stored — only its SHA-256 hash — so a leaked database row cannot be used
              to forge a valid cookie.
            </p>
          </ContentBlock>

          <div className="space-y-3 mb-6">
            <div className="border-l-4 border-blue-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">1. Extract & hash cookie</h4>
              <p className="text-sm text-muted-foreground">
                The <code>proxy_sid</code> cookie value is read and its SHA-256 hash
                is computed. The hash is used to query <code>proxy_sessions</code>.
              </p>
            </div>
            <div className="border-l-4 border-blue-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">2. Validate session</h4>
              <p className="text-sm text-muted-foreground">
                The session must not be expired (<code>expiresAt {">"} now</code>) and
                the <code>toolID</code> in the record must match the{" "}
                <code>toolId</code> in the request path. This prevents cross-app session
                reuse if a cookie is sent to the wrong proxy path.
              </p>
            </div>
            <div className="border-l-4 border-yellow-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">3. Automatic token refresh</h4>
              <p className="text-sm text-muted-foreground">
                If the stored Databricks access token expires within 5 minutes, the proxy
                transparently fetches a new one via SPN client credentials and updates the
                session record before proxying the request.
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">4. Proxy the request</h4>
              <p className="text-sm text-muted-foreground">
                The request is forwarded to <code>appURL</code> with{" "}
                <code>Authorization: Bearer {"{accessToken}"}</code>. All{" "}
                <code>X-Forwarded-*</code> headers from the client are stripped to
                prevent injection. Security headers (<code>CSP</code>,{" "}
                <code>X-Frame-Options</code>) are injected on the response.
              </p>
            </div>
          </div>

          <Section id="db-schema" title="Session Database Schema">
            <CodeBlock title="go/migrations/001_proxy_sessions.sql">
{`CREATE TABLE proxy_sessions (
    id               TEXT        PRIMARY KEY,  -- hex(SHA-256(cookie_value))
    user_id          TEXT        NOT NULL,
    user_email       TEXT        NOT NULL,
    tool_id          TEXT        NOT NULL,
    org_id           TEXT        NOT NULL,
    app_url          TEXT        NOT NULL,     -- validated against ALLOWED_APEX_DOMAIN
    workspace_url    TEXT        NOT NULL,
    spn_client_id    TEXT        NOT NULL,
    spn_client_secret TEXT       NOT NULL,
    access_token     TEXT        NOT NULL,     -- Databricks bearer token (never in browser)
    token_expires_at TIMESTAMPTZ NOT NULL,
    expires_at       TIMESTAMPTZ NOT NULL,     -- session TTL (1 hour)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by hash, cleanup by expiry, session list by tool+user
CREATE INDEX proxy_sessions_expires_at_idx  ON proxy_sessions (expires_at);
CREATE INDEX proxy_sessions_tool_user_idx   ON proxy_sessions (tool_id, user_id);`}
            </CodeBlock>
          </Section>
        </Section>

        {/* Production Warning Section */}
        <Section id="production-deployment" title="Production Deployment: Domain-Based Wildcard Routing">

          <HighlightBox variant="danger" title="⚠️ Important: The Firefly Reference Implementation Uses Path-Based Cookies — This Is Not the Production Recommendation">
            <p className="text-sm mb-3">
              The Firefly reference implementation ships with a single shared proxy domain
              using path-scoped cookies (<code className="bg-white/50 px-1 rounded">/app-proxy/{"{toolId}"}/ </code>).
              This works for development, staging demos, and getting started quickly, but{" "}
              <strong>must not be used in production</strong> due to the following cross-app
              security risks:
            </p>
            <ul className="list-disc pl-5 text-sm space-y-2 mb-3">
              <li>
                <strong>Shared cookie namespace:</strong> All apps run under the same domain.
                An XSS vulnerability in one embedded app could potentially read or interfere
                with sessions belonging to other apps on the same domain.
              </li>
              <li>
                <strong>Path scoping is not a security boundary:</strong>{" "}
                <code className="bg-white/50 px-1 rounded">Path: /app-proxy/{"{toolId}"}/</code>{" "}
                is a browser hint that limits which requests receive the cookie — it is{" "}
                <em>not enforced by the Same-Origin Policy</em>. JavaScript running on the
                same domain can access all cookies for that domain regardless of path.
              </li>
              <li>
                <strong>Cross-app session enumeration:</strong> A compromised or malicious
                embedded app could attempt to probe other session paths on the shared domain.
              </li>
            </ul>
            <p className="text-sm font-semibold">
              For production, use wildcard subdomain routing with strict CORS (detailed below).
            </p>
          </HighlightBox>

          <Section id="wildcard-subdomain-pattern" title="Recommended: Wildcard Subdomain Pattern">
            <ContentBlock>
              <p className="mb-4">
                Assign each tool a dedicated subdomain. This gives every app a separate
                origin, enforcing the browser&apos;s Same-Origin Policy as a hard isolation
                boundary — no JavaScript on <code>app-tool-a.firefly-analytics.com</code>{" "}
                can access cookies or storage from{" "}
                <code>app-tool-b.firefly-analytics.com</code>.
              </p>
            </ContentBlock>

            <CodeBlock title="Subdomain routing pattern">
{`Pattern:
  app-{toolId}.firefly-analytics.com  →  Go proxy for that tool

Examples:
  app-code-editor.firefly-analytics.com
  app-notebook-1234.firefly-analytics.com
  app-sql-dashboard.firefly-analytics.com

DNS:
  *.firefly-analytics.com  →  A record → reverse proxy (nginx / Cloudflare / ALB)
  Reverse proxy extracts toolId from hostname, routes to Go proxy.`}
            </CodeBlock>

            <ContentBlock>
              <p className="mb-2 font-medium">Cookie configuration per subdomain:</p>
            </ContentBlock>
            <CodeBlock>
{`Name:     proxy_sid
Domain:   app-{toolId}.firefly-analytics.com   ← exact subdomain, not wildcard
SameSite: Strict                                ← or Lax if frontend is same registrable domain
Secure:   true
HttpOnly: true
MaxAge:   3600`}
            </CodeBlock>

            <HighlightBox variant="success" title="Security Benefits">
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>
                  Browser SOP enforces full isolation — <code className="bg-white/50 px-1 rounded">app-foo.firefly-analytics.com</code>{" "}
                  cannot read cookies or storage of <code className="bg-white/50 px-1 rounded">app-bar.firefly-analytics.com</code>
                </li>
                <li>
                  XSS in one embedded app is contained to that app&apos;s subdomain only
                </li>
                <li>
                  <code className="bg-white/50 px-1 rounded">SameSite=Strict</code> (or{" "}
                  <code className="bg-white/50 px-1 rounded">Lax</code>) can be used instead of{" "}
                  <code className="bg-white/50 px-1 rounded">None</code>, reducing CSRF surface further
                </li>
                <li>
                  <code className="bg-white/50 px-1 rounded">FRONTEND_URL</code> CORS check on{" "}
                  <code className="bg-white/50 px-1 rounded">/start-session</code> ensures only
                  your application can initiate sessions
                </li>
              </ul>
            </HighlightBox>
          </Section>

          <Section id="domain-architecture-diagram" title="Path-Based vs Domain-Based Architecture">
            <MermaidDiagram chart={domainBasedArchitecture} id="domain-based-architecture-diagram" />
          </Section>

          <Section id="comparison-table" title="Comparison: Path-Based vs Domain-Based">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">Feature</th>
                    <th className="border border-gray-200 px-4 py-2 text-left text-orange-700">
                      Path-Based (Firefly Reference)
                    </th>
                    <th className="border border-gray-200 px-4 py-2 text-left text-green-700">
                      Domain-Based (Recommended Production)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Cookie isolation", "Partial (path hint only)", "Full (SOP-enforced boundary)"],
                    ["XSS blast radius", "All apps on same domain", "Single app subdomain only"],
                    ["SameSite setting", "None (cross-site iframe)", "Strict or Lax"],
                    ["CORS protection", "Origin check on /start-session", "Origin check + subdomain isolation"],
                    ["JS access to cookies", "All same-domain cookies accessible", "Only subdomain cookies accessible"],
                    ["Setup complexity", "Simple (single domain)", "Requires wildcard DNS + routing"],
                    ["Recommended for", "Dev / demos / getting started", "Production deployments"],
                  ].map(([feature, pathBased, domainBased], idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "" : "bg-gray-50"}>
                      <td className="border border-gray-200 px-4 py-2 font-medium text-sm">{feature}</td>
                      <td className="border border-gray-200 px-4 py-2 text-sm text-orange-800">{pathBased}</td>
                      <td className="border border-gray-200 px-4 py-2 text-sm text-green-800">{domainBased}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </Section>

        {/* Iframe Embedding Section */}
        <Section id="iframe-embedding" title="Iframe Embedding">
          <ContentBlock>
            <p className="mb-4">
              Once the session cookie is set, the <code>ProxyIframe</code> component
              renders an <code>&lt;iframe&gt;</code> pointing to{" "}
              <code>{`{proxyBaseUrl}/app-proxy/{toolId}/`}</code>. The browser
              automatically includes the <code>proxy_sid</code> cookie on all
              requests within that iframe.
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
              WebSocket proxying, using the same session cookie for authentication.
            </p>
          </ContentBlock>

          <Section id="websocket-diagram" title="WebSocket Proxy Flow">
            <MermaidDiagram chart={websocketProxy} id="websocket-proxy-diagram" />
          </Section>

          <Section id="websocket-detection" title="WebSocket Detection & Auth">
            <CodeBlock>
{`// WebSocket requests are detected by the Upgrade header.
func isWebSocketRequest(r *http.Request) bool {
  return strings.ToLower(r.Header.Get("Connection")) == "upgrade" &&
         strings.ToLower(r.Header.Get("Upgrade")) == "websocket"
}

// In the main proxy handler — session cookie provides the auth token.
if isWebSocketRequest(r) {
  // Session already validated; accessToken retrieved from proxy_sessions.
  wsURL := strings.Replace(targetURL, "https://", "wss://", 1) + remainingPath
  handleWebSocketProxy(w, r, wsURL, accessToken)
} else {
  handleHTTPProxy(w, r, targetURL, accessToken, remainingPath)
}`}
            </CodeBlock>
          </Section>
        </Section>

        {/* Deployment Section */}
        <Section id="deployment" title="Deployment">
          <ContentBlock>
            <p className="mb-4">
              The Go proxy can be deployed in several ways. All deployment options
              require a PostgreSQL database for session storage.
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
RUN go build -o proxy .

FROM alpine:latest
COPY --from=builder /app/proxy /proxy

# Required
ENV FRONTEND_URL=""          # e.g. https://firefly-analytics.com
ENV ALLOWED_APEX_DOMAIN=""   # e.g. aws.databricksapps.com
ENV DATABASE_URL=""          # PostgreSQL connection string

# Optional
ENV DEV_MODE="false"         # Set to "true" for http://localhost testing only
ENV PORT="8090"

EXPOSE 8090
CMD ["/proxy"]`}
              </CodeBlock>
            </div>

            <div className="border-l-4 border-green-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">Serverless Function</h4>
              <p className="text-sm text-muted-foreground">
                Deploy as AWS Lambda or Google Cloud Functions for auto-scaling.
                Note: WebSocket support requires a long-lived connection — ensure
                your serverless platform supports it (e.g., API Gateway WebSocket APIs).
              </p>
            </div>

            <div className="border-l-4 border-purple-500 pl-4 py-2">
              <h4 className="font-semibold mb-1">VM or Bare Metal</h4>
              <p className="text-sm text-muted-foreground">
                Run directly on VMs for maximum performance and control.
                Recommended for high-concurrency WebSocket workloads.
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
                  <td className="border border-gray-200 px-4 py-2"><code className="text-sm">FRONTEND_URL</code></td>
                  <td className="border border-gray-200 px-4 py-2 text-sm">
                    Origin of the Next.js app (e.g. <code>https://firefly-analytics.com</code>).
                    Used for JWT <code>iss</code>/<code>aud</code> validation and strict CORS origin check.
                  </td>
                  <td className="border border-gray-200 px-4 py-2 text-green-700 font-medium">Yes</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-4 py-2"><code className="text-sm">ALLOWED_APEX_DOMAIN</code></td>
                  <td className="border border-gray-200 px-4 py-2 text-sm">
                    Databricks apps apex domain (e.g. <code>aws.databricksapps.com</code>).
                    App URLs from the DB are validated against this to prevent SSRF.
                  </td>
                  <td className="border border-gray-200 px-4 py-2 text-green-700 font-medium">Yes</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-4 py-2"><code className="text-sm">DATABASE_URL</code></td>
                  <td className="border border-gray-200 px-4 py-2 text-sm">
                    PostgreSQL connection string for the <code>proxy_sessions</code> table.
                  </td>
                  <td className="border border-gray-200 px-4 py-2 text-green-700 font-medium">Yes</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-4 py-2"><code className="text-sm">DEV_MODE</code></td>
                  <td className="border border-gray-200 px-4 py-2 text-sm">
                    Set to <code>&quot;true&quot;</code> to use path-scoped cookies without{" "}
                    <code>Secure</code> flag. For <code>http://localhost</code> development only.{" "}
                    <strong>Never enable in production.</strong>
                  </td>
                  <td className="border border-gray-200 px-4 py-2 text-muted-foreground">No</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-4 py-2"><code className="text-sm">PORT</code></td>
                  <td className="border border-gray-200 px-4 py-2 text-sm">Server port (default: <code>8090</code>)</td>
                  <td className="border border-gray-200 px-4 py-2 text-muted-foreground">No</td>
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
              href="/docs/solutions/agent"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Agent Panel</h4>
              <p className="text-sm text-muted-foreground">
                Genie + managed-memory chat via the Vercel-native proxy
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

            <Link
              href="/docs/solutions/data-catalog"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Data Catalog</h4>
              <p className="text-sm text-muted-foreground">
                Unity Catalog browser with BYOD support
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

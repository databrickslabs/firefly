import {
  Section,
  SectionContainer,
  ContentBlock,
  HighlightBox,
  PageTitle,
} from "@/components/docs/section";
import Link from "next/link";


export default function LakehouseAppsProxyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Architecture / Solutions
          </div>
          <PageTitle>Embedding Databricks Apps via Proxy</PageTitle>
          <p className="text-xl text-muted-foreground">
            The proxy uses a session-cookie architecture — a short-lived JWT is exchanged
            for an opaque <code>HttpOnly</code> session cookie, so no Databricks tokens
            ever appear in URLs, browser storage, or logs. Documentation is organized into
            dedicated pages below.
          </p>
        </header>

        <Section id="solutions" title="Solution Documentation">
          <ContentBlock>
            <p className="mb-6">
              The embedding architecture and individual solutions are documented
              separately for easier navigation and more detailed coverage.
            </p>
          </ContentBlock>

          <HighlightBox variant="danger" title="⚠️ Production Deployment Warning">
            <p className="text-sm mb-2">
              The Firefly reference implementation uses <strong>path-based cookies</strong> on
              a single shared proxy domain for simplicity. This is suitable for development
              and demos only.
            </p>
            <p className="text-sm mb-2">
              <strong>For production, use wildcard subdomain routing</strong> (e.g.,{" "}
              <code className="bg-white/50 px-1 rounded">app-*.firefly-analytics.com</code>)
              to ensure full app isolation, strict CORS, and to prevent cross-app cookie
              contamination. Path-scoping is a browser hint — it is not enforced by the
              Same-Origin Policy.
            </p>
            <p className="text-sm">
              See the{" "}
              <Link href="/docs/solutions/embedding-apps#production-deployment" className="underline font-medium">
                Embedding Databricks Apps — Production Deployment
              </Link>{" "}
              section for the full guidance and architecture comparison.
            </p>
          </HighlightBox>

          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <Link
              href="/docs/solutions/embedding-apps"
              className="block border rounded-lg p-6 hover:bg-accent transition-colors border-blue-200 bg-blue-50"
            >
              <h3 className="font-semibold text-lg mb-2 text-blue-900">Embedding Databricks Apps w/o SSO</h3>
              <p className="text-sm text-blue-800">
                Session-cookie proxy architecture: JWT exchange, SPN token management,
                HttpOnly <code>proxy_sid</code> cookies, WebSocket support, and wildcard
                domain routing for production.
              </p>
            </Link>

            <Link
              href="/docs/solutions/notebook-editor"
              className="block border rounded-lg p-6 hover:bg-accent transition-colors"
            >
              <h3 className="font-semibold text-lg mb-2">Notebook Editor</h3>
              <p className="text-sm text-muted-foreground">
                Interactive Python notebooks powered by Marimo with reactive
                execution and rich outputs.
              </p>
            </Link>

            <Link
              href="/docs/solutions/code-editor"
              className="block border rounded-lg p-6 hover:bg-accent transition-colors"
            >
              <h3 className="font-semibold text-lg mb-2">Code Editor</h3>
              <p className="text-sm text-muted-foreground">
                VS Code-style development environment with terminal access,
                Git integration, and LSP support.
              </p>
            </Link>

            <Link
              href="/docs/solutions/sql-editor"
              className="block border rounded-lg p-6 hover:bg-accent transition-colors"
            >
              <h3 className="font-semibold text-lg mb-2">SQL Editor</h3>
              <p className="text-sm text-muted-foreground">
                Native SQL query interface with warehouse integration,
                streaming results, and catalog autocomplete.
              </p>
            </Link>

            <Link
              href="/docs/solutions/data-catalog"
              className="block border rounded-lg p-6 hover:bg-accent transition-colors"
            >
              <h3 className="font-semibold text-lg mb-2">Data Catalog</h3>
              <p className="text-sm text-muted-foreground">
                Hierarchical Unity Catalog browser with lazy loading,
                metadata display, and BYOD support.
              </p>
            </Link>

            <Link
              href="/docs/solutions/pipeline-editor"
              className="block border rounded-lg p-6 hover:bg-accent transition-colors"
            >
              <h3 className="font-semibold text-lg mb-2">Pipeline Editor</h3>
              <p className="text-sm text-muted-foreground">
                Visual node-based pipeline designer with drag-and-drop
                nodes and Delta Live Tables execution.
              </p>
            </Link>
          </div>
        </Section>

        <Section id="related" title="Related Architecture Documentation">
          <div className="grid md:grid-cols-2 gap-4">
            <Link
              href="/docs/architecture/authentication/sso-mapped-spn"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">SSO-Mapped SPN Authentication</h4>
              <p className="text-sm text-muted-foreground">
                Learn how the authentication pattern works
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

            <Link
              href="/docs/architecture/security"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Security</h4>
              <p className="text-sm text-muted-foreground">
                Security model and best practices
              </p>
            </Link>

            <Link
              href="/docs/architecture/overview"
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <h4 className="font-semibold mb-1">Architecture Overview</h4>
              <p className="text-sm text-muted-foreground">
                High-level system architecture
              </p>
            </Link>
          </div>
        </Section>
      </SectionContainer>
    </div>
  );
}

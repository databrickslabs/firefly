import {
  Section,
  SectionContainer,
  ContentBlock,
  HighlightBox,
  PageTitle,
} from "@/components/docs/section";
import Link from "next/link";
import { SOLUTION_DOCS } from "@/lib/solution-docs";

const LAKEHOUSE_HUB_SLUGS = [
  "embedding-apps",
  "notebook-editor",
  "code-editor",
  "agent",
  "sql-editor",
  "data-catalog",
  "pipeline-editor",
] as const;

export default function LakehouseAppsProxyPage() {
  const hubSolutions = LAKEHOUSE_HUB_SLUGS.map(
    (slug) => SOLUTION_DOCS.find((s) => s.slug === slug)!
  );

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
            dedicated pages below — see also the{" "}
            <Link href="/docs/solutions" className="text-blue-600 hover:underline">
              full solutions index
            </Link>
            .
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
            {hubSolutions.map((solution) => {
              const featured = solution.slug === "embedding-apps";
              const vercelProxy = solution.slug === "agent";

              return (
                <Link
                  key={solution.slug}
                  href={solution.href}
                  className={`block border rounded-lg p-6 hover:bg-accent transition-colors ${
                    featured ? "border-blue-200 bg-blue-50 md:col-span-2" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3
                      className={`font-semibold text-lg ${
                        featured ? "text-blue-900" : ""
                      }`}
                    >
                      {solution.title}
                    </h3>
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {solution.embeddingLabel}
                    </span>
                  </div>
                  <p
                    className={`text-sm ${
                      featured ? "text-blue-800" : "text-muted-foreground"
                    }`}
                  >
                    {solution.description}
                    {vercelProxy && (
                      <>
                        {" "}
                        Uses <code className="text-xs">/api/agent-proxy</code> on the
                        same origin — no Go proxy required.
                      </>
                    )}
                    {featured && (
                      <>
                        {" "}
                        Session-cookie proxy architecture with JWT exchange, SPN token
                        management, WebSocket support, and wildcard domain routing for
                        production.
                      </>
                    )}
                  </p>
                </Link>
              );
            })}
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

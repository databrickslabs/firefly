import Link from "next/link";
import {
  Section,
  SectionContainer,
  ContentBlock,
  HighlightBox,
  PageTitle,
} from "@/components/docs/section";
import {
  GO_PROXY_SOLUTIONS,
  NATIVE_SOLUTIONS,
  SOLUTION_DOCS,
  VERCEL_PROXY_SOLUTIONS,
  type SolutionDoc,
} from "@/lib/solution-docs";

function SolutionCard({
  solution,
  featured = false,
}: {
  solution: SolutionDoc;
  featured?: boolean;
}) {
  return (
    <Link
      href={solution.href}
      className={`block border rounded-lg p-6 hover:bg-accent transition-colors ${
        featured ? "border-blue-200 bg-blue-50" : ""
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
      </p>
    </Link>
  );
}

export default function SolutionsIndexPage() {
  const overview = SOLUTION_DOCS.find((s) => s.slug === "embedding-apps")!;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">Solutions</div>
          <PageTitle>Platform Solutions</PageTitle>
          <p className="text-xl text-muted-foreground">
            FireFly ships seven documented solutions — three embedding patterns
            (Go proxy iframe, Vercel-native proxy iframe, and native React) — all
            sharing SSO-mapped SPN authentication so guests never see a Databricks
            login.
          </p>
        </header>

        <Section id="overview" title="Embedding Architecture">
          <ContentBlock>
            <p className="mb-6">
              Start with the proxy architecture overview, then drill into the
              individual solution that matches your use case.
            </p>
          </ContentBlock>
          <SolutionCard solution={overview} featured />
        </Section>

        <Section id="go-proxy" title="Go Proxy Iframe Apps" className="mt-12">
          <ContentBlock>
            <p className="mb-6">
              Notebook and Code Editor embed Databricks Lakehouse Apps through the
              Go reverse proxy and <code className="text-sm">ProxyIframe</code>{" "}
              session-cookie flow.
            </p>
          </ContentBlock>
          <div className="grid md:grid-cols-2 gap-4">
            {GO_PROXY_SOLUTIONS.map((solution) => (
              <SolutionCard key={solution.slug} solution={solution} />
            ))}
          </div>
        </Section>

        <Section id="vercel-proxy" title="Vercel-Native Proxy Iframe" className="mt-12">
          <ContentBlock>
            <p className="mb-6">
              The Agent Panel uses a same-origin Next.js route at{" "}
              <code className="text-sm">/api/agent-proxy</code> — no Go proxy or
              Cloud Run dependency. The route mints the user&apos;s mapped SPN token
              and forwards HTTP + SSE to the deployed agent App.
            </p>
          </ContentBlock>
          <div className="grid md:grid-cols-2 gap-4">
            {VERCEL_PROXY_SOLUTIONS.map((solution) => (
              <SolutionCard key={solution.slug} solution={solution} />
            ))}
          </div>
        </Section>

        <Section id="native" title="Native React Components" className="mt-12">
          <ContentBlock>
            <p className="mb-6">
              SQL Editor, Data Catalog, and Pipeline Editor are implemented as
              native React components that call Databricks APIs through Next.js API
              routes — no iframe embedding required.
            </p>
          </ContentBlock>
          <div className="grid md:grid-cols-2 gap-4">
            {NATIVE_SOLUTIONS.map((solution) => (
              <SolutionCard key={solution.slug} solution={solution} />
            ))}
          </div>
        </Section>

        <Section id="architecture" title="Related Architecture" className="mt-12">
          <HighlightBox variant="info" title="Architecture documentation">
            <p className="text-sm mb-4">
              For authentication, request flow, and production deployment guidance,
              see the architecture docs.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/docs/architecture/lakehouse-apps-proxy"
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                Apps Proxy hub
              </Link>
              <Link
                href="/docs/architecture/overview"
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                Architecture overview
              </Link>
              <Link
                href="/docs/architecture/authentication/sso-mapped-spn"
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                SSO-Mapped SPN
              </Link>
            </div>
          </HighlightBox>
        </Section>
      </SectionContainer>
    </div>
  );
}

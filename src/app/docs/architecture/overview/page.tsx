import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import {
  Section,
  SectionContainer,
  ContentBlock,
  HighlightBox,
  PageTitle,
} from "@/components/docs/section";
import { Button } from "@/components/ui/button";
import { Github, Globe } from "lucide-react";

// Tech stack data with GitHub and docs URLs
const frontendTech = [
  {
    name: "Next.js 15",
    description: "App Router, Server Components",
    github: "https://github.com/vercel/next.js",
    docs: "https://nextjs.org/docs",
  },
  {
    name: "React 19",
    description: "Modern React with hooks",
    github: "https://github.com/facebook/react",
    docs: "https://react.dev",
  },
  {
    name: "TanStack Query",
    description: "Data fetching & caching",
    github: "https://github.com/TanStack/query",
    docs: "https://tanstack.com/query/latest",
  },
  {
    name: "Tailwind CSS",
    description: "Utility-first styling",
    github: "https://github.com/tailwindlabs/tailwindcss",
    docs: "https://tailwindcss.com/docs",
  },
  {
    name: "shadcn/ui",
    description: "Accessible UI components",
    github: "https://github.com/shadcn-ui/ui",
    docs: "https://ui.shadcn.com",
  },
];

const backendTech = [
  {
    name: "Next.js API",
    description: "Server-side routes",
    github: "https://github.com/vercel/next.js",
    docs: "https://nextjs.org/docs/app/building-your-application/routing/route-handlers",
  },
  {
    name: "Better-Auth",
    description: "Authentication framework",
    github: "https://github.com/better-auth/better-auth",
    docs: "https://www.better-auth.com/docs",
  },
  {
    name: "Drizzle ORM",
    description: "Type-safe database access",
    github: "https://github.com/drizzle-team/drizzle-orm",
    docs: "https://orm.drizzle.team/docs/overview",
  },
  {
    name: "Lakebase (PostgreSQL)",
    description: "Primary database",
    github: "https://github.com/postgres/postgres",
    docs: "https://www.postgresql.org/docs/",
  },
  {
    name: "Zod",
    description: "Schema validation",
    github: "https://github.com/colinhacks/zod",
    docs: "https://zod.dev",
  },
];

function TechItem({ tech }: { tech: { name: string; description: string; github: string; docs: string } }) {
  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-semibold">{tech.name}</span>
        <span className="text-xs text-muted-foreground">{tech.description}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={tech.github} target="_blank" rel="noopener noreferrer" aria-label={`${tech.name} GitHub`}>
            <Github className="h-4 w-4" />
          </a>
        </Button>
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={tech.docs} target="_blank" rel="noopener noreferrer" aria-label={`${tech.name} Documentation`}>
            <Globe className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}

async function loadMermaidFile(filename: string): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "public/architecture/overview",
    filename
  );
  return await fs.readFile(filePath, "utf-8");
}

export default async function ArchitectureOverviewPage() {
  // Load all mermaid diagrams
  const tenKFootView = await loadMermaidFile("00-10k-foot-view.mermaid");
  const oneKFootView = await loadMermaidFile("01-1k-foot-view.mermaid");
  const detailedArchitecture = await loadMermaidFile("02-detailed-architecture.mermaid");
  const techStack = await loadMermaidFile("03-tech-stack.mermaid");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <SectionContainer>
        <header className="mb-12 border-b pb-8">
          <div className="text-sm text-muted-foreground mb-2">
            Architecture / Overview
          </div>
          <PageTitle>FireFly Analytics Architecture</PageTitle>
          <p className="text-xl text-muted-foreground">
            A comprehensive overview of FireFly Analytics using the <strong>SSO-SPN authentication model</strong> -
            where users authenticate via your identity provider (Okta, Azure AD, Auth0) and all Databricks
            API calls use organization-specific Service Principals. No Databricks accounts required for end users.
          </p>
        </header>

        {/* What is FireFly Section */}
        <Section id="what-is-firefly" title="What is FireFly Analytics?">
          <ContentBlock>
            <p className="mb-4">
              FireFly Analytics is an <strong>analytics platform</strong> built on top of
              Databricks using the <strong>SSO-SPN (Single Sign-On to Service Principal)</strong> architecture.
              Users authenticate via your existing identity provider, while all Databricks operations
              are performed using organization-specific Service Principals.
            </p>
            <p className="mb-6">
              This architecture allows organizations to provide their end users with a modern,
              customizable data experience while leveraging the full power of the Databricks
              Lakehouse - without requiring users to have individual Databricks accounts.
            </p>
          </ContentBlock>

          <HighlightBox variant="success" title="SSO-SPN Architecture Benefits">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>No Databricks accounts required</strong>: Users authenticate via your
                existing identity provider (Okta, Azure AD, Auth0, etc.) - not Databricks
              </li>
              <li>
                <strong>Centralized access control</strong>: Each organization has a dedicated
                Service Principal with specific Unity Catalog permissions
              </li>
              <li>
                <strong>Simplified onboarding</strong>: Add users to your identity provider,
                they immediately have access - no Databricks provisioning needed
              </li>
              <li>
                <strong>Clear audit trail</strong>: All API calls are traced to the organization&apos;s
                SPN, with user identity preserved in application logs
              </li>
              <li>
                <strong>Multi-tenant isolation</strong>: Each organization has its own SPN,
                workspace mappings, and Unity Catalog permissions
              </li>
            </ul>
          </HighlightBox>
        </Section>

        {/* 10,000 Foot View Section */}
        <Section id="10k-foot-view" title="10,000 Foot View">
          <ContentBlock>
            <p className="mb-4">
              At the highest level, FireFly Analytics sits between your end users and
              Databricks, acting as an intelligent proxy that handles authentication,
              authorization, and request orchestration.
            </p>
          </ContentBlock>

          <HighlightBox variant="info" title="The Big Picture">
            <p className="text-sm">
              Users interact with FireFly&apos;s modern web interface. FireFly translates
              their actions into Databricks API calls using organization-specific Service
              Principals. Users never need to know that Databricks exists under the hood.
            </p>
          </HighlightBox>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 my-6">
            <MermaidDiagram chart={tenKFootView} id="10k-foot-view-diagram" />
          </div>

          <div className="grid md:grid-cols-3 gap-4 mt-6">
            <div className="border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-slate-100">
              <h4 className="font-semibold mb-2">End Users</h4>
              <p className="text-sm text-muted-foreground">
                Data analysts, business users, and data scientists who need to access and
                analyze data without learning Databricks.
              </p>
            </div>
            <div className="border-2 border-orange-500 rounded-lg p-4 bg-gradient-to-br from-orange-50 to-orange-100">
              <h4 className="font-semibold mb-2 text-orange-900">FireFly Analytics</h4>
              <p className="text-sm text-orange-800">
                The platform that provides a beautiful, customizable interface for data
                exploration, SQL queries, and file management.
              </p>
            </div>
            <div className="border-2 border-blue-500 rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <h4 className="font-semibold mb-2 text-blue-900">Databricks</h4>
              <p className="text-sm text-blue-800">
                The powerful Lakehouse platform that stores data, executes queries, and
                provides Unity Catalog governance.
              </p>
            </div>
          </div>
        </Section>

        {/* 1,000 Foot View Section */}
        <Section id="1k-foot-view" title="1,000 Foot View">
          <ContentBlock>
            <p className="mb-4">
              Zooming in a bit, we can see the main components that make up the FireFly
              platform and how they interact with external services.
            </p>
          </ContentBlock>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 my-6">
            <MermaidDiagram chart={oneKFootView} id="1k-foot-view-diagram" />
          </div>

          <Section id="core-components" title="Core Components">
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                  Next.js Frontend
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  A modern React application with server-side rendering, TanStack Query
                  for data fetching, and shadcn/ui components.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Catalog browser with tree navigation</li>
                  <li>• SQL editor with syntax highlighting</li>
                  <li>• File explorer for volumes and DBFS</li>
                  <li>• Organization management UI</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-400"></span>
                  Next.js API Routes
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Server-side endpoints that handle all Databricks communication, ensuring
                  credentials never reach the browser.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Session validation middleware</li>
                  <li>• SPN token management</li>
                  <li>• Request proxying to Databricks</li>
                  <li>• Response caching</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  Better-Auth
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  A flexible authentication framework that integrates with any OAuth 2.0
                  or OIDC provider.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Session management</li>
                  <li>• Token validation</li>
                  <li>• Organization context</li>
                </ul>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                  Lakebase (PostgreSQL)
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Persistent storage for all platform data, with encrypted credentials
                  and proper isolation.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• User sessions</li>
                  <li>• Organizations & members</li>
                  <li>• Encrypted SPN credentials</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="authentication-flow" title="SSO-SPN Authentication Model">
            <HighlightBox variant="note" title="Two-Layer Authentication (SSO-SPN)">
              <p className="text-sm mb-2">
                The SSO-SPN model uses a <strong>two-layer authentication</strong> that completely
                separates user identity from Databricks access:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>
                  <strong>Layer 1 - User SSO</strong>: Users authenticate via your OAuth 2.0/OIDC
                  provider (Okta, Azure AD, Auth0, etc.). They never interact with Databricks directly.
                </li>
                <li>
                  <strong>Layer 2 - Service Principal</strong>: All Databricks API calls use the
                  organization&apos;s Service Principal. The SPN credentials are stored encrypted in
                  Lakebase (PostgreSQL) and tokens are managed server-side.
                </li>
              </ul>
            </HighlightBox>

            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div className="border-2 border-green-500 rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100">
                <h4 className="font-semibold mb-2 text-green-900">User Authentication (SSO)</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• OAuth 2.0 / OIDC flow with your IDP</li>
                  <li>• Session managed by Better-Auth</li>
                  <li>• Organization context stored in session</li>
                  <li>• No Databricks credentials exposed</li>
                </ul>
              </div>
              <div className="border-2 border-blue-500 rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100">
                <h4 className="font-semibold mb-2 text-blue-900">Databricks Access (SPN)</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• One Service Principal per organization</li>
                  <li>• OAuth client_credentials grant</li>
                  <li>• Token caching with auto-refresh</li>
                  <li>• All API calls use SPN bearer token</li>
                </ul>
              </div>
            </div>
          </Section>
        </Section>

        {/* Detailed Architecture Section */}
        <Section id="detailed-architecture" title="Detailed Architecture">
          <ContentBlock>
            <p className="mb-4">
              This diagram shows the complete architecture with all layers and their
              interactions. Understanding this flow is essential for customizing and
              extending FireFly.
            </p>
          </ContentBlock>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 my-6">
            <MermaidDiagram chart={detailedArchitecture} id="detailed-architecture-diagram" />
          </div>

          <Section id="layer-breakdown" title="Layer Breakdown">
            <div className="space-y-4">
              <div className="pl-4 border-l-4 border-slate-400 py-2">
                <h4 className="font-semibold mb-2">Client Layer</h4>
                <p className="text-sm text-muted-foreground">
                  The browser-based frontend built with Next.js and React. Uses TanStack Query
                  for efficient data fetching with caching and automatic background refetching.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-green-500 py-2">
                <h4 className="font-semibold mb-2">Authentication Layer</h4>
                <p className="text-sm text-muted-foreground">
                  Handles user authentication via OAuth 2.0/OIDC. Better-Auth manages sessions,
                  validates tokens, and maintains organization context for each user.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-orange-500 py-2">
                <h4 className="font-semibold mb-2">Backend Layer</h4>
                <p className="text-sm text-muted-foreground">
                  Next.js API routes with middleware for session validation and SPN token
                  management. All Databricks communication happens here, keeping credentials
                  server-side.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-yellow-500 py-2">
                <h4 className="font-semibold mb-2">Data Layer</h4>
                <p className="text-sm text-muted-foreground">
                  Lakebase (PostgreSQL) stores users, organizations, sessions, and encrypted SPN credentials.
                  Uses Drizzle ORM for type-safe database operations.
                </p>
              </div>

              <div className="pl-4 border-l-4 border-blue-500 py-2">
                <h4 className="font-semibold mb-2">Databricks Platform</h4>
                <p className="text-sm text-muted-foreground">
                  The Databricks Lakehouse providing Unity Catalog, SQL Warehouses, DBFS,
                  and more. FireFly accesses these via REST APIs using Service Principal tokens.
                </p>
              </div>
            </div>
          </Section>
        </Section>

        {/* Technology Stack Section */}
        <Section id="tech-stack" title="Technology Stack">
          <ContentBlock>
            <p className="mb-4">
              FireFly is built on modern, battle-tested technologies that enable
              rapid development and reliable operation.
            </p>
          </ContentBlock>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 my-6">
            <MermaidDiagram chart={techStack} id="tech-stack-diagram" />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Frontend Technologies</h4>
              <div className="space-y-2">
                {frontendTech.map((tech) => (
                  <TechItem key={tech.name} tech={tech} />
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-3">Backend Technologies</h4>
              <div className="space-y-2">
                {backendTech.map((tech) => (
                  <TechItem key={tech.name} tech={tech} />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Architecture Sections Overview */}
        <Section id="sections-overview" title="Documentation Sections">
          <ContentBlock>
            <p className="mb-6">
              Dive deeper into specific aspects of the SSO-SPN architecture with these
              detailed documentation sections.
            </p>
          </ContentBlock>

          <div className="grid md:grid-cols-2 gap-4">
            <Link
              href="/docs/architecture/request-flow"
              className="block border rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors group"
            >
              <h4 className="font-semibold mb-2 group-hover:text-orange-600">Request Flow</h4>
              <p className="text-sm text-muted-foreground">
                Follow a request from user SSO authentication through SPN token
                retrieval, Databricks API call, and response caching.
              </p>
            </Link>

            <Link
              href="/docs/architecture/iam/organizations"
              className="block border rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors group"
            >
              <h4 className="font-semibold mb-2 group-hover:text-orange-600">IAM & Organizations</h4>
              <p className="text-sm text-muted-foreground">
                Understand how organizations, Service Principals, and permissions work
                together to provide multi-tenant isolation.
              </p>
            </Link>

            <Link
              href="/docs/architecture/security"
              className="block border rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors group"
            >
              <h4 className="font-semibold mb-2 group-hover:text-orange-600">Security</h4>
              <p className="text-sm text-muted-foreground">
                Deep dive into authentication, encryption, multi-tenant isolation,
                access control, and comprehensive audit trails.
              </p>
            </Link>

            <Link
              href="/docs/architecture/scalability"
              className="block border rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors group"
            >
              <h4 className="font-semibold mb-2 group-hover:text-orange-600">Scalability</h4>
              <p className="text-sm text-muted-foreground">
                Learn how FireFly scales with auto-scaling apps, Serverless SQL,
                workspace isolation, and intelligent caching.
              </p>
            </Link>

            <Link
              href="/docs/architecture/lakehouse-apps-proxy"
              className="block border rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors group"
            >
              <h4 className="font-semibold mb-2 group-hover:text-orange-600">Apps Proxy</h4>
              <p className="text-sm text-muted-foreground">
                Learn how to embed Databricks Apps without exposing Databricks login
                flows to your end users.
              </p>
            </Link>
          </div>
        </Section>

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-orange-500 to-yellow-500 p-6 rounded-lg text-white mt-8">
          <h3 className="font-bold text-2xl mb-2">Ready to Dive Deeper?</h3>
          <p className="mb-4">
            Start with the Request Flow documentation to understand how SSO authentication
            and SPN token management work together, or explore the IAM docs to set up
            organizations and Service Principals.
          </p>
          <div className="flex gap-4">
            <Link
              href="/docs/architecture/request-flow"
              className="inline-block bg-white text-orange-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Request Flow
            </Link>
            <Link
              href="/docs/architecture/iam/organizations"
              className="inline-block bg-white/20 text-white border border-white px-6 py-2 rounded-lg font-semibold hover:bg-white/30 transition-colors"
            >
              IAM & Organizations
            </Link>
          </div>
        </div>
      </SectionContainer>
    </div>
  );
}

export type SolutionEmbeddingType =
  | "overview"
  | "go-proxy"
  | "vercel-proxy"
  | "native";

export interface SolutionDoc {
  slug: string;
  title: string;
  href: string;
  description: string;
  embeddingType: SolutionEmbeddingType;
  embeddingLabel: string;
}

export const SOLUTION_DOCS: SolutionDoc[] = [
  {
    slug: "embedding-apps",
    title: "Embedding Databricks Apps w/o SSO",
    href: "/docs/solutions/embedding-apps",
    description:
      "Embed Databricks apps without exposing Databricks SSO login flows to end users.",
    embeddingType: "overview",
    embeddingLabel: "Proxy architecture",
  },
  {
    slug: "notebook-editor",
    title: "Notebook Editor",
    href: "/docs/solutions/notebook-editor",
    description:
      "Interactive Python notebooks powered by Marimo with full Databricks integration.",
    embeddingType: "go-proxy",
    embeddingLabel: "Go proxy iframe",
  },
  {
    slug: "code-editor",
    title: "Code Editor",
    href: "/docs/solutions/code-editor",
    description:
      "VS Code-style development environment with terminal and Git support.",
    embeddingType: "go-proxy",
    embeddingLabel: "Go proxy iframe",
  },
  {
    slug: "agent",
    title: "Agent Panel",
    href: "/docs/solutions/agent",
    description:
      "Genie Agent + managed-memory chat assistant, embedded via a Vercel-native SPN proxy.",
    embeddingType: "vercel-proxy",
    embeddingLabel: "Vercel-native proxy iframe",
  },
  {
    slug: "sql-editor",
    title: "SQL Editor",
    href: "/docs/solutions/sql-editor",
    description:
      "Query your data with an advanced SQL editor and warehouse integration.",
    embeddingType: "native",
    embeddingLabel: "Native React component",
  },
  {
    slug: "data-catalog",
    title: "Data Catalog",
    href: "/docs/solutions/data-catalog",
    description:
      "Explore your Unity Catalog with a modern, hierarchical interface.",
    embeddingType: "native",
    embeddingLabel: "Native React component",
  },
  {
    slug: "pipeline-editor",
    title: "Pipeline Editor",
    href: "/docs/solutions/pipeline-editor",
    description:
      "Visual node-based pipeline design with Delta Live Tables integration.",
    embeddingType: "native",
    embeddingLabel: "Native React component",
  },
];

export const GO_PROXY_SOLUTIONS = SOLUTION_DOCS.filter(
  (s) => s.embeddingType === "go-proxy"
);
export const VERCEL_PROXY_SOLUTIONS = SOLUTION_DOCS.filter(
  (s) => s.embeddingType === "vercel-proxy"
);
export const NATIVE_SOLUTIONS = SOLUTION_DOCS.filter(
  (s) => s.embeddingType === "native"
);

export function getSolutionDoc(slug: string): SolutionDoc | undefined {
  return SOLUTION_DOCS.find((s) => s.slug === slug);
}

/** Order used in the Solutions nav dropdown. */
export const SOLUTION_NAV_SLUGS = [
  "notebook-editor",
  "code-editor",
  "sql-editor",
  "data-catalog",
  "agent",
  "pipeline-editor",
  "embedding-apps",
] as const;

export const SOLUTION_NAV_DOCS = SOLUTION_NAV_SLUGS.map(
  (slug) => getSolutionDoc(slug)!
);

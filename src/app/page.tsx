"use client";

import { useState } from "react";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";
import {
  Users,
  Shield,
  Layers,
  Database,
  BarChart3,
  FileCode,
  Code,
  GitBranch,
  Lock,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURE_TABS = [
  {
    id: "code-editor",
    label: "Code Editor",
    title: "Code Editor via Code Server",
    description:
      "Give your developers a full VS Code experience directly in the browser, connected to your Databricks environment.",
    features: [
      "Full VS Code experience in the browser",
      "Direct connection to Databricks clusters",
      "Git integration for version control",
      "Extension support for Python, SQL, and more",
    ],
    icon: Code,
    visual: {
      title: "Development Environment",
      items: ["VS Code Server", "Terminal Access", "Git Integration", "Extensions"],
    },
  },
  {
    id: "drag-drop-etl",
    label: "Drag & Drop ETL",
    title: "Visual Pipeline Builder",
    description:
      "Build data pipelines visually with a drag-and-drop interface. No coding required for common ETL patterns.",
    features: [
      "Visual pipeline designer",
      "Pre-built transformations and connectors",
      "Real-time data preview",
      "Automatic code generation",
    ],
    icon: GitBranch,
    visual: {
      title: "Pipeline Studio",
      items: ["Source Connectors", "Transformations", "Data Preview", "Auto-Deploy"],
    },
  },
  {
    id: "security",
    label: "Security & Governance",
    title: "Enterprise Security",
    description:
      "Built-in security controls and governance features to keep your data safe and compliant.",
    features: [
      "Role-based access control (RBAC)",
      "Unity Catalog integration",
      "Audit logging and compliance",
      "Data masking and encryption",
    ],
    icon: Lock,
    visual: {
      title: "Security Controls",
      items: ["RBAC", "Audit Logs", "Data Masking", "Encryption"],
    },
  },
  {
    id: "byod",
    label: "Bring Your Own Data",
    title: "Connect Any Data Source",
    description:
      "Import data from anywhere - local files, cloud storage, databases, or APIs.",
    features: [
      "Drag-and-drop file upload",
      "Cloud storage connectors (S3, ADLS, GCS)",
      "Database connections (PostgreSQL, MySQL, etc.)",
      "REST API data ingestion",
    ],
    icon: Upload,
    visual: {
      title: "Data Sources",
      items: ["File Upload", "Cloud Storage", "Databases", "REST APIs"],
    },
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("code-editor");
  const activeFeature = FEATURE_TABS.find((tab) => tab.id === activeTab)!;
  const ActiveIcon = activeFeature.icon;

  return (
    <div className="h-full overflow-auto flex flex-col">
      <MarketingNav />

      {/* Hero Section */}
      <section className="py-20 px-8 bg-background">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-start">
          {/* Left side - Hero content */}
          <div className="space-y-6">
            <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-sm font-medium rounded-full">
              Analytics Platform
            </span>
            <h1 className="text-5xl font-bold tracking-tight">
              Build exceptional
              <br />
              experiences with
              <br />
              <span className="text-orange-500">Databricks</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              A customizable analytics platform that enables organizations to
              deliver powerful data experiences to their users, powered by the
              Databricks Lakehouse.
            </p>
            <div className="flex gap-4 pt-4">
              <Button asChild className="bg-orange-500 hover:bg-orange-600">
                <Link href="/get-started">Get Started</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/docs/architecture/overview">Learn More</Link>
              </Button>
            </div>
          </div>

          {/* Right side - Feature cards */}
          <div className="space-y-4">
            <div className="p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <Users className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Multi-Tenant Organizations</h3>
                  <p className="text-sm text-muted-foreground">
                    Isolate data and access by organization
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Flexible Authentication</h3>
                  <p className="text-sm text-muted-foreground">
                    SSO integration, Service Principal mapping, or Databricks
                    native auth
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Layers className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Data Catalog Integration</h3>
                  <p className="text-sm text-muted-foreground">
                    Leverage Databricks governance with fine-grained access
                    controls
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <Database className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Unparalleled Scale & Security</h3>
                  <p className="text-sm text-muted-foreground">
                    Enterprise-grade infrastructure for all your data needs
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section with Tabs */}
      <section className="py-20 px-8 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-sm font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wide">
              Platform Features
            </span>
            <h2 className="text-3xl font-bold mt-2">
              Everything Your Organization Needs
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {FEATURE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-5 py-2.5 rounded-full text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-orange-500 text-white"
                    : "bg-white dark:bg-slate-800 text-muted-foreground hover:text-foreground border"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="grid md:grid-cols-2 gap-8">
            {/* Left side - Feature list */}
            <div className="space-y-6">
              <h3 className="text-xl font-semibold">{activeFeature.title}</h3>
              <p className="text-muted-foreground">{activeFeature.description}</p>

              <ul className="space-y-4">
                {activeFeature.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-orange-500 mt-0.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button asChild variant="outline" className="mt-4">
                <Link href="/docs/architecture/overview">Explore Architecture</Link>
              </Button>
            </div>

            {/* Right side - Visual card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border shadow-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <ActiveIcon className="w-5 h-5 text-orange-500" />
                <span className="font-semibold">{activeFeature.visual.title}</span>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <Database className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-sm">Databricks Lakehouse</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="p-2 bg-white dark:bg-slate-600 rounded">
                      Unity Catalog
                    </div>
                    <div className="p-2 bg-white dark:bg-slate-600 rounded">
                      SQL Warehouses
                    </div>
                    <div className="p-2 bg-white dark:bg-slate-600 rounded">
                      Volumes
                    </div>
                    <div className="p-2 bg-white dark:bg-slate-600 rounded">DBFS</div>
                  </div>
                </div>
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center gap-3 mb-3">
                    <BarChart3 className="w-5 h-5 text-orange-600" />
                    <span className="font-medium text-sm">
                      {activeFeature.visual.title}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {activeFeature.visual.items.map((item, index) => (
                      <div
                        key={index}
                        className="p-2 bg-white dark:bg-slate-700 rounded"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <FileCode className="w-5 h-5 text-purple-600" />
                    <span className="font-medium text-sm">Your Users</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Access data through your branded experience
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-8 bg-orange-500">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to build with FireFly?</h2>
          <p className="text-lg text-white/90 mb-8">
            Start building your customized Databricks experience today with our
            comprehensive platform and documentation.
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild size="lg" variant="secondary">
              <Link href="/get-started">Get Started</Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="bg-white/20 text-white hover:bg-white/30 border-0"
            >
              <a href="https://databrickslabs.github.io/partner-architecture/" target="_blank" rel="noopener noreferrer">
                Read the Databricks WAF
              </a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="bg-slate-100 dark:bg-slate-900 py-8 text-center text-sm text-muted-foreground border-t">
        <p>&copy; 2025 FireFly Analytics. Powered by Databricks.</p>
      </footer>
    </div>
  );
}

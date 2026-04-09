"use server";

import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { db } from "@/db";
import { authoringTool } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { ChevronRight, NotebookPen, Code2 } from "lucide-react";
import ProxyIframe from "@/components/proxy-iframe";

interface IDEViewPageProps {
  params: Promise<{ orgId: string; toolId: string }>;
}

async function IDEIframe({ toolId, orgId }: { toolId: string; orgId: string }) {
  // Get the user's session
  const auth = await getAuthInstance();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.session || !session?.user) {
    redirect("/sso-spn");
  }

  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    redirect("/sso-spn");
  }

  // Fetch the authoring tool — verify it belongs to this org and user.
  const [tool] = await db
    .select()
    .from(authoringTool)
    .where(
      and(
        eq(authoringTool.id, toolId),
        eq(authoringTool.organizationId, organizationId),
        eq(authoringTool.createdByUserId, session.user.id),
        isNull(authoringTool.deletedAt)
      )
    )
    .limit(1);

  if (!tool) {
    notFound();
  }

  const ToolIcon = tool.type === "MARIMO" ? NotebookPen : Code2;

  // Check if the tool has an app URL configured.
  if (!tool.appUrl) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3">
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href={`/sso-spn/${orgId}/ide`}
              className="text-slate-500 hover:text-slate-900 transition-colors"
            >
              IDE Environments
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <div className="flex items-center gap-2 text-slate-900 font-medium">
              <ToolIcon className="h-4 w-4" />
              <span>{tool.name}</span>
            </div>
          </nav>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-100/80">
          <div className="text-center">
            <p className="text-slate-600">This environment does not have an app URL yet.</p>
            <p className="text-sm text-slate-500 mt-2">
              Please start the environment and complete setup first.
            </p>
            <Link
              href={`/sso-spn/${orgId}/ide`}
              className="inline-block mt-4 text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Back to IDE Environments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL;
  if (!proxyBaseUrl) {
    throw new Error("NEXT_PUBLIC_PROXY_URL environment variable is required");
  }

  const toolTypeLabel = tool.type === "MARIMO" ? "Marimo Notebook" : "Code Server IDE";

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3">
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href={`/sso-spn/${orgId}/ide`}
            className="text-slate-500 hover:text-slate-900 transition-colors"
          >
            IDE Environments
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <div className="flex items-center gap-2 text-slate-900 font-medium">
            <ToolIcon className="h-4 w-4" />
            <span>{tool.name}</span>
          </div>
        </nav>
      </div>

      {/* Proxy iframe — session init and token fetch handled by the Go proxy via JWT + DB */}
      <div className="flex-1 overflow-hidden bg-slate-100/80 px-4 py-4">
        <div className="h-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <ProxyIframe
            toolId={toolId}
            orgId={organizationId}
            proxyBaseUrl={proxyBaseUrl}
            title={`${tool.name} - ${toolTypeLabel}`}
          />
        </div>
      </div>
    </div>
  );
}

export default async function IDEViewPage({ params }: IDEViewPageProps) {
  const { toolId, orgId } = await params;

  return (
    <div className="h-full w-full overflow-hidden">
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center bg-slate-100/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading IDE environment...</p>
            </div>
          </div>
        }
      >
        <IDEIframe toolId={toolId} orgId={orgId} />
      </Suspense>
    </div>
  );
}

export async function generateMetadata({ params }: IDEViewPageProps) {
  const { toolId } = await params;

  const auth = await getAuthInstance();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.session?.activeOrganizationId) {
    return {
      title: "IDE Environment | Databricks",
      description: "IDE Environment",
    };
  }

  const [tool] = await db
    .select()
    .from(authoringTool)
    .where(eq(authoringTool.id, toolId))
    .limit(1);

  const toolTypeLabel = tool?.type === "MARIMO" ? "Marimo Notebook" : "Code Server IDE";

  return {
    title: tool ? `${tool.name} | ${toolTypeLabel}` : "IDE Environment | Databricks",
    description: tool?.description || "IDE Environment",
  };
}

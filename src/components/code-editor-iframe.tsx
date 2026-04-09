import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProxyIframe from "@/components/proxy-iframe";

/**
 * Server component that wires up a ProxyIframe for the default code editor tool.
 * toolId is supplied via DATABRICKS_CODE_TOOL_ID; orgId is taken from the session.
 */
export default async function CodeEditorIframe() {
  const auth = await getAuthInstance();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.session?.activeOrganizationId) {
    redirect("/databricks-idp/select-org");
  }

  const toolId = process.env.DATABRICKS_CODE_TOOL_ID;
  if (!toolId) {
    throw new Error("DATABRICKS_CODE_TOOL_ID environment variable is required");
  }

  const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL;
  if (!proxyBaseUrl) {
    throw new Error("NEXT_PUBLIC_PROXY_URL environment variable is required");
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden bg-slate-100/80 px-4 py-4">
        <div className="h-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <ProxyIframe
            toolId={toolId}
            orgId={session.session.activeOrganizationId}
            proxyBaseUrl={proxyBaseUrl}
            title="Code Editor"
          />
        </div>
      </div>
    </div>
  );
}

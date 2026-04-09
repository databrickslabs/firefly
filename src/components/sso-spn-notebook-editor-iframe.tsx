import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProxyIframe from "@/components/proxy-iframe";

/**
 * SSO-SPN variant: wires up a ProxyIframe for the default notebook editor tool.
 * toolId is supplied via DATABRICKS_NOTEBOOK_TOOL_ID; orgId is taken from the session.
 * Redirects to /sso-spn on auth failure instead of /databricks-idp.
 */
export default async function SsoSpnNotebookEditorIframe() {
  const auth = await getAuthInstance();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.session?.activeOrganizationId) {
    redirect("/sso-spn");
  }

  const toolId = process.env.DATABRICKS_NOTEBOOK_TOOL_ID;
  if (!toolId) {
    throw new Error("DATABRICKS_NOTEBOOK_TOOL_ID environment variable is required");
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
            title="Notebook Editor (SPN)"
          />
        </div>
      </div>
    </div>
  );
}

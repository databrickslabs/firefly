import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { generateProxyUrl } from "@/lib/token-encryption";
import { redirect } from "next/navigation";

/**
 * Server-side component that fetches the user's Databricks OAuth token
 * and generates an encrypted proxy URL for the code editor iframe.
 */
export default async function CodeEditorIframe() {
  // Fetch the user's Databricks workspace token from the session
  const tokenResult = await getDatabricksWorkspaceToken();

  if (!tokenResult.success) {
    // Redirect to login if no token is available
    console.error("Failed to get Databricks token:", tokenResult.error);
    redirect("/databricks-idp/select-org");
  }

  const { accessToken } = tokenResult.data;

  // Get app URL from environment
  const appUrl = process.env.DATABRICKS_APP_URL;
  if (!appUrl) {
    throw new Error("DATABRICKS_APP_URL environment variable is required");
  }

  // Get proxy base URL from environment
  const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL;
  if (!proxyBaseUrl) {
    throw new Error("NEXT_PUBLIC_PROXY_URL environment variable is required");
  }

  // Generate the encrypted proxy URL
  // The token will be encrypted and embedded in the URL
  const proxyPath = generateProxyUrl(accessToken, appUrl, "/");
  const fullProxyUrl = `${proxyBaseUrl}${proxyPath}`;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden bg-slate-100/80 px-4 py-4">
        <div className="h-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <iframe
            src={fullProxyUrl}
            className="w-full h-full border-0"
            title="Code Editor"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
            allow="clipboard-write; clipboard-read"
          />
        </div>
      </div>
    </div>
  );
}

import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { generateProxyUrl } from "@/lib/token-encryption";

/**
 * Configuration for a Databricks app
 */
export interface DatabricksAppConfig {
  name: string;
  url: string;
  description?: string;
}

/**
 * Generates a proxy URL for a Databricks app using the current user's OAuth token
 *
 * @param appUrl - The Databricks app URL (e.g., https://app-name.aws.databricksapps.com)
 * @param path - Optional path within the app (default: "/")
 * @returns Object with success status and either the proxy URL or an error
 */
export async function generateDatabricksAppProxyUrl(
  appUrl: string,
  path: string = "/"
): Promise<
  | { success: true; proxyUrl: string }
  | { success: false; error: string; status: number }
> {
  // Get the user's Databricks workspace token
  const tokenResult = await getDatabricksWorkspaceToken();

  if (!tokenResult.success) {
    return {
      success: false,
      error: tokenResult.error.error,
      status: tokenResult.error.status,
    };
  }

  const { accessToken } = tokenResult.data;

  // Get proxy base URL from environment
  const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL;
  if (!proxyBaseUrl) {
    return {
      success: false,
      error: "NEXT_PUBLIC_PROXY_URL environment variable is not configured",
      status: 500,
    };
  }

  try {
    // Generate the encrypted proxy URL
    const proxyPath = generateProxyUrl(accessToken, appUrl, path);
    const fullProxyUrl = `${proxyBaseUrl}${proxyPath}`;

    return {
      success: true,
      proxyUrl: fullProxyUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate proxy URL: ${String(error)}`,
      status: 500,
    };
  }
}

/**
 * Common Databricks apps that can be proxied
 */
export const DATABRICKS_APPS = {
  CODE_EDITOR: process.env.DATABRICKS_APP_URL || "",
  // Add more apps as needed
  // STREAMLIT: "https://streamlit-app-id.aws.databricksapps.com",
  // DASH: "https://dash-app-id.aws.databricksapps.com",
} as const;

/**
 * Gets the configured code editor app URL
 */
export function getCodeEditorUrl(): string {
  const url = process.env.DATABRICKS_APP_URL;
  if (!url) {
    throw new Error(
      "DATABRICKS_APP_URL environment variable is required. Please set it in your .env.local file."
    );
  }
  return url;
}

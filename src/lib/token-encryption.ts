/**
 * Parses a Databricks app URL and extracts the routing components.
 *
 * Expected format: https://{app_name}.{provider}.{domain}.{suffix}
 * Example: https://code-editor-123.aws.databricksapps.com
 *   → { appName: "code-editor-123", provider: "aws", domain: "databricksapps" }
 *
 * @deprecated The proxy no longer uses provider/domain/appName for routing.
 * Sessions are now keyed by toolId and the target URL comes from the DB.
 * This function is kept for documentation and legacy reference only.
 */
export function parseAppUrl(appUrl: string): {
  provider: string;
  domain: string;
  appName: string;
} {
  const url = new URL(appUrl);
  const hostParts = url.hostname.split(".");

  if (hostParts.length < 3) {
    throw new Error(`Invalid app URL format: ${appUrl}`);
  }

  const appName = hostParts[0];
  const provider = hostParts[1];
  // Remove the suffix (last part) and join remaining parts as domain
  const domain = hostParts.slice(2, -1).join(".");

  return { appName, provider, domain };
}

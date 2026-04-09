/**
 * Returns the proxy base URL and the toolId/orgId needed for a
 * cookie-based proxy session via the Go proxy.
 *
 * The caller POSTs { jwt, toolId, orgId } to {proxyBaseUrl}/start-session
 * to get a session cookie, then navigates the iframe to
 * {proxyBaseUrl}/app-proxy/{toolId}/.
 *
 * NOTE: The Go proxy validates the JWT, looks up the tool in the DB,
 * fetches SPN credentials, and obtains the Databricks bearer token itself.
 * No Databricks credentials flow through the browser.
 */
export function getProxyBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_PROXY_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_PROXY_URL environment variable is required");
  }
  return url;
}

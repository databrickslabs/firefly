import { NextResponse } from "next/server";
import { getProxyBaseUrl } from "@/lib/databricks-app-proxy";

/**
 * Returns the proxy base URL so the client knows where to send
 * POST /start-session requests.
 *
 * The caller should:
 *  1. Fetch a JWT from authClient.token()
 *  2. POST { jwt, toolId, orgId } to {proxyBaseUrl}/start-session
 *     with credentials: 'include'
 *  3. Navigate the iframe to {proxyBaseUrl}/app-proxy/{toolId}/
 *
 * POST /api/proxy/generate-url
 * Body: { toolId: string; orgId: string }
 *
 * Response: { toolId, orgId, proxyBaseUrl }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { toolId, orgId } = body as { toolId?: string; orgId?: string };

    if (!toolId || !orgId) {
      return NextResponse.json(
        { error: "toolId and orgId are required" },
        { status: 400 }
      );
    }

    const proxyBaseUrl = getProxyBaseUrl();

    return NextResponse.json({ toolId, orgId, proxyBaseUrl });
  } catch (error) {
    console.error("Error in generate-url:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

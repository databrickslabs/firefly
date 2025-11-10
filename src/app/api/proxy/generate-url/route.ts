import { generateDatabricksAppProxyUrl } from "@/lib/databricks-app-proxy";
import { NextRequest, NextResponse } from "next/server";

/**
 * API route to generate a proxy URL for a Databricks app
 *
 * POST /api/proxy/generate-url
 * Body: { appUrl: string, path?: string }
 *
 * Example:
 * POST /api/proxy/generate-url
 * {
 *   "appUrl": "https://code-editor-3771219485779100.aws.databricksapps.com",
 *   "path": "/"
 * }
 *
 * Response:
 * {
 *   "proxyUrl": "http://localhost:8090/app-proxy/{encrypted_token}/aws/databricksapps/code-editor-3771219485779100/"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appUrl, path = "/" } = body;

    if (!appUrl) {
      return NextResponse.json(
        { error: "appUrl is required" },
        { status: 400 }
      );
    }

    // Generate the proxy URL
    const result = await generateDatabricksAppProxyUrl(appUrl, path);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      proxyUrl: result.proxyUrl,
    });
  } catch (error) {
    console.error("Error generating proxy URL:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

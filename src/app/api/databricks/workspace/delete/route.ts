import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";

export const dynamic = "force-dynamic";

export interface DeleteRequest {
  path: string;
  recursive?: boolean;
}

export async function POST(request: Request) {
  try {
    const tokenResult = await getDatabricksWorkspaceToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;
    const body: DeleteRequest = await request.json();

    if (!body.path) {
      return NextResponse.json(
        { error: "Missing required parameter: path" },
        { status: 400 }
      );
    }

    const apiUrl = `${workspaceUrl}/api/2.0/workspace/delete`;

    console.log("=== DATABRICKS WORKSPACE DELETE DEBUG ===");
    console.log("API URL:", apiUrl);
    console.log("Path:", body.path);
    console.log("Recursive:", body.recursive || false);

    const databricksResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: body.path,
        recursive: body.recursive || false,
      }),
    });

    console.log("Response Status:", databricksResponse.status);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to delete workspace object",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error deleting workspace object:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

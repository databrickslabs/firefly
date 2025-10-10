import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ commandId: string }> }
) {
  try {
    const tokenResult = await getDatabricksWorkspaceToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;
    const { commandId } = await params;
    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get("cluster_id");
    const contextId = searchParams.get("context_id");

    if (!clusterId || !contextId) {
      return NextResponse.json(
        { error: "cluster_id and context_id are required" },
        { status: 400 }
      );
    }

    // Get command status
    const apiUrl = `${workspaceUrl}/api/1.2/commands/status?clusterId=${clusterId}&contextId=${contextId}&commandId=${commandId}`;

    console.log("=== CHECKING COMMAND STATUS ===");
    console.log("API URL:", apiUrl);
    console.log("Command ID:", commandId);

    const databricksResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Response Status:", databricksResponse.status);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        { error: "Failed to get command status", details: errorText },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();

    // Log the complete response for debugging
    console.log("=== COMMAND STATUS RESPONSE ===");
    console.log("Status:", data.status);
    console.log("Results:", JSON.stringify(data.results, null, 2));

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error getting command status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";

export const dynamic = "force-dynamic";

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
    const body = await request.json();
    const { cluster_id, context_id } = body;

    if (!cluster_id || !context_id) {
      return NextResponse.json(
        { error: "cluster_id and context_id are required" },
        { status: 400 }
      );
    }

    // Destroy execution context
    const apiUrl = `${workspaceUrl}/api/1.2/contexts/destroy`;

    console.log("=== DESTROYING EXECUTION CONTEXT ===");
    console.log("API URL:", apiUrl);
    console.log("Cluster ID:", cluster_id);
    console.log("Context ID:", context_id);

    const databricksResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clusterId: cluster_id,
        contextId: context_id,
      }),
    });

    console.log("Response Status:", databricksResponse.status);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        { error: "Failed to destroy execution context", details: errorText },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error destroying execution context:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";

export const dynamic = "force-dynamic";

/**
 * Terminates (deletes) a Databricks cluster
 * POST /api/databricks/clusters/terminate
 * Body: { clusterId: string }
 */
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
    const { clusterId } = body;

    if (!clusterId) {
      return NextResponse.json(
        { error: "Missing required parameter: clusterId" },
        { status: 400 }
      );
    }

    console.log("=== DATABRICKS CLUSTER TERMINATE ===");
    console.log("Cluster ID:", clusterId);

    const apiUrl = `${workspaceUrl}/api/2.0/clusters/delete`;

    const databricksResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cluster_id: clusterId,
      }),
    });

    console.log("Response Status:", databricksResponse.status);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to terminate cluster",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error terminating cluster:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

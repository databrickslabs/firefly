import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";

export const dynamic = "force-dynamic";

/**
 * Check if an execution context is still valid and the cluster is running
 * This is used for periodic health checks
 */
export async function GET(request: Request) {
  try {
    const tokenResult = await getDatabricksWorkspaceToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;
    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get("cluster_id");
    const contextId = searchParams.get("context_id");

    if (!clusterId || !contextId) {
      return NextResponse.json(
        { error: "cluster_id and context_id are required" },
        { status: 400 }
      );
    }

    // Check cluster status
    const clusterApiUrl = `${workspaceUrl}/api/2.0/clusters/get`;
    const clusterResponse = await fetch(clusterApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cluster_id: clusterId,
      }),
    });

    if (!clusterResponse.ok) {
      return NextResponse.json(
        {
          healthy: false,
          reason: "Cluster not found or inaccessible",
          clusterId,
          contextId,
        },
        { status: 200 }
      );
    }

    const clusterData = await clusterResponse.json();
    const clusterState = clusterData.state;

    // Context is healthy if cluster is running
    const isHealthy = clusterState === "RUNNING";

    return NextResponse.json({
      healthy: isHealthy,
      clusterState,
      clusterId,
      contextId,
      reason: isHealthy
        ? "Context and cluster are healthy"
        : `Cluster is in ${clusterState} state`,
    });
  } catch (error) {
    console.error("Error checking context status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

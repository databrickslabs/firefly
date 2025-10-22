import { NextResponse } from "next/server";
import { callDatabricksApi } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

interface ClusterGetResponse {
  state: string;
}

/**
 * Check if an execution context is still valid and the cluster is running
 * This is used for periodic health checks
 */
export async function GET(request: Request) {
  try {
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
    const result = await callDatabricksApi<ClusterGetResponse>({
      endpoint: "/api/2.0/clusters/get",
      method: "POST",
      body: {
        cluster_id: clusterId,
      },
    });

    if (!result.success) {
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

    const clusterState = result.data.state;

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

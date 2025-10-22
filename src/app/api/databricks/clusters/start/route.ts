import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

/**
 * Starts a terminated Databricks cluster
 * POST /api/databricks/clusters/start
 * Body: { clusterId: string }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { clusterId } = body;

  if (!clusterId) {
    return NextResponse.json(
      { error: "Missing required parameter: clusterId" },
      { status: 400 }
    );
  }

  const result = await callDatabricksApi({
    endpoint: "/api/2.0/clusters/start",
    method: "POST",
    body: {
      cluster_id: clusterId,
    },
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

/**
 * Terminates (deletes) a Databricks cluster
 * POST /api/databricks/clusters/terminate
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
    endpoint: "/api/2.0/clusters/delete",
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

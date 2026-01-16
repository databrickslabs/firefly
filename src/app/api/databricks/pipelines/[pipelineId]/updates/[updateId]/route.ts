import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

interface PipelineUpdateStatus {
  update_id: string;
  state: string;
  creation_time?: string;
  cluster_id?: string;
  config?: unknown;
}

interface RouteParams {
  params: Promise<{ pipelineId: string; updateId: string }>;
}

/**
 * GET /api/databricks/pipelines/[pipelineId]/updates/[updateId]
 * Get the status of a pipeline update
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { pipelineId, updateId } = await params;

  const result = await callDatabricksApi<PipelineUpdateStatus>({
    endpoint: `/api/2.0/pipelines/${pipelineId}/updates/${updateId}`,
    method: "GET",
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

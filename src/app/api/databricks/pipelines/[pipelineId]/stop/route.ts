import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ pipelineId: string }>;
}

/**
 * POST /api/databricks/pipelines/[pipelineId]/stop
 * Stop a running pipeline
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { pipelineId } = await params;

  const result = await callDatabricksApi({
    endpoint: `/api/2.0/pipelines/${pipelineId}/stop`,
    method: "POST",
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json({ success: true });
}

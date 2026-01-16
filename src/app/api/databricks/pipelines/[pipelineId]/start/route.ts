import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

interface StartPipelineResponse {
  update_id: string;
}

interface RouteParams {
  params: Promise<{ pipelineId: string }>;
}

/**
 * POST /api/databricks/pipelines/[pipelineId]/start
 * Start a pipeline update
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { pipelineId } = await params;

  // Optional: parse body for full_refresh option
  let fullRefresh = false;
  try {
    const body = await request.json();
    fullRefresh = body.full_refresh ?? false;
  } catch {
    // No body or invalid JSON, use defaults
  }

  const result = await callDatabricksApi<StartPipelineResponse>({
    endpoint: `/api/2.0/pipelines/${pipelineId}/updates`,
    method: "POST",
    body: {
      full_refresh: fullRefresh,
    },
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

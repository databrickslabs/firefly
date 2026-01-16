import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";
import { PIPELINES_CACHE_TAG } from "../route";

export const dynamic = "force-dynamic";

interface PipelineDetails {
  pipeline_id: string;
  name: string;
  state?: string;
  creator_user_name?: string;
  spec?: {
    name: string;
    storage?: string;
    target?: string;
    continuous?: boolean;
    development?: boolean;
    clusters?: unknown[];
    libraries?: unknown[];
  };
  latest_updates?: Array<{
    update_id: string;
    state: string;
    creation_time: string;
  }>;
}

interface RouteParams {
  params: Promise<{ pipelineId: string }>;
}

/**
 * GET /api/databricks/pipelines/[pipelineId]
 * Get details of a specific pipeline
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { pipelineId } = await params;

  const result = await callDatabricksApi<PipelineDetails>({
    endpoint: `/api/2.0/pipelines/${pipelineId}`,
    method: "GET",
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

interface UpdatePipelineRequest {
  name?: string;
  storage?: string;
  target?: string;
  continuous?: boolean;
  development?: boolean;
  clusters?: unknown[];
  libraries?: unknown[];
}

/**
 * PATCH /api/databricks/pipelines/[pipelineId]
 * Update an existing pipeline
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { pipelineId } = await params;
  const body = await request.json() as UpdatePipelineRequest;

  const result = await callDatabricksApi({
    endpoint: `/api/2.0/pipelines/${pipelineId}`,
    method: "PUT", // Databricks uses PUT for updates
    body: {
      ...body,
      pipeline_id: pipelineId,
    },
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  // Invalidate the pipelines cache
  revalidateTag(PIPELINES_CACHE_TAG);

  return NextResponse.json(result.data);
}

/**
 * DELETE /api/databricks/pipelines/[pipelineId]
 * Delete a pipeline
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { pipelineId } = await params;

  const result = await callDatabricksApi({
    endpoint: `/api/2.0/pipelines/${pipelineId}`,
    method: "DELETE",
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  // Invalidate the pipelines cache
  revalidateTag(PIPELINES_CACHE_TAG);

  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

export const PIPELINES_CACHE_TAG = "databricks-pipelines";

interface Pipeline {
  pipeline_id: string;
  name: string;
  state?: string;
  creator_user_name?: string;
  latest_updates?: Array<{
    update_id: string;
    state: string;
    creation_time: string;
  }>;
}

interface PipelinesResponse {
  statuses: Pipeline[];
  next_page_token?: string;
}

/**
 * GET /api/databricks/pipelines
 * List all DLT pipelines in the workspace
 */
export async function GET() {
  const getCachedPipelines = unstable_cache(
    async () => {
      const result = await callDatabricksApi<PipelinesResponse>({
        endpoint: "/api/2.0/pipelines",
        method: "GET",
      });
      return result;
    },
    ["pipelines-list"],
    { tags: [PIPELINES_CACHE_TAG], revalidate: false }
  );

  const result = await getCachedPipelines();

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

interface CreatePipelineRequest {
  name: string;
  storage?: string;
  target?: string;
  continuous?: boolean;
  development?: boolean;
  clusters?: Array<{
    label?: string;
    num_workers?: number;
    autoscale?: {
      min_workers: number;
      max_workers: number;
    };
  }>;
  libraries?: Array<{
    notebook?: { path: string };
    file?: { path: string };
  }>;
  channel?: "CURRENT" | "PREVIEW";
  photon?: boolean;
  serverless?: boolean;
}

/**
 * POST /api/databricks/pipelines
 * Create a new DLT pipeline
 */
export async function POST(request: Request) {
  const body = await request.json() as CreatePipelineRequest;

  const result = await callDatabricksApi<{ pipeline_id: string }>({
    endpoint: "/api/2.0/pipelines",
    method: "POST",
    body,
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  // Invalidate the pipelines cache
  revalidateTag(PIPELINES_CACHE_TAG);

  return NextResponse.json(result.data);
}

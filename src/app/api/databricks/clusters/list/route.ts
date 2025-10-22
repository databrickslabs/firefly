import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

const CLUSTERS_CACHE_TAG = "databricks-clusters";

export async function GET() {
  const tokenResult = await getDatabricksWorkspaceToken();

  if (!tokenResult.success) {
    return NextResponse.json(
      {
        error: tokenResult.error.error,
        details: tokenResult.error.details,
        requireReauth: tokenResult.error.details === "REQUIRE_REAUTHENTICATION"
      },
      { status: tokenResult.error.status }
    );
  }

  const { activeOrganizationId } = tokenResult.data;

  // Use unstable_cache for caching
  const getClusters = unstable_cache(
    async () => {
      const result = await callDatabricksApi({
        endpoint: "/api/2.0/clusters/list",
        method: "GET",
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    [`clusters-${activeOrganizationId}`],
    {
      tags: [CLUSTERS_CACHE_TAG],
      revalidate: 30 // Cache for 30 seconds
    }
  );

  try {
    const data = await getClusters();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching clusters:", error);

    // Try to get the result directly without cache to check for auth issues
    const result = await callDatabricksApi({
      endpoint: "/api/2.0/clusters/list",
      method: "GET",
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    return NextResponse.json(result.data);
  }
}

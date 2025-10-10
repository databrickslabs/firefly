import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

const CLUSTERS_CACHE_TAG = "databricks-clusters";

export async function GET() {
  try {
    const tokenResult = await getDatabricksWorkspaceToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl, activeOrganizationId } = tokenResult.data;

    // Use unstable_cache for caching
    const getClusters = unstable_cache(
      async (token: string, wsUrl: string) => {
        const apiUrl = `${wsUrl}/api/2.0/clusters/list`;

        console.log("=== DATABRICKS CLUSTERS API DEBUG ===");
        console.log("API URL:", apiUrl);
        console.log("Workspace URL:", wsUrl);

        const databricksResponse = await fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        console.log("Response Status:", databricksResponse.status);

        if (!databricksResponse.ok) {
          const errorText = await databricksResponse.text();
          console.error("Databricks API error:", errorText);
          throw new Error(`Failed to fetch clusters: ${errorText}`);
        }

        return databricksResponse.json();
      },
      [`clusters-${activeOrganizationId}`],
      {
        tags: [CLUSTERS_CACHE_TAG],
        revalidate: 30 // Cache for 30 seconds
      }
    );

    const data = await getClusters(accessToken, workspaceUrl);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching clusters:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

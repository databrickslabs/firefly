import { NextRequest, NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

// Cache tag factory for catalog details data
export const getCatalogDetailsCacheTag = (catalogName: string) =>
  `UNITY_CATALOG_CATALOG_DETAILS_${catalogName}`;

export interface CatalogDetails {
  name: string;
  comment?: string;
  owner?: string;
  created_at?: number;
  updated_at?: number;
  metastore_id?: string;
  catalog_type?: string;
  full_name?: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const catalogName = searchParams.get("catalog_name");

    if (!catalogName) {
      return NextResponse.json(
        { error: "catalog_name query parameter is required" },
        { status: 400 }
      );
    }

    const tokenResult = await getDatabricksWorkspaceToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;

    // Use unstable_cache for server-side caching
    const getCatalogDetails = unstable_cache(
      async (catalog: string) => {
        const apiUrl = `${workspaceUrl}/api/2.1/unity-catalog/catalogs/${encodeURIComponent(
          catalog
        )}`;

        console.log("=== DATABRICKS CATALOG DETAILS API DEBUG ===");
        console.log("API URL:", apiUrl);
        console.log("Catalog Name:", catalog);

        const databricksResponse = await fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        console.log("Response Status:", databricksResponse.status);

        if (!databricksResponse.ok) {
          const errorText = await databricksResponse.text();
          console.error("Databricks API error:", errorText);
          throw new Error(
            JSON.stringify({
              error: "Failed to fetch catalog details from Databricks",
              details: errorText,
              status: databricksResponse.status,
              apiUrl,
            })
          );
        }

        const data: CatalogDetails = await databricksResponse.json();
        return data;
      },
      [`unity-catalog-catalog-details-${catalogName}`],
      {
        tags: [getCatalogDetailsCacheTag(catalogName)],
        revalidate: false,
      }
    );

    const data = await getCatalogDetails(catalogName);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching catalog details:", error);

    // Try to parse the error if it's a JSON string
    try {
      const parsedError = JSON.parse(String(error).replace("Error: ", ""));
      return NextResponse.json(
        { error: parsedError.error, details: parsedError.details },
        { status: parsedError.status || 500 }
      );
    } catch {
      return NextResponse.json(
        { error: "Internal server error", details: String(error) },
        { status: 500 }
      );
    }
  }
}

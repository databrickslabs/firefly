import { NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

// Cache tag for catalog data
export const CATALOGS_CACHE_TAG = "UNITY_CATALOG_CATALOGS";

export interface Catalog {
  name: string;
  comment?: string;
  owner?: string;
  created_at?: number;
  updated_at?: number;
  metastore_id?: string;
}

export interface CatalogsResponse {
  catalogs?: Catalog[];
}

export async function GET() {
  try {
    const tokenResult = await getDatabricksToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;

    // Use unstable_cache for server-side caching
    const getCatalogs = unstable_cache(
      async () => {
        const apiUrl = `${workspaceUrl}/api/2.1/unity-catalog/catalogs`;

        console.log("=== DATABRICKS CATALOGS API DEBUG ===");
        console.log("API URL:", apiUrl);

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
              error: "Failed to fetch catalogs from Databricks",
              details: errorText,
              status: databricksResponse.status,
              apiUrl,
            })
          );
        }

        const data: CatalogsResponse = await databricksResponse.json();
        return data;
      },
      ["unity-catalog-catalogs"],
      {
        tags: [CATALOGS_CACHE_TAG],
        revalidate: false,
      }
    );

    const data = await getCatalogs();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching catalogs:", error);

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

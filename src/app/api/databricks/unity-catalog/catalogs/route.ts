import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  callDatabricksApi,
  createErrorResponse,
  DatabricksApiError,
} from "@/lib/databricks-api-wrapper";

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
  // Use unstable_cache for server-side caching
  const getCatalogs = unstable_cache(
    async () => {
      const result = await callDatabricksApi<CatalogsResponse>({
        endpoint: "/api/2.1/unity-catalog/catalogs",
        method: "GET",
      });

      if (!result.success) {
        throw result;
      }

      return result.data;
    },
    ["unity-catalog-catalogs"],
    {
      tags: [CATALOGS_CACHE_TAG],
      revalidate: false,
    }
  );

  try {
    const data = await getCatalogs();
    return NextResponse.json(data);
  } catch (error) {
    // Check if it's a DatabricksApiError
    if (
      error &&
      typeof error === "object" &&
      "success" in error &&
      error.success === false
    ) {
      return createErrorResponse(error as DatabricksApiError);
    }

    console.error("Error fetching catalogs:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

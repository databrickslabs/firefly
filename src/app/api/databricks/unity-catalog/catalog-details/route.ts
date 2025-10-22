import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  callDatabricksApi,
  createErrorResponse,
  DatabricksApiError,
} from "@/lib/databricks-api-wrapper";

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
  const searchParams = request.nextUrl.searchParams;
  const catalogName = searchParams.get("catalog_name");

  if (!catalogName) {
    return NextResponse.json(
      { error: "catalog_name query parameter is required" },
      { status: 400 }
    );
  }

  // Use unstable_cache for server-side caching
  const getCatalogDetails = unstable_cache(
    async (catalog: string) => {
      const result = await callDatabricksApi<CatalogDetails>({
        endpoint: `/api/2.1/unity-catalog/catalogs/${encodeURIComponent(catalog)}`,
        method: "GET",
      });

      if (!result.success) {
        throw result;
      }

      return result.data;
    },
    [`unity-catalog-catalog-details-${catalogName}`],
    {
      tags: [getCatalogDetailsCacheTag(catalogName)],
      revalidate: false,
    }
  );

  try {
    const data = await getCatalogDetails(catalogName);
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

    console.error("Error fetching catalog details:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

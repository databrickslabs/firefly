import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  callDatabricksApi,
  createErrorResponse,
  DatabricksApiError,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

// Cache tag factory for schema details data
export const getSchemaDetailsCacheTag = (fullName: string) =>
  `UNITY_CATALOG_SCHEMA_DETAILS_${fullName}`;

export interface SchemaDetails {
  name: string;
  catalog_name: string;
  comment?: string;
  owner?: string;
  created_at?: number;
  updated_at?: number;
  full_name?: string;
  schema_type?: string;
  storage_location?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fullName = searchParams.get("full_name");

  if (!fullName) {
    return NextResponse.json(
      { error: "full_name query parameter is required (format: catalog.schema)" },
      { status: 400 }
    );
  }

  // Use unstable_cache for server-side caching
  const getSchemaDetails = unstable_cache(
    async (schemaFullName: string) => {
      const result = await callDatabricksApi<SchemaDetails>({
        endpoint: `/api/2.1/unity-catalog/schemas/${encodeURIComponent(schemaFullName)}`,
        method: "GET",
      });

      if (!result.success) {
        throw result;
      }

      return result.data;
    },
    [`unity-catalog-schema-details-${fullName}`],
    {
      tags: [getSchemaDetailsCacheTag(fullName)],
      revalidate: false,
    }
  );

  try {
    const data = await getSchemaDetails(fullName);
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

    console.error("Error fetching schema details:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

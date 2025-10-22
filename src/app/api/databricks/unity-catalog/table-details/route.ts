import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  callDatabricksApi,
  createErrorResponse,
  DatabricksApiError,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

// Cache tag factory for table details data
export const getTableDetailsCacheTag = (fullName: string) =>
  `UNITY_CATALOG_TABLE_DETAILS_${fullName}`;

export interface Column {
  name: string;
  type_text: string;
  type_name?: string;
  type_precision?: number;
  type_scale?: number;
  position?: number;
  comment?: string;
  nullable?: boolean;
}

export interface TableDetails {
  name: string;
  catalog_name: string;
  schema_name: string;
  table_type?: string;
  data_source_format?: string;
  columns?: Column[];
  comment?: string;
  owner?: string;
  created_at?: number;
  updated_at?: number;
  storage_location?: string;
  view_definition?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fullName = searchParams.get("full_name");

  if (!fullName) {
    return NextResponse.json(
      { error: "full_name query parameter is required (format: catalog.schema.table)" },
      { status: 400 }
    );
  }

  // Use unstable_cache for server-side caching
  const getTableDetails = unstable_cache(
    async (tableName: string) => {
      const result = await callDatabricksApi<TableDetails>({
        endpoint: `/api/2.1/unity-catalog/tables/${encodeURIComponent(tableName)}`,
        method: "GET",
      });

      if (!result.success) {
        throw result;
      }

      return result.data;
    },
    [`unity-catalog-table-details-${fullName}`],
    {
      tags: [getTableDetailsCacheTag(fullName)],
      revalidate: false,
    }
  );

  try {
    const data = await getTableDetails(fullName);
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

    console.error("Error fetching table details:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

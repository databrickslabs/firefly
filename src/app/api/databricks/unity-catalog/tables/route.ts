import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  callDatabricksApi,
  createErrorResponse,
  DatabricksApiError,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

// Cache tag factory for table data
export const getTablesCacheTag = (catalogName: string, schemaName: string) =>
  `UNITY_CATALOG_TABLES_${catalogName}_${schemaName}`;

export interface Table {
  name: string;
  catalog_name: string;
  schema_name: string;
  table_type?: string;
  comment?: string;
  owner?: string;
  created_at?: number;
  updated_at?: number;
  data_source_format?: string;
}

export interface TablesResponse {
  tables?: Table[];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const catalogName = searchParams.get("catalog_name");
  const schemaName = searchParams.get("schema_name");

  if (!catalogName) {
    return NextResponse.json(
      { error: "catalog_name query parameter is required" },
      { status: 400 }
    );
  }

  if (!schemaName) {
    return NextResponse.json(
      { error: "schema_name query parameter is required" },
      { status: 400 }
    );
  }

  // Use unstable_cache for server-side caching
  const getTables = unstable_cache(
    async (catalog: string, schema: string) => {
      const result = await callDatabricksApi<TablesResponse>({
        endpoint: "/api/2.1/unity-catalog/tables",
        method: "GET",
        queryParams: {
          catalog_name: catalog,
          schema_name: schema,
        },
      });

      if (!result.success) {
        throw result;
      }

      return result.data;
    },
    [`unity-catalog-tables-${catalogName}-${schemaName}`],
    {
      tags: [getTablesCacheTag(catalogName, schemaName)],
      revalidate: false,
    }
  );

  try {
    const data = await getTables(catalogName, schemaName);
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

    console.error("Error fetching tables:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

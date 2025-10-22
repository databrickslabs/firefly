import { NextRequest, NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

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

  const result = await callDatabricksApi<TablesResponse>({
    endpoint: "/api/2.1/unity-catalog/tables",
    method: "GET",
    queryParams: {
      catalog_name: catalogName,
      schema_name: schemaName,
    },
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

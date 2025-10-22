import { NextRequest, NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

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

  const result = await callDatabricksApi<TableDetails>({
    endpoint: `/api/2.1/unity-catalog/tables/${encodeURIComponent(fullName)}`,
    method: "GET",
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

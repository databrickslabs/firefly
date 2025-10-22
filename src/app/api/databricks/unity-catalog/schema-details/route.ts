import { NextRequest, NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

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

  const result = await callDatabricksApi<SchemaDetails>({
    endpoint: `/api/2.1/unity-catalog/schemas/${encodeURIComponent(fullName)}`,
    method: "GET",
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

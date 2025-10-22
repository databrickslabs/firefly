import { NextRequest, NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
  DatabricksApiError,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

export interface Schema {
  name: string;
  catalog_name: string;
  comment?: string;
  owner?: string;
  created_at?: number;
  updated_at?: number;
}

export interface SchemasResponse {
  schemas?: Schema[];
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

  const result = await callDatabricksApi<SchemasResponse>({
    endpoint: "/api/2.1/unity-catalog/schemas",
    method: "GET",
    queryParams: {
      catalog_name: catalogName,
    },
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

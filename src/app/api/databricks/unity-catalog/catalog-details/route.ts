import { NextRequest, NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

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

  const result = await callDatabricksApi<CatalogDetails>({
    endpoint: `/api/2.1/unity-catalog/catalogs/${encodeURIComponent(catalogName)}`,
    method: "GET",
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

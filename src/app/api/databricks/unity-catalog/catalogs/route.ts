import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
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
  try {
    const result = await callDatabricksApi<CatalogsResponse>({
      endpoint: "/api/2.1/unity-catalog/catalogs",
      method: "GET",
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Error fetching catalogs:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

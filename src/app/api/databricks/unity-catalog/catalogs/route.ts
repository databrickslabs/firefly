import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Catalogs that guest users are allowed to see
const GUEST_ALLOWED_CATALOG_PREFIXES = ["firefly"];

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
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({ headers: await headers() });
    const isGuest = session?.user?.role === "guest";

    const result = await callDatabricksApi<CatalogsResponse>({
      endpoint: "/api/2.1/unity-catalog/catalogs",
      method: "GET",
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    if (isGuest && result.data.catalogs) {
      result.data.catalogs = result.data.catalogs.filter((c) =>
        GUEST_ALLOWED_CATALOG_PREFIXES.some((prefix) =>
          c.name.toLowerCase().startsWith(prefix)
        )
      );
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

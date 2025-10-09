import { NextRequest, NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

// Cache tag factory for schema data
export const getSchemasCacheTag = (catalogName: string) =>
  `UNITY_CATALOG_SCHEMAS_${catalogName}`;

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
  try {
    const searchParams = request.nextUrl.searchParams;
    const catalogName = searchParams.get("catalog_name");

    if (!catalogName) {
      return NextResponse.json(
        { error: "catalog_name query parameter is required" },
        { status: 400 }
      );
    }

    const tokenResult = await getDatabricksToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;

    // Use unstable_cache for server-side caching
    const getSchemas = unstable_cache(
      async (catalog: string) => {
        const apiUrl = `${workspaceUrl}/api/2.1/unity-catalog/schemas?catalog_name=${encodeURIComponent(
          catalog
        )}`;

        console.log("=== DATABRICKS SCHEMAS API DEBUG ===");
        console.log("API URL:", apiUrl);
        console.log("Catalog Name:", catalog);

        const databricksResponse = await fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        console.log("Response Status:", databricksResponse.status);

        if (!databricksResponse.ok) {
          const errorText = await databricksResponse.text();
          console.error("Databricks API error:", errorText);
          throw new Error(
            JSON.stringify({
              error: "Failed to fetch schemas from Databricks",
              details: errorText,
              status: databricksResponse.status,
              apiUrl,
            })
          );
        }

        const data: SchemasResponse = await databricksResponse.json();
        return data;
      },
      [`unity-catalog-schemas-${catalogName}`],
      {
        tags: [getSchemasCacheTag(catalogName)],
        revalidate: false,
      }
    );

    const data = await getSchemas(catalogName);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching schemas:", error);

    // Try to parse the error if it's a JSON string
    try {
      const parsedError = JSON.parse(String(error).replace("Error: ", ""));
      return NextResponse.json(
        { error: parsedError.error, details: parsedError.details },
        { status: parsedError.status || 500 }
      );
    } catch {
      return NextResponse.json(
        { error: "Internal server error", details: String(error) },
        { status: 500 }
      );
    }
  }
}

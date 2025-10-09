import { NextRequest, NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";
import { unstable_cache } from "next/cache";

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
  try {
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

    const tokenResult = await getDatabricksToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;

    // Use unstable_cache for server-side caching
    const getTables = unstable_cache(
      async (catalog: string, schema: string) => {
        const apiUrl = `${workspaceUrl}/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(
          catalog
        )}&schema_name=${encodeURIComponent(schema)}`;

        console.log("=== DATABRICKS TABLES API DEBUG ===");
        console.log("API URL:", apiUrl);
        console.log("Catalog Name:", catalog);
        console.log("Schema Name:", schema);

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
              error: "Failed to fetch tables from Databricks",
              details: errorText,
              status: databricksResponse.status,
              apiUrl,
            })
          );
        }

        const data: TablesResponse = await databricksResponse.json();
        return data;
      },
      [`unity-catalog-tables-${catalogName}-${schemaName}`],
      {
        tags: [getTablesCacheTag(catalogName, schemaName)],
        revalidate: false,
      }
    );

    const data = await getTables(catalogName, schemaName);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching tables:", error);

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

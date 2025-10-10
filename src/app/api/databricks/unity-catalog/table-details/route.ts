import { NextRequest, NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

// Cache tag factory for table details data
export const getTableDetailsCacheTag = (fullName: string) =>
  `UNITY_CATALOG_TABLE_DETAILS_${fullName}`;

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
  try {
    const searchParams = request.nextUrl.searchParams;
    const fullName = searchParams.get("full_name");

    if (!fullName) {
      return NextResponse.json(
        { error: "full_name query parameter is required (format: catalog.schema.table)" },
        { status: 400 }
      );
    }

    const tokenResult = await getDatabricksWorkspaceToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;

    // Use unstable_cache for server-side caching
    const getTableDetails = unstable_cache(
      async (tableName: string) => {
        const apiUrl = `${workspaceUrl}/api/2.1/unity-catalog/tables/${encodeURIComponent(
          tableName
        )}`;

        console.log("=== DATABRICKS TABLE DETAILS API DEBUG ===");
        console.log("API URL:", apiUrl);
        console.log("Full Name:", tableName);

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
              error: "Failed to fetch table details from Databricks",
              details: errorText,
              status: databricksResponse.status,
              apiUrl,
            })
          );
        }

        const data: TableDetails = await databricksResponse.json();
        return data;
      },
      [`unity-catalog-table-details-${fullName}`],
      {
        tags: [getTableDetailsCacheTag(fullName)],
        revalidate: false,
      }
    );

    const data = await getTableDetails(fullName);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching table details:", error);

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

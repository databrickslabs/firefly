import { NextRequest, NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

// Cache tag factory for schema details data
export const getSchemaDetailsCacheTag = (fullName: string) =>
  `UNITY_CATALOG_SCHEMA_DETAILS_${fullName}`;

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
  try {
    const searchParams = request.nextUrl.searchParams;
    const fullName = searchParams.get("full_name");

    if (!fullName) {
      return NextResponse.json(
        { error: "full_name query parameter is required (format: catalog.schema)" },
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
    const getSchemaDetails = unstable_cache(
      async (schemaFullName: string) => {
        const apiUrl = `${workspaceUrl}/api/2.1/unity-catalog/schemas/${encodeURIComponent(
          schemaFullName
        )}`;

        console.log("=== DATABRICKS SCHEMA DETAILS API DEBUG ===");
        console.log("API URL:", apiUrl);
        console.log("Full Name:", schemaFullName);

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
              error: "Failed to fetch schema details from Databricks",
              details: errorText,
              status: databricksResponse.status,
              apiUrl,
            })
          );
        }

        const data: SchemaDetails = await databricksResponse.json();
        return data;
      },
      [`unity-catalog-schema-details-${fullName}`],
      {
        tags: [getSchemaDetailsCacheTag(fullName)],
        revalidate: false,
      }
    );

    const data = await getSchemaDetails(fullName);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching schema details:", error);

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

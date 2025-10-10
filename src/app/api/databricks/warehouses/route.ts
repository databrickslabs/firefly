import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tokenResult = await getDatabricksWorkspaceToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;

    // Debug logging
    const apiUrl = `${workspaceUrl}/api/2.0/sql/warehouses/`;
    const tokenPreview = accessToken.substring(0, 20) + "..." + accessToken.substring(accessToken.length - 10);
    console.log("=== DATABRICKS WAREHOUSES API DEBUG ===");
    console.log("API URL:", apiUrl);
    console.log("Token Preview:", tokenPreview);
    console.log("Token Length:", accessToken.length);
    console.log("Workspace URL:", workspaceUrl);

    // Call Databricks API to list SQL warehouses
    const databricksResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Response Status:", databricksResponse.status);
    console.log("Response Status Text:", databricksResponse.statusText);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to fetch SQL warehouses from Databricks",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching SQL warehouses:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

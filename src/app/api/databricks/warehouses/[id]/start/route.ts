import { NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const tokenResult = await getDatabricksToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;

    const apiUrl = `${workspaceUrl}/api/2.0/sql/warehouses/${id}/start`;

    console.log("=== DATABRICKS START WAREHOUSE DEBUG ===");
    console.log("API URL:", apiUrl);
    console.log("Warehouse ID:", id);

    const databricksResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Response Status:", databricksResponse.status);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to start warehouse",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    // Start endpoint returns empty body on success
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error starting warehouse:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

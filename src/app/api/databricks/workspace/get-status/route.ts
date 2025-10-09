import { NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";

export const dynamic = "force-dynamic";

export interface GetStatusResponse {
  object_type: "NOTEBOOK" | "DIRECTORY" | "LIBRARY" | "FILE" | "REPO" | "DASHBOARD";
  path: string;
  object_id?: number;
  resource_id?: string;
  created_at?: number;
  modified_at?: number;
  language?: "SCALA" | "PYTHON" | "SQL" | "R";
  size?: number;
}

export async function GET(request: Request) {
  try {
    const tokenResult = await getDatabricksToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { error: "Missing required parameter: path" },
        { status: 400 }
      );
    }

    const apiUrl = `${workspaceUrl}/api/2.0/workspace/get-status`;
    const queryParams = new URLSearchParams({ path });

    console.log("=== DATABRICKS WORKSPACE GET-STATUS DEBUG ===");
    console.log("API URL:", `${apiUrl}?${queryParams}`);
    console.log("Path:", path);

    const databricksResponse = await fetch(`${apiUrl}?${queryParams}`, {
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
      return NextResponse.json(
        {
          error: "Failed to get workspace object status",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    const data: GetStatusResponse = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error getting workspace object status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

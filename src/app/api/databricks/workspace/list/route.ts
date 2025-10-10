import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";

export const dynamic = "force-dynamic";

export interface WorkspaceObject {
  object_type: "NOTEBOOK" | "DIRECTORY" | "LIBRARY" | "FILE" | "REPO" | "DASHBOARD";
  path: string;
  object_id?: number;
  resource_id?: string;
  created_at?: number;
  modified_at?: number;
  language?: "SCALA" | "PYTHON" | "SQL" | "R";
  size?: number;
}

export interface ListWorkspaceResponse {
  objects?: WorkspaceObject[];
}

export async function GET(request: Request) {
  try {
    const tokenResult = await getDatabricksWorkspaceToken();

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

    const apiUrl = `${workspaceUrl}/api/2.0/workspace/list`;
    const queryParams = new URLSearchParams({ path });

    console.log("=== DATABRICKS WORKSPACE LIST DEBUG ===");
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
          error: "Failed to list workspace contents",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    const data: ListWorkspaceResponse = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error listing workspace contents:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

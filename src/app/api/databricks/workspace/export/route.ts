import { NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";

export const dynamic = "force-dynamic";

export interface ExportResponse {
  content?: string;
  file_type?: string;
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
    const format = searchParams.get("format") || "SOURCE";

    if (!path) {
      return NextResponse.json(
        { error: "Missing required parameter: path" },
        { status: 400 }
      );
    }

    const apiUrl = `${workspaceUrl}/api/2.0/workspace/export`;
    const queryParams = new URLSearchParams({ path, format });

    console.log("=== DATABRICKS WORKSPACE EXPORT DEBUG ===");
    console.log("API URL:", `${apiUrl}?${queryParams}`);
    console.log("Path:", path);
    console.log("Format:", format);

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
          error: "Failed to export file",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    const data: ExportResponse = await databricksResponse.json();

    // Decode base64 content
    if (data.content) {
      const decodedContent = Buffer.from(data.content, "base64").toString("utf-8");
      return NextResponse.json({
        ...data,
        content: decodedContent,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error exporting file:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

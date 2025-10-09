import { NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";

export const dynamic = "force-dynamic";

export interface ImportRequest {
  path: string;
  content: string;
  format?: "SOURCE" | "HTML" | "JUPYTER" | "DBC" | "R_MARKDOWN" | "AUTO" | "RAW";
  language?: "SCALA" | "PYTHON" | "SQL" | "R";
  overwrite?: boolean;
  isNotebook?: boolean; // Helper flag to determine if this should be a notebook or file
}

export async function POST(request: Request) {
  try {
    const tokenResult = await getDatabricksToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;
    const body: ImportRequest = await request.json();

    if (!body.path || !body.content) {
      return NextResponse.json(
        { error: "Missing required parameters: path and content" },
        { status: 400 }
      );
    }

    const apiUrl = `${workspaceUrl}/api/2.0/workspace/import`;

    // Encode content as base64
    const base64Content = Buffer.from(body.content).toString("base64");

    // Determine format and whether to include language
    // For files (not notebooks), use AUTO format and omit language
    // For notebooks, use SOURCE format with language
    const isNotebook = body.isNotebook ?? false;
    const format = body.format || (isNotebook ? "SOURCE" : "AUTO");

    // Build request payload
    const payload: Record<string, unknown> = {
      path: body.path,
      content: base64Content,
      format,
      overwrite: body.overwrite !== undefined ? body.overwrite : true,
    };

    // Only include language for notebooks
    if (isNotebook && body.language) {
      payload.language = body.language;
    }

    console.log("=== DATABRICKS WORKSPACE IMPORT DEBUG ===");
    console.log("API URL:", apiUrl);
    console.log("Path:", body.path);
    console.log("Format:", format);
    console.log("Is Notebook:", isNotebook);
    console.log("Language:", isNotebook ? (body.language || "SQL") : "N/A (file)");

    const databricksResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("Response Status:", databricksResponse.status);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to import file",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error importing file:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

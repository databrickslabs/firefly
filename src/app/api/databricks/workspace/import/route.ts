import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

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
  const body: ImportRequest = await request.json();

  if (!body.path || !body.content) {
    return NextResponse.json(
      { error: "Missing required parameters: path and content" },
      { status: 400 }
    );
  }

  // Encode content as base64
  const base64Content = Buffer.from(body.content).toString("base64");

  // Determine format and whether to include language
  // For files (not notebooks), use AUTO format and omit language
  // For notebooks, use SOURCE format with language
  const isNotebook = body.isNotebook ?? false;
  const format = body.format || (isNotebook ? "SOURCE" : "AUTO");

  // Ensure .ipynb extension for JUPYTER format
  let finalPath = body.path;
  if (format === "JUPYTER" && !finalPath.endsWith(".ipynb")) {
    finalPath += ".ipynb";
  }

  // Build request payload
  const payload: Record<string, unknown> = {
    path: finalPath,
    content: base64Content,
    format,
    overwrite: body.overwrite !== undefined ? body.overwrite : true,
  };

  // Only include language for notebooks
  if (isNotebook && body.language) {
    payload.language = body.language;
  }

  const result = await callDatabricksApi({
    endpoint: "/api/2.0/workspace/import",
    method: "POST",
    body: payload,
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

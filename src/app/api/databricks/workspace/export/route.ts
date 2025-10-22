import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

export interface ExportResponse {
  content?: string;
  file_type?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const format = searchParams.get("format") || "SOURCE";

  if (!path) {
    return NextResponse.json(
      { error: "Missing required parameter: path" },
      { status: 400 }
    );
  }

  const result = await callDatabricksApi<ExportResponse>({
    endpoint: "/api/2.0/workspace/export",
    method: "GET",
    queryParams: { path, format },
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  // Decode base64 content
  if (result.data.content) {
    const decodedContent = Buffer.from(result.data.content, "base64").toString("utf-8");
    return NextResponse.json({
      ...result.data,
      content: decodedContent,
    });
  }

  return NextResponse.json(result.data);
}

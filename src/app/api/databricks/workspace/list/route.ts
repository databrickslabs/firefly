import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

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
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json(
      { error: "Missing required parameter: path" },
      { status: 400 }
    );
  }

  const result = await callDatabricksApi<ListWorkspaceResponse>({
    endpoint: "/api/2.0/workspace/list",
    method: "GET",
    queryParams: { path },
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

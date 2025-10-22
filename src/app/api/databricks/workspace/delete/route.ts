import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

export interface DeleteRequest {
  path: string;
  recursive?: boolean;
}

export async function POST(request: Request) {
  const body: DeleteRequest = await request.json();

  if (!body.path) {
    return NextResponse.json(
      { error: "Missing required parameter: path" },
      { status: 400 }
    );
  }

  const result = await callDatabricksApi({
    endpoint: "/api/2.0/workspace/delete",
    method: "POST",
    body: {
      path: body.path,
      recursive: body.recursive || false,
    },
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

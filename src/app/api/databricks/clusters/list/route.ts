import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await callDatabricksApi({
    endpoint: "/api/2.0/clusters/list",
    method: "GET",
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

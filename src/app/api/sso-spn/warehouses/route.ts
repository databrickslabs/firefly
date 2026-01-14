import { NextResponse } from "next/server";
import { callDatabricksSpnApi, createSpnErrorResponse } from "@/lib/databricks-spn-api-wrapper";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await callDatabricksSpnApi({
    endpoint: "/api/2.0/sql/warehouses/",
    method: "GET",
  });

  if (!result.success) {
    return createSpnErrorResponse(result);
  }

  return NextResponse.json(result.data);
}

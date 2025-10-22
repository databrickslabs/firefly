import { NextResponse } from "next/server";
import { callDatabricksApi, createErrorResponse } from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const result = await callDatabricksApi({
    endpoint: `/api/2.0/sql/warehouses/${id}/stop`,
    method: "POST",
  });

  if (!result.success) {
    return createErrorResponse(result);
  }

  // Stop endpoint returns empty body on success
  return NextResponse.json({ success: true });
}

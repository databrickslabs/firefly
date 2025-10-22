import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ statementId: string }> }
) {
  try {
    const { statementId } = await params;

    console.log("=== DATABRICKS SQL CANCEL DEBUG ===");
    console.log("Statement ID:", statementId);

    const result = await callDatabricksApi({
      endpoint: `/api/2.0/sql/statements/${statementId}/cancel`,
      method: "POST",
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    console.log("Response Status:", result.response.status);

    // Cancel endpoint returns empty body on success
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error canceling statement:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

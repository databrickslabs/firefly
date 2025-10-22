import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

export interface StatementStatusResponse {
  statement_id: string;
  status: {
    state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED";
    error?: {
      error_code?: string;
      message?: string;
    };
  };
  manifest?: {
    format: string;
    schema: {
      column_count: number;
      columns: Array<{
        name: string;
        type_name: string;
        type_text: string;
        position: number;
        type_precision?: number;
        type_scale?: number;
      }>;
    };
    total_chunk_count?: number;
    total_row_count?: number;
    truncated?: boolean;
    chunks?: Array<{
      chunk_index: number;
      row_count: number;
      row_offset: number;
    }>;
  };
  result?: {
    chunk_index?: number;
    row_offset?: number;
    row_count?: number;
    data_array?: unknown[][];
    next_chunk_index?: number;
    next_chunk_internal_link?: string;
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ statementId: string }> }
) {
  try {
    const { statementId } = await params;

    console.log("=== DATABRICKS SQL STATUS DEBUG ===");
    console.log("Statement ID:", statementId);

    const result = await callDatabricksApi<StatementStatusResponse>({
      endpoint: `/api/2.0/sql/statements/${statementId}`,
      method: "GET",
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    console.log("Response Status:", result.response.status);
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Error getting statement status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

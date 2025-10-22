import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

export interface ExecuteStatementRequest {
  warehouse_id: string;
  statement: string;
  catalog?: string;
  schema?: string;
  wait_timeout?: string;
  on_wait_timeout?: "CONTINUE" | "CANCEL";
}

export interface ExecuteStatementResponse {
  statement_id: string;
  status?: {
    state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED";
  };
  manifest?: {
    schema?: {
      columns: Array<{
        name: string;
        type_name: string;
        type_text: string;
        position: number;
      }>;
    };
    total_row_count?: number;
    total_chunk_count?: number;
    truncated?: boolean;
  };
  result?: {
    data_array?: unknown[][];
    chunk_index?: number;
    row_count?: number;
    next_chunk_index?: number;
    next_chunk_internal_link?: string;
  };
}

export async function POST(request: Request) {
  try {
    const body: ExecuteStatementRequest = await request.json();

    console.log("=== DATABRICKS SQL EXECUTE DEBUG ===");
    console.log("Warehouse ID:", body.warehouse_id);
    console.log("Statement:", body.statement.substring(0, 100) + "...");

    const result = await callDatabricksApi<ExecuteStatementResponse>({
      endpoint: "/api/2.0/sql/statements",
      method: "POST",
      body: {
        warehouse_id: body.warehouse_id,
        statement: body.statement,
        catalog: body.catalog,
        schema: body.schema,
        wait_timeout: body.wait_timeout || "10s",
        on_wait_timeout: body.on_wait_timeout || "CONTINUE",
        format: "JSON_ARRAY",
        disposition: "INLINE",
      },
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    console.log("Response Status:", result.response.status);
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Error executing SQL statement:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

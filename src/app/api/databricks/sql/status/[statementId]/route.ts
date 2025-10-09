import { NextResponse } from "next/server";
import { getDatabricksToken } from "@/lib/databricks-token";

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

    const tokenResult = await getDatabricksToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, workspaceUrl } = tokenResult.data;

    const apiUrl = `${workspaceUrl}/api/2.0/sql/statements/${statementId}`;

    console.log("=== DATABRICKS SQL STATUS DEBUG ===");
    console.log("API URL:", apiUrl);
    console.log("Statement ID:", statementId);

    const databricksResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Response Status:", databricksResponse.status);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to get statement status",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    const data: StatementStatusResponse = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error getting statement status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

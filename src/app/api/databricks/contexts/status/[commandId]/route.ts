import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

interface CommandStatusResponse {
  status: string;
  results?: unknown;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ commandId: string }> }
) {
  try {
    const { commandId } = await params;
    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get("cluster_id");
    const contextId = searchParams.get("context_id");

    if (!clusterId || !contextId) {
      return NextResponse.json(
        { error: "cluster_id and context_id are required" },
        { status: 400 }
      );
    }

    console.log("=== CHECKING COMMAND STATUS ===");
    console.log("Command ID:", commandId);

    const result = await callDatabricksApi<CommandStatusResponse>({
      endpoint: "/api/1.2/commands/status",
      method: "GET",
      queryParams: {
        clusterId: clusterId,
        contextId: contextId,
        commandId: commandId,
      },
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    console.log("Response Status:", result.response.status);
    console.log("=== COMMAND STATUS RESPONSE ===");
    console.log("Status:", result.data.status);
    console.log("Results:", JSON.stringify(result.data.results, null, 2));

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Error getting command status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

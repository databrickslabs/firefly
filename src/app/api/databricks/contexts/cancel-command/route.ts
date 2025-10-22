import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

interface CancelCommandRequest {
  cluster_id: string;
  context_id: string;
  command_id: string;
}

export async function POST(request: Request) {
  try {
    const body: CancelCommandRequest = await request.json();
    const { cluster_id, context_id, command_id } = body;

    if (!cluster_id || !context_id || !command_id) {
      return NextResponse.json(
        { error: "cluster_id, context_id, and command_id are required" },
        { status: 400 }
      );
    }

    console.log("=== CANCELLING COMMAND ===");
    console.log("Cluster ID:", cluster_id);
    console.log("Context ID:", context_id);
    console.log("Command ID:", command_id);

    const result = await callDatabricksApi({
      endpoint: "/api/1.2/commands/cancel",
      method: "POST",
      body: {
        clusterId: cluster_id,
        contextId: context_id,
        commandId: command_id,
      },
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    console.log("Response Status:", result.response.status);
    console.log("Cancel command response:", result.data);

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Error cancelling command:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

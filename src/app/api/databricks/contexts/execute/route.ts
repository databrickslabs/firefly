import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

interface ExecuteCommandRequest {
  cluster_id: string;
  context_id: string;
  command: string;
  language?: string;
}

interface ExecuteCommandResponse {
  id: string;
}

export async function POST(request: Request) {
  try {
    const body: ExecuteCommandRequest = await request.json();
    const { cluster_id, context_id, command, language = "python" } = body;

    if (!cluster_id || !context_id || !command) {
      return NextResponse.json(
        { error: "cluster_id, context_id, and command are required" },
        { status: 400 }
      );
    }

    console.log("=== EXECUTING COMMAND ===");
    console.log("Cluster ID:", cluster_id);
    console.log("Context ID:", context_id);
    console.log("Language:", language);
    console.log("Command:", command.substring(0, 100) + "...");

    const result = await callDatabricksApi<ExecuteCommandResponse>({
      endpoint: "/api/1.2/commands/execute",
      method: "POST",
      body: {
        clusterId: cluster_id,
        contextId: context_id,
        language: language,
        command: command,
      },
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    console.log("Response Status:", result.response.status);
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Error executing command:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

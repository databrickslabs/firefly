import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

interface DestroyContextRequest {
  cluster_id: string;
  context_id: string;
}

export async function POST(request: Request) {
  try {
    const body: DestroyContextRequest = await request.json();
    const { cluster_id, context_id } = body;

    if (!cluster_id || !context_id) {
      return NextResponse.json(
        { error: "cluster_id and context_id are required" },
        { status: 400 }
      );
    }

    console.log("=== DESTROYING EXECUTION CONTEXT ===");
    console.log("Cluster ID:", cluster_id);
    console.log("Context ID:", context_id);

    const result = await callDatabricksApi({
      endpoint: "/api/1.2/contexts/destroy",
      method: "POST",
      body: {
        clusterId: cluster_id,
        contextId: context_id,
      },
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    console.log("Response Status:", result.response.status);
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Error destroying execution context:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

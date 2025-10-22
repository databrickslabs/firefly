import { NextResponse } from "next/server";
import {
  callDatabricksApi,
  createErrorResponse,
} from "@/lib/databricks-api-wrapper";

export const dynamic = "force-dynamic";

interface CreateContextRequest {
  cluster_id: string;
  language?: string;
}

interface CreateContextResponse {
  id: string;
}

export async function POST(request: Request) {
  try {
    const body: CreateContextRequest = await request.json();
    const { cluster_id, language = "python" } = body;

    if (!cluster_id) {
      return NextResponse.json(
        { error: "cluster_id is required" },
        { status: 400 }
      );
    }

    console.log("=== CREATING EXECUTION CONTEXT ===");
    console.log("Cluster ID:", cluster_id);
    console.log("Language:", language);

    const result = await callDatabricksApi<CreateContextResponse>({
      endpoint: "/api/1.2/contexts/create",
      method: "POST",
      body: {
        clusterId: cluster_id,
        language: language,
      },
    });

    if (!result.success) {
      return createErrorResponse(result);
    }

    console.log("Response Status:", result.response.status);
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Error creating execution context:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

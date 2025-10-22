import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";

export const dynamic = "force-dynamic";

/**
 * Returns the complete user data including email, workspace URL, and organization info
 * This endpoint is used to initialize the global user store
 */
export async function GET() {
  try {
    const tokenResult = await getDatabricksWorkspaceToken();

    if (!tokenResult.success) {
      // Check if this is a re-authentication required scenario
      if (tokenResult.error.details === "REQUIRE_REAUTHENTICATION") {
        return NextResponse.json(
          {
            error: tokenResult.error.error,
            details: tokenResult.error.details,
            requireReauth: true,
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    return NextResponse.json({ data: tokenResult.data });
  } catch (error) {
    console.error("Error getting user data:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

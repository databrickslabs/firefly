import { NextResponse } from "next/server";
import { getDatabricksSpnToken } from "@/lib/databricks-spn-authtoken";

export const dynamic = "force-dynamic";

// Databricks workspace URL for SPN token generation (from environment variables)
const DATABRICKS_WORKSPACE_URL = process.env.SPN_AUTH_DATABRICKS_WORKSPACE_URL || "";

/**
 * Returns the complete user data including email, workspace URL for SPN authentication
 * This endpoint is used to initialize the global user store for SPN-authenticated users
 */
export async function GET() {
  try {
    const tokenResult = await getDatabricksSpnToken(DATABRICKS_WORKSPACE_URL);

    if (!tokenResult.success) {
      // Check if this is a re-authentication required scenario
      if (tokenResult.error.status === 401) {
        return NextResponse.json(
          {
            error: tokenResult.error.error,
            details: "REQUIRE_REAUTHENTICATION",
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

    // Return data in the same format as the regular user-data endpoint
    return NextResponse.json({
      data: {
        userEmail: tokenResult.data.userEmail,
        workspaceUrl: DATABRICKS_WORKSPACE_URL,
        // Use the SPN client ID as a pseudo organization ID
        activeOrganizationId: tokenResult.data.clientId,
        monacoRootPath: `/Users/${tokenResult.data.userEmail}`,
      }
    });
  } catch (error) {
    console.error("Error getting SPN user data:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

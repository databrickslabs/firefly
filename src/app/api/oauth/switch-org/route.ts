import { NextRequest, NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/oauth/switch-org
 *
 * Switches the active organization if a valid OAuth token exists for that org.
 * Returns whether a token exists and switches the session, or indicates signin is needed.
 */
export async function POST(request: NextRequest) {
  try {
    const { organizationId } = await request.json();

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "No active session" },
        { status: 401 }
      );
    }

    // Check if we have a valid OAuth token for this organization
    try {
      const tokenResponse = await auth.api.getAccessToken({
        headers: await headers(),
        body: {
          providerId: `databricks-workspace-${organizationId}`,
        },
      });

      // If we got a token, we can switch directly
      if (tokenResponse && tokenResponse.accessToken) {
        console.log(`[Switch Org] Found valid token for org ${organizationId}, switching...`);

        // Set the active organization
        await auth.api.setActiveOrganization({
          headers: await headers(),
          body: {
            organizationId,
          },
        });

        return NextResponse.json({
          success: true,
          hasToken: true,
          message: "Organization switched successfully",
        });
      }
    } catch (error) {
      // No token found for this org, need to sign in
      console.log(`[Switch Org] No valid token for org ${organizationId}:`, error);
    }

    // No valid token exists, user needs to authenticate
    return NextResponse.json({
      success: false,
      hasToken: false,
      message: "No OAuth token found for this organization. Sign in required.",
      organizationId,
    });
  } catch (error) {
    console.error("[Switch Org] Error:", error);
    return NextResponse.json(
      { error: "Failed to switch organization", details: String(error) },
      { status: 500 }
    );
  }
}

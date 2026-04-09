import { NextResponse } from "next/server";
import { getDatabricksSpnToken } from "@/lib/databricks-spn-authtoken";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";

export const dynamic = "force-dynamic";

/**
 * Returns the complete user data including email, workspace URL for SPN authentication
 * This endpoint is used to initialize the global user store for SPN-authenticated users
 */
export async function GET() {
  try {
    // Get the current session to find the active organization
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json(
        { error: "No active organization in session", details: "Please select an organization first" },
        { status: 401 }
      );
    }

    const activeOrgId = session.session.activeOrganizationId;

    // Fetch the organization to get the workspace URL
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, activeOrgId))
      .limit(1);

    if (!org) {
      return NextResponse.json(
        { error: `Organization not found: ${activeOrgId}`, details: "The organization associated with your session no longer exists." },
        { status: 404 }
      );
    }

    if (!org.workspaceUrl) {
      return NextResponse.json(
        { error: "No workspace URL configured for this organization", details: { organizationId: org.id, organizationName: org.name } },
        { status: 400 }
      );
    }

    const workspaceUrl = org.workspaceUrl.replace(/\/$/, '');
    const userEmail = session.user.email;

    // Pass userEmail and orgId to enable BYOD SPN fallback for guest users
    const tokenResult = await getDatabricksSpnToken(workspaceUrl, undefined, userEmail, activeOrgId);

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

    // Decode the JWT token to get the subject (SPN identity)
    const decodedToken = decodeJwt(tokenResult.data.accessToken);
    const tokenSubject = decodedToken.sub as string;

    if (!tokenSubject) {
      return NextResponse.json(
        { error: "Invalid token: missing subject claim", details: "The SPN token does not contain a valid subject" },
        { status: 500 }
      );
    }

    // Return data in the same format as the regular user-data endpoint
    // Use the token subject (SPN identity) for workspace paths
    return NextResponse.json({
      data: {
        userEmail: tokenSubject,
        workspaceUrl: workspaceUrl,
        // Use the organization ID from the session
        activeOrganizationId: activeOrgId,
        // Use the token subject for workspace paths (SPN's workspace folder)
        monacoRootPath: `/Users/${tokenSubject}`,
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

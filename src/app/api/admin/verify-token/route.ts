import { NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/verify-token
 *
 * Verifies that the user has a valid databricks-account OAuth token.
 * Returns whether token exists and is valid, or if re-authentication is needed.
 */
export async function GET() {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { valid: false, error: "No active session" },
        { status: 401 }
      );
    }

    // Check if user is admin (@databricks.com email)
    const email = session.user?.email;
    if (!email || !email.toLowerCase().endsWith("@databricks.com")) {
      return NextResponse.json(
        { valid: false, error: "Not an admin user" },
        { status: 403 }
      );
    }

    // Check if we have a valid OAuth token for databricks-account
    try {
      const tokenResponse = await auth.api.getAccessToken({
        headers: await headers(),
        body: {
          providerId: "databricks-account",
        },
      });

      // If we got a token, it's valid (better-auth handles refresh automatically)
      if (tokenResponse && tokenResponse.accessToken) {
        console.log(`[Admin Token] Valid databricks-account token found for ${email}`);
        return NextResponse.json({
          valid: true,
          message: "Admin token is valid",
        });
      }
    } catch (error: unknown) {
      // Check if it's a "Account not found" error (user never authenticated with databricks-account)
      const errorMessage = (error as Error)?.message || String(error);
      const errorStatus = (error as { status?: string })?.status;
      console.log(`[Admin Token] No valid databricks-account token for ${email}:`, errorMessage);

      // This is expected if user never authenticated with databricks-account provider
      if (errorMessage.includes("Account not found") || errorStatus === "BAD_REQUEST") {
        console.log(`[Admin Token] User ${email} has not authenticated with databricks-account provider yet`);
      }
    }

    // No valid token exists, user needs to authenticate
    return NextResponse.json({
      valid: false,
      requiresAuth: true,
      message: "No valid admin OAuth token. Please sign in with Databricks account-level OAuth.",
    });
  } catch (error) {
    console.error("[Admin Token] Error verifying token:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to verify token", details: String(error) },
      { status: 500 }
    );
  }
}

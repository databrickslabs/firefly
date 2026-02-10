import { NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { getGlobalAdminAccountToken } from "@/lib/databricks-account-admin-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/sso-spn-admin/verify-token
 *
 * Verifies that:
 * 1. The user has a valid session
 * 2. The user is an admin (@databricks.com email)
 * 3. The global admin SPN can obtain an account-level token
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

    const email = session.user?.email;
    if (!email || !email.toLowerCase().endsWith("@databricks.com")) {
      return NextResponse.json(
        { valid: false, error: "Not an admin user" },
        { status: 403 }
      );
    }

    const tokenResult = await getGlobalAdminAccountToken();

    if (tokenResult.success) {
      console.log(
        `[SPN Admin Token] Account-level SPN token verified for ${email}`
      );
      return NextResponse.json({
        valid: true,
        message: "Account-level SPN token is valid",
      });
    }

    console.log(
      `[SPN Admin Token] Failed to obtain account-level token: ${tokenResult.error}`
    );
    return NextResponse.json({
      valid: false,
      error: tokenResult.error,
    });
  } catch (error) {
    console.error("[SPN Admin Token] Error verifying token:", error);
    return NextResponse.json(
      {
        valid: false,
        error: "Failed to verify token",
        details: String(error),
      },
      { status: 500 }
    );
  }
}

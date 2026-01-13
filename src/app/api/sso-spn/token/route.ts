import { NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Returns the Okta access token for the databricks-spn-mapping provider
 */
export async function GET() {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - No active session" },
        { status: 401 }
      );
    }

    // Get the access token for the databricks-spn-mapping provider
    const tokenResponse = await auth.api.getAccessToken({
      headers: await headers(),
      body: {
        providerId: "databricks-spn-mapping",
      },
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      return NextResponse.json(
        { error: "No Okta access token found. Please sign in with Okta." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      accessToken: tokenResponse.accessToken,
      userEmail: session.user.email,
    });
  } catch (error) {
    console.error("Error getting Okta token:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

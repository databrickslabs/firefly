import { NextRequest, NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated and is admin
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    if (session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Not authorized. Admin role required." },
        { status: 403 }
      );
    }

    const { userId, email } = await request.json();

    if (!userId || !email) {
      return NextResponse.json(
        { error: "userId and email are required" },
        { status: 400 }
      );
    }

    console.log("=== MAP SCIM USER API ===");
    console.log("Admin User ID:", session.user.id);
    console.log("Target User ID:", userId);
    console.log("Target Email:", email);

    // Get the admin's Databricks account access token (not the target user's)
    const { getDatabricksAccountToken, lookupUserByEmail } = await import("@/lib/databricks-scim");

    const adminAccessToken = await getDatabricksAccountToken(session.user.id);
    if (!adminAccessToken) {
      console.log("Admin does not have Databricks account access token");
      return NextResponse.json(
        {
          success: false,
          error: "Admin account does not have Databricks OAuth token. Please authenticate with Databricks first."
        },
        { status: 400 }
      );
    }

    console.log("Admin access token found, looking up SCIM user");

    // Use admin's token to lookup the target user's SCIM ID
    const accountId = process.env.DATABRICKS_ACCOUNT_ID;
    if (!accountId) {
      console.error("DATABRICKS_ACCOUNT_ID not configured");
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error: DATABRICKS_ACCOUNT_ID not set"
        },
        { status: 500 }
      );
    }

    const scimUserId = await lookupUserByEmail(accountId, email, adminAccessToken);
    if (!scimUserId) {
      console.log("Could not find SCIM user ID for email:", email);
      return NextResponse.json(
        {
          success: false,
          error: `Could not find SCIM user for email: ${email}. User may not exist in Databricks account.`
        },
        { status: 404 }
      );
    }

    console.log("Found SCIM user ID:", scimUserId);

    // Update the target user's accountIdUserIdMapping field
    const mapping: Record<string, string> = {};
    mapping[accountId] = scimUserId;

    await db
      .update(user)
      .set({
        accountIdUserIdMapping: JSON.stringify(mapping),
      })
      .where(eq(user.id, userId));

    console.log("SCIM mapping update succeeded");

    return NextResponse.json({
      success: true,
      scimId: scimUserId,
    });
  } catch (error) {
    console.error("Error in map-scim-user API:", error);
    return NextResponse.json(
      { success: false, error: "Failed to map SCIM user" },
      { status: 500 }
    );
  }
}

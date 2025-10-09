import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/oauth/set-org
 *
 * Sets an httpOnly cookie with the organization ID for the OAuth flow
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

    const response = NextResponse.json({ success: true });

    // Set httpOnly cookie with organization ID
    response.cookies.set("oauth_org_id", organizationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    console.log("[OAuth Set Org] Set oauth_org_id cookie:", organizationId);

    return response;
  } catch (error) {
    console.error("[OAuth Set Org] Error:", error);
    return NextResponse.json(
      { error: "Failed to set organization cookie" },
      { status: 500 }
    );
  }
}

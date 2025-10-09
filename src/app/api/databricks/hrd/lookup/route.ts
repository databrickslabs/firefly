import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization, member, user } from "@/db/schema/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/databricks/hrd/lookup
 *
 * Looks up organizations for a given email address
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Find user by email
    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (users.length === 0) {
      // User doesn't exist yet - return empty organizations
      return NextResponse.json({
        organizations: [],
      });
    }

    const foundUser = users[0];

    // Get all organizations the user is a member of
    const memberships = await db
      .select({
        organization: organization,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, foundUser.id));

    const organizations = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      workspaceUrl: m.organization.workspaceUrl,
      slug: m.organization.slug,
    }));

    return NextResponse.json({
      organizations,
    });
  } catch (error) {
    console.error("Error looking up organizations:", error);
    return NextResponse.json(
      { error: "Failed to lookup organizations" },
      { status: 500 }
    );
  }
}

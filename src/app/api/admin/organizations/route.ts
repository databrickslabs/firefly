import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization, member, user } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

export const ORGANIZATIONS_CACHE_TAG = "admin-organizations";

/**
 * GET /api/admin/organizations
 * Fetch all organizations with their members
 */
export async function GET(request: NextRequest) {
  try {
    // Fetch all organizations
    const orgs = await db.select().from(organization);

    // Fetch members for each organization
    const orgsWithMembers = await Promise.all(
      orgs.map(async (org) => {
        const orgMembers = await db
          .select({
            id: member.id,
            userId: member.userId,
            role: member.role,
            createdAt: member.createdAt,
            userEmail: user.email,
            userName: user.name,
          })
          .from(member)
          .leftJoin(user, eq(member.userId, user.id))
          .where(eq(member.organizationId, org.id));

        return {
          ...org,
          members: orgMembers.map((m) => ({
            id: m.id,
            userId: m.userId,
            role: m.role,
            createdAt: m.createdAt,
            user: {
              email: m.userEmail,
              name: m.userName,
            },
          })),
        };
      })
    );

    return NextResponse.json(orgsWithMembers);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/organizations
 * Create a new organization
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, slug, workspaceUrl, ssoEnabled } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    // Generate a unique ID
    const id = `org_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const [newOrg] = await db
      .insert(organization)
      .values({
        id,
        name,
        slug: slug || null,
        workspaceUrl: workspaceUrl || null,
        ssoEnabled: ssoEnabled ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      ...newOrg,
      members: [],
    });
  } catch (error) {
    console.error("Error creating organization:", error);
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}

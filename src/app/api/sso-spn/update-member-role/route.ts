import { NextRequest, NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { member } from "@/db/schema/auth";
import { eq, and } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { ORG_USERS_CACHE_TAG } from "@/app/api/databricks/workspace/organization-users/route";

export const dynamic = "force-dynamic";

/**
 * POST /api/sso-spn/update-member-role
 * Allows org owners/admins to update member roles within their organization
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized - No active session" },
        { status: 401 }
      );
    }

    if (!session.session?.activeOrganizationId) {
      return NextResponse.json(
        { error: "No active organization in session" },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const organizationId = session.session.activeOrganizationId;

    // Check if current user is owner or admin in this organization
    const [currentUserMember] = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!currentUserMember) {
      return NextResponse.json(
        { error: "You are not a member of this organization" },
        { status: 403 }
      );
    }

    if (currentUserMember.role !== "owner" && currentUserMember.role !== "admin") {
      return NextResponse.json(
        { error: "Only owners and admins can modify member roles" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { targetUserId, newRole } = body;

    if (!targetUserId || !newRole) {
      return NextResponse.json(
        { error: "Missing required fields: targetUserId and newRole" },
        { status: 400 }
      );
    }

    // Validate role value
    if (!["member", "admin"].includes(newRole)) {
      return NextResponse.json(
        { error: "Invalid role. Must be 'member' or 'admin'" },
        { status: 400 }
      );
    }

    // Prevent users from modifying their own role
    if (targetUserId === userId) {
      return NextResponse.json(
        { error: "You cannot modify your own role" },
        { status: 400 }
      );
    }

    // Get the target member record
    const [targetMember] = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, targetUserId),
          eq(member.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!targetMember) {
      return NextResponse.json(
        { error: "Target user is not a member of this organization" },
        { status: 404 }
      );
    }

    // Prevent modifying owner role (owners can only be changed by other means)
    if (targetMember.role === "owner") {
      return NextResponse.json(
        { error: "Cannot modify owner role" },
        { status: 403 }
      );
    }

    // Update the member role
    await db
      .update(member)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(member.id, targetMember.id));

    // Revalidate caches
    revalidateTag(ORG_USERS_CACHE_TAG);
    revalidateTag(`org-${organizationId}`);

    return NextResponse.json({
      success: true,
      message: `Role updated to ${newRole}`
    });
  } catch (error) {
    console.error("Error updating member role:", error);
    return NextResponse.json(
      { error: "Failed to update member role", details: String(error) },
      { status: 500 }
    );
  }
}

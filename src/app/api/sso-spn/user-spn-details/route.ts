import { NextRequest, NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { user, member, userSpns, organization } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface UserSpnDetailsResponse {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  };
  spnMapping: {
    hasMapping: boolean;
    clientId: string | null;
    clientSecretPreview: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };
  organization: {
    name: string;
    workspaceUrl: string | null;
  };
}

/**
 * Masks a secret showing first 5 and last 3 characters with random asterisks in between
 */
function maskSecret(secret: string): string {
  if (!secret || secret.length <= 8) {
    return "***";
  }
  // Random asterisk count (8-16) to not reveal actual secret length
  const randomAsterisks = "*".repeat(Math.floor(Math.random() * 9) + 8);
  const first5 = secret.substring(0, 5);
  const last3 = secret.substring(secret.length - 3);
  return `${first5}${randomAsterisks}${last3}`;
}

/**
 * Returns SPN details for a specific user in the organization
 * Only accessible to organization owners/admins
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json(
        { error: "userId parameter is required" },
        { status: 400 }
      );
    }

    // Get the current session
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
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const activeOrgId = session.session.activeOrganizationId;

    // Verify the current user is owner/admin of this organization
    const [currentMember] = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, activeOrgId)
        )
      )
      .limit(1);

    if (!currentMember || (currentMember.role !== "owner" && currentMember.role !== "admin")) {
      return NextResponse.json(
        { error: "Only organization owners and admins can view user SPN details" },
        { status: 403 }
      );
    }

    // Verify the target user is a member of this organization
    const [targetMemberRecord] = await db
      .select({
        role: member.role,
        userId: member.userId,
      })
      .from(member)
      .where(
        and(
          eq(member.userId, targetUserId),
          eq(member.organizationId, activeOrgId)
        )
      )
      .limit(1);

    if (!targetMemberRecord) {
      return NextResponse.json(
        { error: "User is not a member of this organization" },
        { status: 404 }
      );
    }

    // Fetch the target user details
    const [targetUser] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Fetch the organization
    const [org] = await db
      .select({
        name: organization.name,
        workspaceUrl: organization.workspaceUrl,
      })
      .from(organization)
      .where(eq(organization.id, activeOrgId))
      .limit(1);

    // Fetch the SPN mapping for this user
    const [spnRecord] = await db
      .select()
      .from(userSpns)
      .where(eq(userSpns.email, targetUser.email))
      .limit(1);

    const response: UserSpnDetailsResponse = {
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetMemberRecord.role,
      },
      spnMapping: {
        hasMapping: !!spnRecord,
        clientId: spnRecord?.clientId || null,
        clientSecretPreview: spnRecord?.clientSecret
          ? maskSecret(spnRecord.clientSecret)
          : null,
        createdAt: spnRecord?.createdAt || null,
        updatedAt: spnRecord?.updatedAt || null,
      },
      organization: {
        name: org?.name || "Unknown",
        workspaceUrl: org?.workspaceUrl || null,
      },
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error("Error getting user SPN details:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

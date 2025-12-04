import { NextRequest, NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { db } from "@/db";
import { member } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { ORGANIZATIONS_CACHE_TAG } from "../organizations/route";
import { ORG_USERS_CACHE_TAG } from "@/app/api/databricks/workspace/organization-users/route";

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin (@databricks.com)
    const email = session.user?.email;
    if (!email || !email.toLowerCase().endsWith("@databricks.com")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { memberId, role } = body;

    if (!memberId || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get the member's organizationId for cache invalidation
    const memberRecord = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.id, memberId))
      .limit(1);

    const organizationId = memberRecord[0]?.organizationId;

    // Update member role
    await db
      .update(member)
      .set({ role, updatedAt: new Date() })
      .where(eq(member.id, memberId));

    // Revalidate caches
    revalidateTag(ORGANIZATIONS_CACHE_TAG);
    revalidateTag(ORG_USERS_CACHE_TAG);
    if (organizationId) {
      revalidateTag(`org-${organizationId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating member role:", error);
    return NextResponse.json(
      { error: "Failed to update member role" },
      { status: 500 }
    );
  }
}

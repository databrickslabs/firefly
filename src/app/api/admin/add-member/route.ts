import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { member } from "@/db/schema/auth";
import { revalidateTag } from "next/cache";
import { ORGANIZATIONS_CACHE_TAG } from "../organizations/route";
import { ORPHANED_USERS_CACHE_TAG } from "../orphaned-users/route";

export async function POST(request: NextRequest) {
  try {
    // Check authentication
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
    const { organizationId, userId, role } = body;

    if (!organizationId || !userId || !role) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate a unique ID for the member
    const memberId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Add member to organization
    await db.insert(member).values({
      id: memberId,
      organizationId,
      userId,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Revalidate both caches
    revalidateTag(ORGANIZATIONS_CACHE_TAG);
    revalidateTag(ORPHANED_USERS_CACHE_TAG);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding member:", error);
    return NextResponse.json(
      { error: "Failed to add member" },
      { status: 500 }
    );
  }
}

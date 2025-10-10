import { NextRequest, NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { db } from "@/db";
import { user, member } from "@/db/schema/auth";
import { unstable_cache } from "next/cache";

// Cache tag for orphaned users
export const ORPHANED_USERS_CACHE_TAG = "admin-orphaned-users";

// Cached database function for fetching orphaned users
const getOrphanedUsers = unstable_cache(
  async () => {
    const userIdsInOrgs = await db
      .select({ userId: member.userId })
      .from(member);

    const userIdsSet = new Set(userIdsInOrgs.map((m) => m.userId));
    const allUsers = await db.select().from(user);

    return allUsers.filter((u) => !userIdsSet.has(u.id));
  },
  ["admin-orphaned-users"],
  {
    tags: [ORPHANED_USERS_CACHE_TAG],
    revalidate: false,
  }
);

export async function GET(request: NextRequest) {
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

    // Fetch orphaned users using cached function
    const orphanedUsers = await getOrphanedUsers();

    return NextResponse.json(orphanedUsers);
  } catch (error) {
    console.error("Error fetching orphaned users:", error);
    return NextResponse.json(
      { error: "Failed to fetch orphaned users" },
      { status: 500 }
    );
  }
}

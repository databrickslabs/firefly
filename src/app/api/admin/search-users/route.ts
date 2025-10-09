import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { ilike, or } from "drizzle-orm";

export async function GET(request: NextRequest) {
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

    // Get search query
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    // Search users by email or name (case-insensitive)
    const users = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
      })
      .from(user)
      .where(
        or(
          ilike(user.email, `%${query}%`),
          ilike(user.name, `%${query}%`)
        )
      )
      .limit(10);

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }
}

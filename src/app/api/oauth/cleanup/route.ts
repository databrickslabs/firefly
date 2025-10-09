import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { oauthFlowMapping } from "@/db/schema/auth";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * OAuth Flow Cleanup Endpoint
 *
 * This endpoint deletes expired OAuth flow mappings from the database.
 * Should be called periodically (e.g., via cron job) to prevent table bloat.
 * Mappings older than 10 minutes are considered expired.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authorization (optional - add a secret header check in production)
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.OAUTH_CLEANUP_SECRET || "cleanup-secret";

    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete mappings older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    await db
      .delete(oauthFlowMapping)
      .where(sql`${oauthFlowMapping.createdAt} < ${tenMinutesAgo}`);

    console.log("[OAuth Cleanup] Deleted expired flow mappings");

    return NextResponse.json({
      success: true,
      message: "Cleanup completed",
    });
  } catch (error) {
    console.error("[OAuth Cleanup] Cleanup error:", error);
    return NextResponse.json(
      { error: "Failed to cleanup OAuth flow mappings" },
      { status: 500 }
    );
  }
}

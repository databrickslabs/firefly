import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization } from "@/db/schema/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/databricks/organizations/[id]
 *
 * Fetch organization details by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const orgs = await db
      .select()
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1);

    const org = orgs[0];
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: org.id,
      name: org.name,
      workspaceUrl: org.workspaceUrl,
      slug: org.slug,
    });
  } catch (error) {
    console.error("Error fetching organization:", error);
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    );
  }
}

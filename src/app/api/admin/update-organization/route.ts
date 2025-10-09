import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { organization } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { ORGANIZATIONS_CACHE_TAG } from "../organizations/route";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user?.email;
    if (!email || !email.toLowerCase().endsWith("@databricks.com")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { organizationId, name, slug, workspaceUrl, ssoEnabled } = body;

    if (!organizationId || !name) {
      return NextResponse.json(
        { error: "Organization ID and name are required" },
        { status: 400 }
      );
    }

    // Get current organization state
    const [currentOrg] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    if (!currentOrg) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Update the organization
    const [updatedOrg] = await db
      .update(organization)
      .set({
        name,
        slug: slug || null,
        workspaceUrl: workspaceUrl || null,
        ssoEnabled: ssoEnabled !== undefined ? ssoEnabled : currentOrg.ssoEnabled,
        updatedAt: new Date(),
      })
      .where(eq(organization.id, organizationId))
      .returning();

    // Revalidate organizations cache
    revalidateTag(ORGANIZATIONS_CACHE_TAG);

    return NextResponse.json(updatedOrg);
  } catch (error) {
    console.error("Failed to update organization:", error);
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    );
  }
}

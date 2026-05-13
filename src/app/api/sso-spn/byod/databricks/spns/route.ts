import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { byodDatabricksSpns, byodDatabricksWorkspaces } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Helper to get the active organization ID from session
 */
async function getActiveOrgId(): Promise<{ orgId: string } | { error: string; status: number }> {
  const auth = await getAuthInstance();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.session?.activeOrganizationId) {
    return { error: "No active organization in session", status: 401 };
  }

  if (session.user?.role === "guest") {
    return { error: "Guest users cannot perform this action", status: 403 };
  }

  return { orgId: session.session.activeOrganizationId };
}

/**
 * GET /api/sso-spn/byod/databricks/spns
 * List all SPNs for the current organization
 */
export async function GET() {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    const spns = await db
      .select()
      .from(byodDatabricksSpns)
      .where(eq(byodDatabricksSpns.organizationId, orgResult.orgId));

    // Return SPNs without exposing the full client secret (mask it)
    const maskedSpns = spns.map((spn) => ({
      ...spn,
      clientSecret: `${"*".repeat(8)}${spn.clientSecret.slice(-4)}`,
    }));

    return NextResponse.json(maskedSpns);
  } catch (error) {
    console.error("Error fetching SPNs:", error);
    return NextResponse.json(
      { error: "Failed to fetch SPNs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sso-spn/byod/databricks/spns
 * Create a new SPN
 */
export async function POST(request: NextRequest) {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    const body = await request.json();
    const { name, clientId, clientSecret } = body;

    if (!name || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Name, clientId, and clientSecret are required" },
        { status: 400 }
      );
    }

    // Generate a unique ID
    const id = `byod_spn_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const [newSpn] = await db
      .insert(byodDatabricksSpns)
      .values({
        id,
        organizationId: orgResult.orgId,
        name,
        clientId,
        clientSecret,
      })
      .returning();

    // Mask the client secret in the response
    return NextResponse.json({
      ...newSpn,
      clientSecret: `${"*".repeat(8)}${newSpn.clientSecret.slice(-4)}`,
    });
  } catch (error) {
    console.error("Error creating SPN:", error);
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes("unique")) {
      return NextResponse.json(
        { error: "An SPN with this client ID already exists in this organization" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create SPN" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sso-spn/byod/databricks/spns
 * Delete an SPN by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    const { searchParams } = new URL(request.url);
    const spnId = searchParams.get("id");

    if (!spnId) {
      return NextResponse.json(
        { error: "SPN ID is required" },
        { status: 400 }
      );
    }

    // Check if any workspaces are using this SPN
    const workspacesUsingSPN = await db
      .select()
      .from(byodDatabricksWorkspaces)
      .where(eq(byodDatabricksWorkspaces.spnId, spnId))
      .limit(1);

    if (workspacesUsingSPN.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete SPN: it is still being used by one or more workspaces" },
        { status: 409 }
      );
    }

    // Delete the SPN (only if it belongs to this organization)
    const result = await db
      .delete(byodDatabricksSpns)
      .where(
        and(
          eq(byodDatabricksSpns.id, spnId),
          eq(byodDatabricksSpns.organizationId, orgResult.orgId)
        )
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "SPN not found or you don't have permission to delete it" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deleted: result[0] });
  } catch (error) {
    console.error("Error deleting SPN:", error);
    return NextResponse.json(
      { error: "Failed to delete SPN" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { byodDatabricksWorkspaces, byodDatabricksSpns } from "@/db/schema";
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
 * GET /api/sso-spn/byod/databricks/workspaces
 * List all workspaces for the current organization with their associated SPN info
 */
export async function GET() {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    // Join workspaces with SPNs to get the SPN name
    const workspaces = await db
      .select({
        id: byodDatabricksWorkspaces.id,
        organizationId: byodDatabricksWorkspaces.organizationId,
        workspaceUrl: byodDatabricksWorkspaces.workspaceUrl,
        spnId: byodDatabricksWorkspaces.spnId,
        name: byodDatabricksWorkspaces.name,
        deltaSharingGlobalMetastoreId: byodDatabricksWorkspaces.deltaSharingGlobalMetastoreId,
        deltaSharingOrganizationName: byodDatabricksWorkspaces.deltaSharingOrganizationName,
        deltaSharingScope: byodDatabricksWorkspaces.deltaSharingScope,
        createdAt: byodDatabricksWorkspaces.createdAt,
        updatedAt: byodDatabricksWorkspaces.updatedAt,
        spnName: byodDatabricksSpns.name,
        spnClientId: byodDatabricksSpns.clientId,
      })
      .from(byodDatabricksWorkspaces)
      .leftJoin(byodDatabricksSpns, eq(byodDatabricksWorkspaces.spnId, byodDatabricksSpns.id))
      .where(eq(byodDatabricksWorkspaces.organizationId, orgResult.orgId));

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sso-spn/byod/databricks/workspaces
 * Create a new workspace
 */
export async function POST(request: NextRequest) {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    const body = await request.json();
    const {
      workspaceUrl,
      spnId,
      name,
      deltaSharingGlobalMetastoreId,
      deltaSharingOrganizationName,
      deltaSharingScope,
    } = body;

    if (!workspaceUrl || !spnId) {
      return NextResponse.json(
        { error: "workspaceUrl and spnId are required" },
        { status: 400 }
      );
    }

    // Normalize workspace URL (remove trailing slash)
    const normalizedUrl = workspaceUrl.replace(/\/+$/, "");

    // Verify the SPN exists and belongs to this organization
    const [spn] = await db
      .select()
      .from(byodDatabricksSpns)
      .where(
        and(
          eq(byodDatabricksSpns.id, spnId),
          eq(byodDatabricksSpns.organizationId, orgResult.orgId)
        )
      )
      .limit(1);

    if (!spn) {
      return NextResponse.json(
        { error: "SPN not found or doesn't belong to this organization" },
        { status: 404 }
      );
    }

    // Generate a unique ID
    const id = `byod_ws_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const [newWorkspace] = await db
      .insert(byodDatabricksWorkspaces)
      .values({
        id,
        organizationId: orgResult.orgId,
        workspaceUrl: normalizedUrl,
        spnId,
        name: name || null,
        deltaSharingGlobalMetastoreId: deltaSharingGlobalMetastoreId || null,
        deltaSharingOrganizationName: deltaSharingOrganizationName || null,
        deltaSharingScope: deltaSharingScope || null,
      })
      .returning();

    return NextResponse.json({
      ...newWorkspace,
      spnName: spn.name,
      spnClientId: spn.clientId,
    });
  } catch (error) {
    console.error("Error creating workspace:", error);
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes("unique")) {
      return NextResponse.json(
        { error: "A workspace with this URL already exists in this organization" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sso-spn/byod/databricks/workspaces
 * Delete a workspace by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      );
    }

    // Delete the workspace (only if it belongs to this organization)
    const result = await db
      .delete(byodDatabricksWorkspaces)
      .where(
        and(
          eq(byodDatabricksWorkspaces.id, workspaceId),
          eq(byodDatabricksWorkspaces.organizationId, orgResult.orgId)
        )
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Workspace not found or you don't have permission to delete it" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deleted: result[0] });
  } catch (error) {
    console.error("Error deleting workspace:", error);
    return NextResponse.json(
      { error: "Failed to delete workspace" },
      { status: 500 }
    );
  }
}

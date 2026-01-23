import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { byodDatabricksWorkspaces, byodDatabricksSpns } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { validateByodWorkspace } from "@/lib/byod-databricks-helpers";

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

  return { orgId: session.session.activeOrganizationId };
}

/**
 * POST /api/sso-spn/byod/databricks/workspaces/validate
 * Validate a workspace and update its delta sharing fields
 *
 * Body: { workspaceId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    const body = await request.json();
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get the workspace
    const [workspace] = await db
      .select()
      .from(byodDatabricksWorkspaces)
      .where(
        and(
          eq(byodDatabricksWorkspaces.id, workspaceId),
          eq(byodDatabricksWorkspaces.organizationId, orgResult.orgId)
        )
      )
      .limit(1);

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get the associated SPN credentials
    const [spn] = await db
      .select()
      .from(byodDatabricksSpns)
      .where(eq(byodDatabricksSpns.id, workspace.spnId))
      .limit(1);

    if (!spn) {
      return NextResponse.json(
        { error: "Associated SPN not found" },
        { status: 404 }
      );
    }

    // Run validation
    const validationResult = await validateByodWorkspace(
      workspace.workspaceUrl,
      spn.clientId,
      spn.clientSecret
    );

    // Update workspace with delta sharing fields if validation succeeded
    if (
      validationResult.deltaSharingGlobalMetastoreId ||
      validationResult.deltaSharingOrganizationName ||
      validationResult.deltaSharingScope
    ) {
      await db
        .update(byodDatabricksWorkspaces)
        .set({
          deltaSharingGlobalMetastoreId: validationResult.deltaSharingGlobalMetastoreId || null,
          deltaSharingOrganizationName: validationResult.deltaSharingOrganizationName || null,
          deltaSharingScope: validationResult.deltaSharingScope || null,
          updatedAt: new Date(),
        })
        .where(eq(byodDatabricksWorkspaces.id, workspaceId));
    }

    return NextResponse.json({
      workspaceId,
      validation: {
        workspaceAccess: validationResult.workspaceAccess,
        metastoreId: validationResult.metastoreId,
        externalSharingEnabled: validationResult.externalSharingEnabled,
      },
      deltaSharingFields: {
        deltaSharingGlobalMetastoreId: validationResult.deltaSharingGlobalMetastoreId || null,
        deltaSharingOrganizationName: validationResult.deltaSharingOrganizationName || null,
        deltaSharingScope: validationResult.deltaSharingScope || null,
      },
    });
  } catch (error) {
    console.error("Error validating workspace:", error);
    return NextResponse.json(
      { error: "Failed to validate workspace" },
      { status: 500 }
    );
  }
}

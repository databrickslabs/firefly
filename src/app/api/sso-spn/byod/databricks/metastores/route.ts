import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { byodDatabricksMetastores } from "@/db/schema";
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

  return { orgId: session.session.activeOrganizationId };
}

/**
 * GET /api/sso-spn/byod/databricks/metastores
 * List all manually configured metastores for the current organization
 */
export async function GET() {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    const metastores = await db
      .select()
      .from(byodDatabricksMetastores)
      .where(eq(byodDatabricksMetastores.organizationId, orgResult.orgId));

    return NextResponse.json(metastores);
  } catch (error) {
    console.error("Error fetching metastores:", error);
    return NextResponse.json(
      { error: "Failed to fetch metastores" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sso-spn/byod/databricks/metastores
 * Create a new manually configured metastore
 */
export async function POST(request: NextRequest) {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    const body = await request.json();
    const { name, globalMetastoreId, sharingOrganizationName, scope } = body;

    if (!name || !globalMetastoreId) {
      return NextResponse.json(
        { error: "Name and globalMetastoreId are required" },
        { status: 400 }
      );
    }

    // Generate a unique ID
    const id = `byod_metastore_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const [newMetastore] = await db
      .insert(byodDatabricksMetastores)
      .values({
        id,
        organizationId: orgResult.orgId,
        name,
        globalMetastoreId,
        sharingOrganizationName: sharingOrganizationName || null,
        scope: scope || null,
      })
      .returning();

    return NextResponse.json(newMetastore);
  } catch (error) {
    console.error("Error creating metastore:", error);
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes("unique")) {
      return NextResponse.json(
        { error: "A metastore with this global ID already exists in this organization" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create metastore" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sso-spn/byod/databricks/metastores
 * Delete a metastore by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const orgResult = await getActiveOrgId();
    if ("error" in orgResult) {
      return NextResponse.json({ error: orgResult.error }, { status: orgResult.status });
    }

    const { searchParams } = new URL(request.url);
    const metastoreId = searchParams.get("id");

    if (!metastoreId) {
      return NextResponse.json(
        { error: "Metastore ID is required" },
        { status: 400 }
      );
    }

    // Delete the metastore (only if it belongs to this organization)
    const result = await db
      .delete(byodDatabricksMetastores)
      .where(
        and(
          eq(byodDatabricksMetastores.id, metastoreId),
          eq(byodDatabricksMetastores.organizationId, orgResult.orgId)
        )
      )
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Metastore not found or you don't have permission to delete it" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deleted: result[0] });
  } catch (error) {
    console.error("Error deleting metastore:", error);
    return NextResponse.json(
      { error: "Failed to delete metastore" },
      { status: 500 }
    );
  }
}

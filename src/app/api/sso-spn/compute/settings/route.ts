import { NextRequest, NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organizationWarehouses } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * PUT /api/sso-spn/compute/settings
 * Sets the default warehouse for the organization.
 *
 * Body: { warehouseId: string }
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id || !session.session?.activeOrganizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeOrgId = session.session.activeOrganizationId;
    const body = await request.json();
    const { warehouseId } = body;

    if (!warehouseId) {
      return NextResponse.json({ error: "warehouseId is required" }, { status: 400 });
    }

    // Verify the warehouse belongs to this org
    const [warehouse] = await db
      .select()
      .from(organizationWarehouses)
      .where(
        and(
          eq(organizationWarehouses.organizationId, activeOrgId),
          eq(organizationWarehouses.warehouseId, warehouseId)
        )
      )
      .limit(1);

    if (!warehouse) {
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
    }

    // Clear all defaults for this org
    await db
      .update(organizationWarehouses)
      .set({ isDefault: false })
      .where(eq(organizationWarehouses.organizationId, activeOrgId));

    // Set the selected warehouse as default
    await db
      .update(organizationWarehouses)
      .set({ isDefault: true })
      .where(
        and(
          eq(organizationWarehouses.organizationId, activeOrgId),
          eq(organizationWarehouses.warehouseId, warehouseId)
        )
      );

    // Return updated list
    const warehouses = await db
      .select()
      .from(organizationWarehouses)
      .where(eq(organizationWarehouses.organizationId, activeOrgId));

    return NextResponse.json({ data: { warehouses } });
  } catch (error) {
    console.error("Error in compute settings PUT:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

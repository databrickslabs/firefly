import { NextRequest, NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization, organizationWarehouses, organizationStorageSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getGlobalAdminToken } from "@/lib/databricks-apps-api";
import {
  createWarehouse,
  deleteWarehouse,
  updateWarehousePermissions,
} from "@/lib/databricks-warehouse-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/sso-spn/compute/warehouses
 * Lists warehouses from Neon DB for the current organization.
 * Also returns the default warehouse size from env var.
 */
export async function GET() {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id || !session.session?.activeOrganizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeOrgId = session.session.activeOrganizationId;

    const warehouses = await db
      .select()
      .from(organizationWarehouses)
      .where(eq(organizationWarehouses.organizationId, activeOrgId));

    const [storageSettings] = await db
      .select()
      .from(organizationStorageSettings)
      .where(eq(organizationStorageSettings.organizationId, activeOrgId))
      .limit(1);

    const defaultWarehouseSize = process.env.ORGANIZATION_DEFAULT_WAREHOUSE || "Small";

    return NextResponse.json({
      data: {
        warehouses,
        defaultWarehouseSize,
        accessGroup: storageSettings?.primaryOrganizationGroup || null,
      },
    });
  } catch (error) {
    console.error("Error in compute warehouses GET:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sso-spn/compute/warehouses
 * Creates a new SQL warehouse in Databricks using global admin SPN credentials,
 * then stores the record in Neon DB.
 *
 * Body: { name: string }
 * Defaults: serverless PRO, size from ORGANIZATION_DEFAULT_WAREHOUSE env var
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id || !session.session?.activeOrganizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeOrgId = session.session.activeOrganizationId;

    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, activeOrgId))
      .limit(1);

    if (!org?.workspaceUrl) {
      return NextResponse.json(
        { error: "No workspace URL configured for this organization" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const defaultSize = process.env.ORGANIZATION_DEFAULT_WAREHOUSE || "Small";

    // Build warehouse config with serverless defaults
    const warehouseConfig = {
      name: body.name as string,
      cluster_size: (body.cluster_size as string) || defaultSize,
      warehouse_type: (body.warehouse_type as string) || "PRO",
      enable_serverless_compute: (body.enable_serverless_compute as boolean) ?? true,
      enable_photon: (body.enable_photon as boolean) ?? true,
      auto_stop_mins: (body.auto_stop_mins as number) ?? 120,
      min_num_clusters: (body.min_num_clusters as number) ?? 1,
      max_num_clusters: (body.max_num_clusters as number) ?? 1,
      tags: {
        custom_tags: [
          { key: "org_name", value: org.name || "" },
          { key: "org_slug", value: org.slug || "" },
        ],
      },
    };

    const tokenResult = await getGlobalAdminToken(org.workspaceUrl);
    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error }, { status: 500 });
    }
    const accessToken = tokenResult.accessToken;

    const result = await createWarehouse(org.workspaceUrl, accessToken, warehouseConfig);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }

    const warehouseId = result.data.id;

    // Check if this is the first warehouse for the org (make it default)
    const existingWarehouses = await db
      .select()
      .from(organizationWarehouses)
      .where(eq(organizationWarehouses.organizationId, activeOrgId));

    const isFirst = existingWarehouses.length === 0;

    // Store in Neon DB
    const [inserted] = await db
      .insert(organizationWarehouses)
      .values({
        organizationId: activeOrgId,
        warehouseId,
        name: warehouseConfig.name,
        clusterSize: warehouseConfig.cluster_size,
        warehouseType: warehouseConfig.warehouse_type,
        enableServerlessCompute: warehouseConfig.enable_serverless_compute,
        enablePhoton: warehouseConfig.enable_photon,
        autoStopMins: warehouseConfig.auto_stop_mins,
        minNumClusters: warehouseConfig.min_num_clusters,
        maxNumClusters: warehouseConfig.max_num_clusters,
        isDefault: isFirst,
      })
      .returning();

    // Auto-grant CAN_USE to the org's storage group if configured
    const [storageSettings] = await db
      .select()
      .from(organizationStorageSettings)
      .where(eq(organizationStorageSettings.organizationId, activeOrgId))
      .limit(1);

    if (storageSettings?.primaryOrganizationGroup) {
      const permResult = await updateWarehousePermissions(
        org.workspaceUrl,
        accessToken,
        warehouseId,
        [{ group_name: storageSettings.primaryOrganizationGroup, permission_level: "CAN_USE" }]
      );

      if (permResult.success) {
        console.log(
          `Auto-granted CAN_USE on warehouse ${warehouseId} to group ${storageSettings.primaryOrganizationGroup}`
        );
      } else {
        console.error("Failed to auto-grant warehouse permissions to org group:", permResult.error);
      }
    }

    return NextResponse.json({ data: inserted });
  } catch (error) {
    console.error("Error in compute warehouses POST:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sso-spn/compute/warehouses
 * Deletes the warehouse in Databricks and removes the record from Neon DB.
 * Body: { warehouseId: string }
 */
export async function DELETE(request: NextRequest) {
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
    const warehouseId = body.warehouseId as string;

    if (!warehouseId) {
      return NextResponse.json({ error: "warehouseId is required" }, { status: 400 });
    }

    // Look up the org to get workspace URL for Databricks delete
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, activeOrgId))
      .limit(1);

    if (org?.workspaceUrl) {
      const tokenResult = await getGlobalAdminToken(org.workspaceUrl);
      if (tokenResult.success) {
        const delResult = await deleteWarehouse(org.workspaceUrl, tokenResult.accessToken, warehouseId);
        if (!delResult.success) {
          console.error("Failed to delete warehouse in Databricks:", delResult.error);
          // Continue to remove from Neon even if Databricks delete fails
        }
      }
    }

    // Check if the warehouse being deleted is the default
    const [deletingWarehouse] = await db
      .select()
      .from(organizationWarehouses)
      .where(
        and(
          eq(organizationWarehouses.organizationId, activeOrgId),
          eq(organizationWarehouses.warehouseId, warehouseId)
        )
      )
      .limit(1);

    const wasDefault = deletingWarehouse?.isDefault ?? false;

    // Remove from Neon DB
    await db
      .delete(organizationWarehouses)
      .where(
        and(
          eq(organizationWarehouses.organizationId, activeOrgId),
          eq(organizationWarehouses.warehouseId, warehouseId)
        )
      );

    // If we deleted the default, promote the first remaining warehouse (by name)
    if (wasDefault) {
      const remaining = await db
        .select()
        .from(organizationWarehouses)
        .where(eq(organizationWarehouses.organizationId, activeOrgId));

      if (remaining.length > 0) {
        remaining.sort((a, b) => a.name.localeCompare(b.name));
        await db
          .update(organizationWarehouses)
          .set({ isDefault: true })
          .where(eq(organizationWarehouses.id, remaining[0].id));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in compute warehouses DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

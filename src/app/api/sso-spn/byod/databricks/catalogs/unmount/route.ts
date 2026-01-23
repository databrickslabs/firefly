import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization, byodDatabricksSharingCatalogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Gets an OAuth token using the global admin SPN credentials
 */
async function getGlobalAdminToken(workspaceUrl: string): Promise<{ success: true; accessToken: string } | { success: false; error: string }> {
  const clientId = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID;
  const clientSecret = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      error: "Global admin SPN credentials not configured",
    };
  }

  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, "");
    const tokenUrl = `${baseUrl}/oidc/v1/token`;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch(tokenUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "all-apis",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Token request failed: ${response.status} - ${errorText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      accessToken: data.access_token,
    };
  } catch (error) {
    return {
      success: false,
      error: `Token request error: ${String(error)}`,
    };
  }
}

/**
 * Deletes a catalog from Databricks
 */
async function deleteCatalog(
  workspaceUrl: string,
  accessToken: string,
  catalogName: string,
  force: boolean = false
): Promise<{ success: true } | { success: false; error: string }> {
  const baseUrl = workspaceUrl.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/api/2.1/unity-catalog/catalogs/${encodeURIComponent(catalogName)}${force ? "?force=true" : ""}`;

  console.log(`[deleteCatalog] Deleting catalog: ${catalogName}`);
  console.log(`[deleteCatalog] Endpoint: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: "DELETE",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`[deleteCatalog] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[deleteCatalog] Error response: ${errorText}`);
      return {
        success: false,
        error: `Failed to delete catalog: ${response.status} - ${errorText}`,
      };
    }

    console.log(`[deleteCatalog] SUCCESS - Catalog ${catalogName} deleted`);
    return { success: true };
  } catch (error) {
    console.log(`[deleteCatalog] Exception: ${String(error)}`);
    return {
      success: false,
      error: `Delete catalog error: ${String(error)}`,
    };
  }
}

/**
 * POST /api/sso-spn/byod/databricks/catalogs/unmount
 *
 * Unmounts (deletes) a Delta Sharing catalog.
 *
 * Request body:
 * - catalogName: The name of the catalog to delete
 * - force: Optional boolean to force deletion even if not empty
 */
export async function POST(request: NextRequest) {
  try {
    // Get the active organization from session
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: "No active organization in session" }, { status: 401 });
    }

    const orgId = session.session.activeOrganizationId;

    // Parse request body
    const body = await request.json();
    const { catalogName, force } = body;

    if (!catalogName) {
      return NextResponse.json(
        { error: "Missing required field: catalogName" },
        { status: 400 }
      );
    }

    // Get the organization's workspace URL
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (!org.workspaceUrl) {
      return NextResponse.json(
        { error: "No workspace URL configured for this organization" },
        { status: 400 }
      );
    }

    const workspaceUrl = org.workspaceUrl;

    console.log(`[POST /catalogs/unmount] ========================================`);
    console.log(`[POST /catalogs/unmount] Organization ID: ${orgId}`);
    console.log(`[POST /catalogs/unmount] Organization Name: ${org.name}`);
    console.log(`[POST /catalogs/unmount] Workspace URL: ${workspaceUrl}`);
    console.log(`[POST /catalogs/unmount] Deleting catalog: ${catalogName}`);
    console.log(`[POST /catalogs/unmount] Force: ${force || false}`);
    console.log(`[POST /catalogs/unmount] ========================================`);

    // Get global admin token
    const tokenResult = await getGlobalAdminToken(workspaceUrl);
    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error }, { status: 500 });
    }

    const { accessToken } = tokenResult;

    // Delete the catalog from Databricks
    const deleteResult = await deleteCatalog(workspaceUrl, accessToken, catalogName, force || false);

    if (!deleteResult.success) {
      return NextResponse.json({ error: deleteResult.error }, { status: 500 });
    }

    // Remove the catalog from the cache
    await db
      .delete(byodDatabricksSharingCatalogs)
      .where(
        and(
          eq(byodDatabricksSharingCatalogs.organizationId, orgId),
          eq(byodDatabricksSharingCatalogs.catalogName, catalogName)
        )
      );

    console.log(`[POST /catalogs/unmount] Removed catalog ${catalogName} from cache`);

    return NextResponse.json({
      success: true,
      message: `Catalog "${catalogName}" unmounted successfully`,
    });
  } catch (error) {
    console.error("Error unmounting catalog:", error);
    return NextResponse.json(
      { error: "Failed to unmount catalog" },
      { status: 500 }
    );
  }
}

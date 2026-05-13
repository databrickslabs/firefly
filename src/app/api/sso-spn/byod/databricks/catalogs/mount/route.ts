import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization, byodDatabricksSharingCatalogs, userSpns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Catalog from Databricks API
interface DatabricksCatalog {
  name: string;
  catalog_type?: string;
  provider_name?: string;
  share_name?: string;
  metastore_id?: string;
  comment?: string;
  owner?: string;
}

interface PermissionChange {
  add?: string[];
  principal: string;
}

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
 * Creates a Delta Sharing catalog
 */
async function createDeltaSharingCatalog(
  workspaceUrl: string,
  accessToken: string,
  catalogName: string,
  providerName: string,
  shareName: string,
  comment?: string
): Promise<{ success: true; catalog: DatabricksCatalog } | { success: false; error: string }> {
  const baseUrl = workspaceUrl.replace(/\/+$/, "");

  const endpoint = `${baseUrl}/api/2.1/unity-catalog/catalogs`;
  console.log(`[createDeltaSharingCatalog] Creating catalog at: ${endpoint}`);
  console.log(`[createDeltaSharingCatalog] Catalog name: ${catalogName}, Provider: ${providerName}, Share: ${shareName}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: catalogName,
        provider_name: providerName,
        share_name: shareName,
        comment: comment || `Delta Sharing catalog mounted from provider ${providerName}, share ${shareName}`,
      }),
    });

    console.log(`[createDeltaSharingCatalog] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[createDeltaSharingCatalog] Error: ${errorText}`);
      return {
        success: false,
        error: `Failed to create catalog: ${response.status} - ${errorText}`,
      };
    }

    const catalog: DatabricksCatalog = await response.json();
    console.log(`[createDeltaSharingCatalog] SUCCESS - Created catalog:`, JSON.stringify({
      name: catalog.name,
      catalog_type: catalog.catalog_type,
      provider_name: catalog.provider_name,
      share_name: catalog.share_name,
      metastore_id: catalog.metastore_id,
      owner: catalog.owner,
    }, null, 2));
    return {
      success: true,
      catalog,
    };
  } catch (error) {
    console.log(`[createDeltaSharingCatalog] Exception: ${String(error)}`);
    return {
      success: false,
      error: `Create catalog error: ${String(error)}`,
    };
  }
}

/**
 * Updates permissions on a catalog
 */
async function updateCatalogPermissions(
  workspaceUrl: string,
  accessToken: string,
  catalogName: string,
  changes: PermissionChange[]
): Promise<{ success: true } | { success: false; error: string }> {
  const baseUrl = workspaceUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(
      `${baseUrl}/api/2.1/unity-catalog/permissions/catalog/${encodeURIComponent(catalogName)}`,
      {
        method: "PATCH",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ changes }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to update permissions: ${response.status} - ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Update permissions error: ${String(error)}`,
    };
  }
}

/**
 * POST /api/sso-spn/byod/databricks/catalogs/mount
 *
 * Mounts a Delta Sharing catalog and grants permissions to the user's service principal.
 *
 * Request body:
 * - providerName: The name of the delta sharing provider
 * - shareName: The name of the share
 * - catalogName: The name for the new catalog
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

    if (!session?.user?.email) {
      return NextResponse.json({ error: "No user email in session" }, { status: 401 });
    }

    if (session.user.role === "guest") {
      return NextResponse.json({ error: "Guest users cannot mount catalogs" }, { status: 403 });
    }

    const orgId = session.session.activeOrganizationId;
    const userEmail = session.user.email;

    // Parse request body
    const body = await request.json();
    const { providerName, shareName, catalogName } = body;

    if (!providerName || !shareName || !catalogName) {
      return NextResponse.json(
        { error: "Missing required fields: providerName, shareName, catalogName" },
        { status: 400 }
      );
    }

    // Validate catalog name (must be valid identifier)
    const catalogNameRegex = /^[a-z][a-z0-9_]*$/;
    if (!catalogNameRegex.test(catalogName)) {
      return NextResponse.json(
        { error: "Invalid catalog name. Must start with a letter and contain only lowercase letters, numbers, and underscores." },
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

    console.log(`[POST /catalogs/mount] ========================================`);
    console.log(`[POST /catalogs/mount] Organization ID: ${orgId}`);
    console.log(`[POST /catalogs/mount] Organization Name: ${org.name}`);
    console.log(`[POST /catalogs/mount] Workspace URL: ${workspaceUrl}`);
    console.log(`[POST /catalogs/mount] Creating catalog: ${catalogName}`);
    console.log(`[POST /catalogs/mount] Provider: ${providerName}, Share: ${shareName}`);
    console.log(`[POST /catalogs/mount] ========================================`);

    // Get the user's SPN (service principal)
    const [userSpn] = await db
      .select()
      .from(userSpns)
      .where(eq(userSpns.email, userEmail))
      .limit(1);

    if (!userSpn) {
      return NextResponse.json(
        { error: "No service principal configured for this user. Please contact your administrator." },
        { status: 400 }
      );
    }

    // Get global admin token
    const tokenResult = await getGlobalAdminToken(workspaceUrl);
    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error }, { status: 500 });
    }

    const { accessToken } = tokenResult;

    // Step 1: Create the Delta Sharing catalog
    const createResult = await createDeltaSharingCatalog(
      workspaceUrl,
      accessToken,
      catalogName,
      providerName,
      shareName
    );

    if (!createResult.success) {
      return NextResponse.json({ error: createResult.error }, { status: 500 });
    }

    const catalog = createResult.catalog;

    // Step 2: Grant permissions to the user's service principal
    // Permissions: BROWSE, EXECUTE, READ_VOLUME, SELECT, USE_CATALOG, USE_SCHEMA
    const permissionsResult = await updateCatalogPermissions(
      workspaceUrl,
      accessToken,
      catalogName,
      [
        {
          principal: userSpn.clientId,
          add: ["BROWSE", "EXECUTE", "READ_VOLUME", "SELECT", "USE_CATALOG", "USE_SCHEMA"],
        },
      ]
    );

    if (!permissionsResult.success) {
      // Catalog was created but permissions failed - still report success but with warning
      console.error("Failed to set permissions:", permissionsResult.error);
    }

    // Step 3: Cache the catalog in the database
    const id = crypto.randomUUID();
    await db.insert(byodDatabricksSharingCatalogs).values({
      id,
      organizationId: orgId,
      providerName,
      shareName,
      catalogName,
      catalogType: catalog.catalog_type || "DELTASHARING_CATALOG",
      metastoreId: catalog.metastore_id,
      isValid: "valid",
      lastValidatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      catalog: {
        name: catalog.name,
        catalogType: catalog.catalog_type,
        providerName: catalog.provider_name,
        shareName: catalog.share_name,
        metastoreId: catalog.metastore_id,
      },
      permissionsGranted: permissionsResult.success,
      permissionsError: !permissionsResult.success ? permissionsResult.error : undefined,
    });
  } catch (error) {
    console.error("Error mounting catalog:", error);
    return NextResponse.json(
      { error: "Failed to mount catalog" },
      { status: 500 }
    );
  }
}

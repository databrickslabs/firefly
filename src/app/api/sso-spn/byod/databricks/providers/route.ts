import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization, byodDatabricksMetastores, byodDatabricksWorkspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

interface Provider {
  name: string;
  data_provider_global_metastore_id?: string;
  authentication_type?: string;
  comment?: string;
  owner?: string;
  cloud?: string;
  region?: string;
}

interface Share {
  name: string;
}

interface ProviderResult {
  metastoreGlobalId: string;
  metastoreName: string;
  hasProvider: boolean;
  provider?: Provider;
  shares: Share[];
  error?: string;
}

interface ProvidersListResponse {
  providers?: Provider[];
}

interface SharesListResponse {
  shares?: Share[];
  next_page_token?: string;
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
      error: "Global admin SPN credentials not configured (FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID and FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET)",
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
 * Calls a Databricks API endpoint
 */
async function callDatabricksApi<T>(
  workspaceUrl: string,
  accessToken: string,
  endpoint: string
): Promise<{ success: true; data: T } | { success: false; error: string; status?: number }> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: errorText,
        status: response.status,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * GET /api/sso-spn/byod/databricks/providers
 *
 * Gets provider and share information for all configured metastores.
 * Uses the global admin SPN credentials to query the organization's workspace.
 */
export async function GET(request: NextRequest) {
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

    // Get the organization's workspace URL (SSO-SPN workspace, not BYOD)
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

    // Get global admin token
    const tokenResult = await getGlobalAdminToken(workspaceUrl);
    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error }, { status: 500 });
    }

    const { accessToken } = tokenResult;

    // Get all metastores (manual and workspace-derived)
    // 1. Fetch manual metastores
    const manualMetastores = await db
      .select()
      .from(byodDatabricksMetastores)
      .where(eq(byodDatabricksMetastores.organizationId, orgId));

    // 2. Fetch workspaces to get workspace-derived metastores
    const workspaces = await db
      .select()
      .from(byodDatabricksWorkspaces)
      .where(eq(byodDatabricksWorkspaces.organizationId, orgId));

    // Combine and deduplicate metastores by globalMetastoreId
    const seenMetastoreIds = new Set<string>();
    const metastores: Array<{ globalMetastoreId: string; name: string }> = [];

    // Add manual metastores first (they take priority)
    for (const m of manualMetastores) {
      if (!seenMetastoreIds.has(m.globalMetastoreId)) {
        seenMetastoreIds.add(m.globalMetastoreId);
        metastores.push({
          globalMetastoreId: m.globalMetastoreId,
          name: m.name,
        });
      }
    }

    // Add workspace-derived metastores
    for (const w of workspaces) {
      if (w.deltaSharingGlobalMetastoreId && !seenMetastoreIds.has(w.deltaSharingGlobalMetastoreId)) {
        seenMetastoreIds.add(w.deltaSharingGlobalMetastoreId);
        metastores.push({
          globalMetastoreId: w.deltaSharingGlobalMetastoreId,
          name: w.deltaSharingOrganizationName || w.name || "Unnamed",
        });
      }
    }

    // Optional: filter by specific metastore IDs from query params
    const { searchParams } = new URL(request.url);
    const filterMetastoreIds = searchParams.get("metastoreIds")?.split(",").filter(Boolean);

    const metastoresToQuery = filterMetastoreIds
      ? metastores.filter((m) => filterMetastoreIds.includes(m.globalMetastoreId))
      : metastores;

    // Query providers for each metastore
    const results: ProviderResult[] = [];

    for (const metastore of metastoresToQuery) {
      const result: ProviderResult = {
        metastoreGlobalId: metastore.globalMetastoreId,
        metastoreName: metastore.name,
        hasProvider: false,
        shares: [],
      };

      // Query providers with this metastore ID
      const providersResult = await callDatabricksApi<ProvidersListResponse>(
        workspaceUrl,
        accessToken,
        `/api/2.1/unity-catalog/providers?data_provider_global_metastore_id=${encodeURIComponent(metastore.globalMetastoreId)}`
      );

      if (!providersResult.success) {
        result.error = `Failed to query providers: ${providersResult.error}`;
        results.push(result);
        continue;
      }

      const providers = providersResult.data.providers || [];

      if (providers.length === 0) {
        // No provider found for this metastore
        results.push(result);
        continue;
      }

      // Found a provider
      const provider = providers[0]; // Take the first matching provider
      result.hasProvider = true;
      result.provider = provider;

      // Query shares for this provider
      const sharesResult = await callDatabricksApi<SharesListResponse>(
        workspaceUrl,
        accessToken,
        `/api/2.1/unity-catalog/providers/${encodeURIComponent(provider.name)}/shares`
      );

      if (sharesResult.success) {
        result.shares = sharesResult.data.shares || [];
      } else {
        result.error = `Provider found but failed to query shares: ${sharesResult.error}`;
      }

      results.push(result);
    }

    return NextResponse.json({
      workspaceUrl,
      organizationName: org.name,
      results,
    });
  } catch (error) {
    console.error("Error fetching providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch providers" },
      { status: 500 }
    );
  }
}

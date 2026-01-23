import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization, byodDatabricksSharingCatalogs, byodDatabricksMetastores, byodDatabricksWorkspaces } from "@/db/schema";
import { eq, and } from "drizzle-orm";
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
  created_at?: number;
  updated_at?: number;
}

interface CatalogValidationResult {
  catalogName: string;
  providerName: string;
  shareName: string;
  isValid: boolean;
  error?: string;
}

// Provider/Share types for filtering
interface Provider {
  name: string;
  data_provider_global_metastore_id?: string;
}

interface Share {
  name: string;
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
 * Gets a specific catalog to validate it exists
 */
async function getCatalog(
  workspaceUrl: string,
  accessToken: string,
  catalogName: string
): Promise<{ success: true; catalog: DatabricksCatalog } | { success: false; error: string; status?: number }> {
  const baseUrl = workspaceUrl.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/api/2.1/unity-catalog/catalogs/${encodeURIComponent(catalogName)}`;

  console.log(`[getCatalog] Fetching catalog: ${catalogName}`);
  console.log(`[getCatalog] Endpoint: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`[getCatalog] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[getCatalog] Error response: ${errorText}`);
      return {
        success: false,
        error: errorText,
        status: response.status,
      };
    }

    const catalog: DatabricksCatalog = await response.json();
    console.log(`[getCatalog] Success - Catalog details:`, JSON.stringify({
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
    console.log(`[getCatalog] Exception: ${String(error)}`);
    return {
      success: false,
      error: String(error),
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
): Promise<{ success: true; data: T } | { success: false; error: string }> {
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

interface CatalogsListResponse {
  catalogs?: DatabricksCatalog[];
  next_page_token?: string;
}

/**
 * Lists all catalogs from Databricks
 */
async function listAllCatalogs(
  workspaceUrl: string,
  accessToken: string
): Promise<DatabricksCatalog[]> {
  console.log(`[listAllCatalogs] Starting catalog discovery from ${workspaceUrl}`);
  const allCatalogs: DatabricksCatalog[] = [];
  let nextPageToken: string | undefined;
  let pageCount = 0;

  do {
    pageCount++;
    const endpoint = nextPageToken
      ? `/api/2.1/unity-catalog/catalogs?page_token=${encodeURIComponent(nextPageToken)}`
      : "/api/2.1/unity-catalog/catalogs";

    console.log(`[listAllCatalogs] Fetching page ${pageCount}: ${endpoint}`);

    const result = await callDatabricksApi<CatalogsListResponse>(workspaceUrl, accessToken, endpoint);

    if (!result.success) {
      console.error(`[listAllCatalogs] Failed to list catalogs on page ${pageCount}:`, result.error);
      break;
    }

    if (result.data.catalogs) {
      console.log(`[listAllCatalogs] Page ${pageCount} returned ${result.data.catalogs.length} catalogs`);
      // Log each catalog with relevant details
      for (const cat of result.data.catalogs) {
        console.log(`[listAllCatalogs] Catalog: ${cat.name} | type: ${cat.catalog_type} | provider: ${cat.provider_name} | share: ${cat.share_name} | metastore: ${cat.metastore_id}`);
      }
      allCatalogs.push(...result.data.catalogs);
    } else {
      console.log(`[listAllCatalogs] Page ${pageCount} returned no catalogs`);
    }

    nextPageToken = result.data.next_page_token;
  } while (nextPageToken);

  console.log(`[listAllCatalogs] Total catalogs discovered: ${allCatalogs.length}`);
  return allCatalogs;
}

/**
 * Gets valid provider/share combinations for an organization
 * Only returns providers/shares that are configured for Firefly
 */
async function getValidProviderShareCombinations(
  orgId: string,
  workspaceUrl: string,
  accessToken: string
): Promise<Set<string>> {
  console.log(`[getValidProviderShareCombinations] Starting for org ${orgId}`);
  const validCombinations = new Set<string>();

  // Get all metastores (manual and workspace-derived)
  const manualMetastores = await db
    .select()
    .from(byodDatabricksMetastores)
    .where(eq(byodDatabricksMetastores.organizationId, orgId));

  const workspaces = await db
    .select()
    .from(byodDatabricksWorkspaces)
    .where(eq(byodDatabricksWorkspaces.organizationId, orgId));

  console.log(`[getValidProviderShareCombinations] Found ${manualMetastores.length} manual metastores, ${workspaces.length} workspaces`);

  // Combine and deduplicate metastores by globalMetastoreId
  const seenMetastoreIds = new Set<string>();
  const metastores: Array<{ globalMetastoreId: string; name: string }> = [];

  for (const m of manualMetastores) {
    if (!seenMetastoreIds.has(m.globalMetastoreId)) {
      seenMetastoreIds.add(m.globalMetastoreId);
      metastores.push({
        globalMetastoreId: m.globalMetastoreId,
        name: m.name,
      });
    }
  }

  for (const w of workspaces) {
    if (w.deltaSharingGlobalMetastoreId && !seenMetastoreIds.has(w.deltaSharingGlobalMetastoreId)) {
      seenMetastoreIds.add(w.deltaSharingGlobalMetastoreId);
      metastores.push({
        globalMetastoreId: w.deltaSharingGlobalMetastoreId,
        name: w.deltaSharingOrganizationName || w.name || "Unnamed",
      });
    }
  }

  console.log(`[getValidProviderShareCombinations] Combined ${metastores.length} unique metastores:`, metastores.map(m => m.globalMetastoreId));

  // For each metastore, get providers and their shares
  for (const metastore of metastores) {
    console.log(`[getValidProviderShareCombinations] Querying providers for metastore ${metastore.globalMetastoreId}`);

    const providersResult = await callDatabricksApi<ProvidersListResponse>(
      workspaceUrl,
      accessToken,
      `/api/2.1/unity-catalog/providers?data_provider_global_metastore_id=${encodeURIComponent(metastore.globalMetastoreId)}`
    );

    if (!providersResult.success) {
      console.log(`[getValidProviderShareCombinations] Failed to get providers for metastore ${metastore.globalMetastoreId}: ${providersResult.error}`);
      continue;
    }

    const providers = providersResult.data.providers || [];
    console.log(`[getValidProviderShareCombinations] Found ${providers.length} providers for metastore ${metastore.globalMetastoreId}`);

    for (const provider of providers) {
      console.log(`[getValidProviderShareCombinations] Querying shares for provider ${provider.name}`);

      // Get shares for this provider
      const sharesResult = await callDatabricksApi<SharesListResponse>(
        workspaceUrl,
        accessToken,
        `/api/2.1/unity-catalog/providers/${encodeURIComponent(provider.name)}/shares`
      );

      if (sharesResult.success) {
        const shares = sharesResult.data.shares || [];
        console.log(`[getValidProviderShareCombinations] Found ${shares.length} shares for provider ${provider.name}:`, shares.map(s => s.name));
        for (const share of shares) {
          // Add the provider::share combination to valid set
          const combination = `${provider.name}::${share.name}`;
          console.log(`[getValidProviderShareCombinations] Adding valid combination: ${combination}`);
          validCombinations.add(combination);
        }
      } else {
        console.log(`[getValidProviderShareCombinations] Failed to get shares for provider ${provider.name}: ${sharesResult.error}`);
      }
    }
  }

  console.log(`[getValidProviderShareCombinations] Total valid combinations: ${validCombinations.size}`, Array.from(validCombinations));
  return validCombinations;
}

/**
 * GET /api/sso-spn/byod/databricks/catalogs
 *
 * Lists shared catalogs for the organization.
 * - Always validates cached catalogs exist in Databricks using GET /catalogs/{name}
 * - If cache is empty: automatically discovers catalogs from Databricks by listing all
 * - Removes stale entries from cache (catalogs that no longer exist or don't match)
 *
 * Query parameters:
 * - provider: Filter by provider name
 * - share: Filter by share name
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const filterProvider = searchParams.get("provider");
    const filterShare = searchParams.get("share");

    // Get the organization's workspace URL
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);

    if (!org || !org.workspaceUrl) {
      // Can't validate without workspace URL, return empty
      console.log(`[GET /catalogs] Organization ${orgId} has no workspaceUrl configured`);
      return NextResponse.json({
        catalogs: [],
        fromCache: true,
      });
    }

    console.log(`[GET /catalogs] ========================================`);
    console.log(`[GET /catalogs] Organization ID: ${orgId}`);
    console.log(`[GET /catalogs] Organization Name: ${org.name}`);
    console.log(`[GET /catalogs] Workspace URL: ${org.workspaceUrl}`);
    console.log(`[GET /catalogs] ========================================`);

    const workspaceUrl = org.workspaceUrl;

    // Get global admin token
    const tokenResult = await getGlobalAdminToken(workspaceUrl);
    if (!tokenResult.success) {
      // Can't validate without token, return empty with warning
      return NextResponse.json({
        catalogs: [],
        fromCache: true,
        warning: "Could not validate catalogs: " + tokenResult.error,
      });
    }

    const { accessToken } = tokenResult;

    // Get cached catalogs from database
    let cachedCatalogs = await db
      .select()
      .from(byodDatabricksSharingCatalogs)
      .where(
        filterProvider && filterShare
          ? and(
              eq(byodDatabricksSharingCatalogs.organizationId, orgId),
              eq(byodDatabricksSharingCatalogs.providerName, filterProvider),
              eq(byodDatabricksSharingCatalogs.shareName, filterShare)
            )
          : eq(byodDatabricksSharingCatalogs.organizationId, orgId)
      );

    console.log(`[GET /catalogs] Found ${cachedCatalogs.length} cached catalogs for org ${orgId}`);
    for (const cached of cachedCatalogs) {
      console.log(`[GET /catalogs] Cached: id=${cached.id} | catalog=${cached.catalogName} | provider=${cached.providerName} | share=${cached.shareName} | isValid=${cached.isValid}`);
    }

    // If cache is empty, discover catalogs from Databricks
    if (cachedCatalogs.length === 0) {
      console.log(`[GET /catalogs] Cache is empty, starting discovery...`);
      // Get valid provider/share combinations for this organization
      const validCombinations = await getValidProviderShareCombinations(orgId, workspaceUrl, accessToken);

      if (validCombinations.size === 0) {
        // No valid provider/share combinations
        return NextResponse.json({
          catalogs: [],
          fromCache: false,
        });
      }

      // List all catalogs from Databricks
      const allCatalogs = await listAllCatalogs(workspaceUrl, accessToken);

      // Filter to only delta sharing catalogs that match our provider/share combinations
      console.log(`[GET /catalogs] Filtering ${allCatalogs.length} catalogs to match valid provider/share combinations`);
      const matchingCatalogs = allCatalogs.filter((catalog) => {
        if (catalog.catalog_type !== "DELTASHARING_CATALOG") {
          console.log(`[GET /catalogs] Skipping ${catalog.name}: not a DELTASHARING_CATALOG (type=${catalog.catalog_type})`);
          return false;
        }
        if (!catalog.provider_name || !catalog.share_name) {
          console.log(`[GET /catalogs] Skipping ${catalog.name}: missing provider_name or share_name`);
          return false;
        }

        const combination = `${catalog.provider_name}::${catalog.share_name}`;
        const matches = validCombinations.has(combination);
        console.log(`[GET /catalogs] Catalog ${catalog.name}: combination=${combination}, matches=${matches}`);
        return matches;
      });

      console.log(`[GET /catalogs] Found ${matchingCatalogs.length} matching catalogs to cache`);

      // Insert discovered catalogs into cache
      for (const catalog of matchingCatalogs) {
        console.log(`[GET /catalogs] Caching catalog: ${catalog.name} (provider=${catalog.provider_name}, share=${catalog.share_name})`);
        const id = crypto.randomUUID();
        await db.insert(byodDatabricksSharingCatalogs).values({
          id,
          organizationId: orgId,
          providerName: catalog.provider_name!,
          shareName: catalog.share_name!,
          catalogName: catalog.name,
          catalogType: catalog.catalog_type,
          metastoreId: catalog.metastore_id,
          isValid: "valid",
          lastValidatedAt: new Date(),
        });
      }

      // Refetch cached data after discovery
      cachedCatalogs = await db
        .select()
        .from(byodDatabricksSharingCatalogs)
        .where(
          filterProvider && filterShare
            ? and(
                eq(byodDatabricksSharingCatalogs.organizationId, orgId),
                eq(byodDatabricksSharingCatalogs.providerName, filterProvider),
                eq(byodDatabricksSharingCatalogs.shareName, filterShare)
              )
            : eq(byodDatabricksSharingCatalogs.organizationId, orgId)
        );

      return NextResponse.json({
        catalogs: cachedCatalogs.filter((c) => c.isValid === "valid"),
        fromCache: false,
      });
    }

    // Cache has entries - validate each one exists in Databricks
    console.log(`[GET /catalogs] Cache has ${cachedCatalogs.length} entries, validating each...`);
    const validatedCatalogs: typeof cachedCatalogs = [];

    for (const cached of cachedCatalogs) {
      console.log(`[GET /catalogs] Validating cached catalog: ${cached.catalogName} (provider=${cached.providerName}, share=${cached.shareName})`);

      // Validate catalog still exists using GET /catalogs/{name}
      const catalogResult = await getCatalog(workspaceUrl, accessToken, cached.catalogName);

      if (!catalogResult.success) {
        // Catalog no longer exists - remove from cache
        console.log(`[GET /catalogs] VALIDATION FAILED - Catalog ${cached.catalogName} does not exist in Databricks. Removing from cache.`);
        await db
          .delete(byodDatabricksSharingCatalogs)
          .where(eq(byodDatabricksSharingCatalogs.id, cached.id));
        continue;
      }

      // Catalog exists - verify it's still a delta sharing catalog for this provider/share
      const catalog = catalogResult.catalog;
      const providerMatches = catalog.provider_name === cached.providerName;
      const shareMatches = catalog.share_name === cached.shareName;
      const isDeltaSharing = catalog.catalog_type === "DELTASHARING_CATALOG";

      console.log(`[GET /catalogs] Validation check for ${cached.catalogName}:`);
      console.log(`  - isDeltaSharing: ${isDeltaSharing} (type=${catalog.catalog_type})`);
      console.log(`  - providerMatches: ${providerMatches} (expected=${cached.providerName}, got=${catalog.provider_name})`);
      console.log(`  - shareMatches: ${shareMatches} (expected=${cached.shareName}, got=${catalog.share_name})`);

      if (providerMatches && shareMatches && isDeltaSharing) {
        // Valid - update cache with latest info
        console.log(`[GET /catalogs] VALIDATION PASSED - Catalog ${cached.catalogName} is valid`);
        await db
          .update(byodDatabricksSharingCatalogs)
          .set({
            isValid: "valid",
            catalogType: catalog.catalog_type,
            metastoreId: catalog.metastore_id,
            lastValidatedAt: new Date(),
          })
          .where(eq(byodDatabricksSharingCatalogs.id, cached.id));

        validatedCatalogs.push({
          ...cached,
          isValid: "valid",
          catalogType: catalog.catalog_type || cached.catalogType,
          metastoreId: catalog.metastore_id || cached.metastoreId,
        });
      } else {
        // Catalog exists but doesn't match expected provider/share - remove from cache
        console.log(`[GET /catalogs] VALIDATION FAILED - Catalog ${cached.catalogName} exists but doesn't match expected provider/share. Removing from cache.`);
        await db
          .delete(byodDatabricksSharingCatalogs)
          .where(eq(byodDatabricksSharingCatalogs.id, cached.id));
      }
    }

    console.log(`[GET /catalogs] Validation complete. ${validatedCatalogs.length} valid catalogs remaining.`);

    return NextResponse.json({
      catalogs: validatedCatalogs,
      fromCache: false,
    });
  } catch (error) {
    console.error("Error fetching shared catalogs:", error);
    return NextResponse.json(
      { error: "Failed to fetch shared catalogs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sso-spn/byod/databricks/catalogs/validate
 *
 * Validates that cached catalogs still exist and have correct provider/share mapping.
 *
 * Body:
 * - catalogIds: Array of catalog IDs to validate (optional, validates all if not provided)
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

    // Get body
    const body = await request.json().catch(() => ({}));
    const catalogIds: string[] | undefined = body.catalogIds;

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

    // Get global admin token
    const tokenResult = await getGlobalAdminToken(workspaceUrl);
    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error }, { status: 500 });
    }

    const { accessToken } = tokenResult;

    // Get catalogs to validate
    let catalogsToValidate = await db
      .select()
      .from(byodDatabricksSharingCatalogs)
      .where(eq(byodDatabricksSharingCatalogs.organizationId, orgId));

    if (catalogIds && catalogIds.length > 0) {
      catalogsToValidate = catalogsToValidate.filter((c) => catalogIds.includes(c.id));
    }

    const validationResults: CatalogValidationResult[] = [];

    // Validate each catalog
    for (const cached of catalogsToValidate) {
      const result: CatalogValidationResult = {
        catalogName: cached.catalogName,
        providerName: cached.providerName,
        shareName: cached.shareName,
        isValid: false,
      };

      // Try to get the catalog
      const catalogResult = await getCatalog(workspaceUrl, accessToken, cached.catalogName);

      if (!catalogResult.success) {
        // Catalog doesn't exist
        result.isValid = false;
        result.error = catalogResult.status === 404 ? "Catalog not found" : catalogResult.error;

        // Update cache
        await db
          .update(byodDatabricksSharingCatalogs)
          .set({
            isValid: "invalid",
            lastValidatedAt: new Date(),
          })
          .where(eq(byodDatabricksSharingCatalogs.id, cached.id));
      } else {
        // Catalog exists - verify provider and share match
        const catalog = catalogResult.catalog;
        const providerMatches = catalog.provider_name === cached.providerName;
        const shareMatches = catalog.share_name === cached.shareName;
        const isDeltaSharing = catalog.catalog_type === "DELTASHARING_CATALOG";

        if (providerMatches && shareMatches && isDeltaSharing) {
          result.isValid = true;

          // Update cache
          await db
            .update(byodDatabricksSharingCatalogs)
            .set({
              isValid: "valid",
              catalogType: catalog.catalog_type,
              metastoreId: catalog.metastore_id,
              lastValidatedAt: new Date(),
            })
            .where(eq(byodDatabricksSharingCatalogs.id, cached.id));
        } else {
          result.isValid = false;
          result.error = !isDeltaSharing
            ? "Catalog is not a delta sharing catalog"
            : !providerMatches
            ? `Provider mismatch: expected ${cached.providerName}, got ${catalog.provider_name}`
            : `Share mismatch: expected ${cached.shareName}, got ${catalog.share_name}`;

          // Update cache
          await db
            .update(byodDatabricksSharingCatalogs)
            .set({
              isValid: "invalid",
              lastValidatedAt: new Date(),
            })
            .where(eq(byodDatabricksSharingCatalogs.id, cached.id));
        }
      }

      validationResults.push(result);
    }

    // Remove invalid catalogs from cache
    const invalidCatalogs = validationResults.filter((r) => !r.isValid);
    for (const invalid of invalidCatalogs) {
      await db
        .delete(byodDatabricksSharingCatalogs)
        .where(
          and(
            eq(byodDatabricksSharingCatalogs.organizationId, orgId),
            eq(byodDatabricksSharingCatalogs.catalogName, invalid.catalogName),
            eq(byodDatabricksSharingCatalogs.providerName, invalid.providerName),
            eq(byodDatabricksSharingCatalogs.shareName, invalid.shareName)
          )
        );
    }

    return NextResponse.json({
      validated: validationResults.length,
      valid: validationResults.filter((r) => r.isValid).length,
      invalid: validationResults.filter((r) => !r.isValid).length,
      results: validationResults,
    });
  } catch (error) {
    console.error("Error validating catalogs:", error);
    return NextResponse.json(
      { error: "Failed to validate catalogs" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Asset types from the API response
interface ShareAssetTag {
  key: string;
  value: string;
}

interface SharedTable {
  id?: string;
  name: string;
  schema?: string;
  share?: string;
  share_id?: string;
  comment?: string;
  tags?: ShareAssetTag[];
}

interface SharedFunction {
  id?: string;
  name: string;
  schema?: string;
  share?: string;
  share_id?: string;
  comment?: string;
  data_type?: string;
  full_data_type?: string;
  tags?: ShareAssetTag[];
}

interface SharedVolume {
  id?: string;
  name: string;
  schema?: string;
  share?: string;
  share_id?: string;
  comment?: string;
  tags?: ShareAssetTag[];
}

interface SharedNotebook {
  id?: string;
  name: string;
  share?: string;
  share_id?: string;
  comment?: string;
  tags?: ShareAssetTag[];
}

interface ShareAssetsResponse {
  share?: {
    id?: string;
    name?: string;
  };
  tables?: SharedTable[];
  functions?: SharedFunction[];
  volumes?: SharedVolume[];
  notebooks?: SharedNotebook[];
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
 * GET /api/sso-spn/byod/databricks/providers/shares
 *
 * Gets the assets (tables, functions, volumes, notebooks) for a specific provider share.
 *
 * Query parameters:
 * - provider: The provider name
 * - share: The share name
 */
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const providerName = searchParams.get("provider");
    const shareName = searchParams.get("share");

    if (!providerName || !shareName) {
      return NextResponse.json(
        { error: "provider and share query parameters are required" },
        { status: 400 }
      );
    }

    // Get the active organization from session
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session?.activeOrganizationId) {
      return NextResponse.json({ error: "No active organization in session" }, { status: 401 });
    }

    const orgId = session.session.activeOrganizationId;

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

    // Build the API URL with max results parameters
    const baseUrl = workspaceUrl.replace(/\/+$/, "");
    const apiUrl = new URL(
      `${baseUrl}/api/2.1/data-sharing/providers/${encodeURIComponent(providerName)}/shares/${encodeURIComponent(shareName)}`
    );
    apiUrl.searchParams.set("table_max_results", "1000");
    apiUrl.searchParams.set("function_max_results", "1000");
    apiUrl.searchParams.set("volume_max_results", "1000");
    apiUrl.searchParams.set("notebook_max_results", "100");

    // Fetch share assets
    const response = await fetch(apiUrl.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch share assets: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data: ShareAssetsResponse = await response.json();

    // Transform the response to a simpler format for the UI
    const assets = {
      share: data.share,
      tables: (data.tables || []).map((t) => ({
        type: "table" as const,
        name: t.name,
        schema: t.schema,
        comment: t.comment,
        id: t.id,
      })),
      functions: (data.functions || []).map((f) => ({
        type: "function" as const,
        name: f.name,
        schema: f.schema,
        comment: f.comment,
        dataType: f.data_type,
        id: f.id,
      })),
      volumes: (data.volumes || []).map((v) => ({
        type: "volume" as const,
        name: v.name,
        schema: v.schema,
        comment: v.comment,
        id: v.id,
      })),
      notebooks: (data.notebooks || []).map((n) => ({
        type: "notebook" as const,
        name: n.name,
        comment: n.comment,
        id: n.id,
      })),
      summary: {
        tableCount: (data.tables || []).length,
        functionCount: (data.functions || []).length,
        volumeCount: (data.volumes || []).length,
        notebookCount: (data.notebooks || []).length,
        totalCount:
          (data.tables || []).length +
          (data.functions || []).length +
          (data.volumes || []).length +
          (data.notebooks || []).length,
      },
    };

    return NextResponse.json(assets);
  } catch (error) {
    console.error("Error fetching share assets:", error);
    return NextResponse.json(
      { error: "Failed to fetch share assets" },
      { status: 500 }
    );
  }
}

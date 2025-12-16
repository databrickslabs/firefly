import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Dashboard embedding configuration from environment variables
const EMBED_CONFIG = {
  instanceUrl: process.env.DATABRICKS_EMBED_INSTANCE_URL || "",
  workspaceId: process.env.DATABRICKS_EMBED_WORKSPACE_ID || "",
  dashboardId: process.env.DATABRICKS_EMBED_DASHBOARD_ID || "",
  servicePrincipalId: process.env.DATABRICKS_M2M_CLIENT_ID || "",
  servicePrincipalSecret: process.env.DATABRICKS_M2M_CLIENT_SECRET || "",
};

interface TokenInfoResponse {
  authorization_details: unknown[];
  [key: string]: unknown;
}

interface TokenResponse {
  access_token: string;
}

/**
 * Generates a scoped OAuth token for embedding a Databricks dashboard.
 *
 * The token generation follows these steps:
 * 1. Get an "all-apis" token using service principal credentials
 * 2. Call the tokeninfo endpoint to get scoping requirements
 * 3. Generate a downscoped token safe for browser use
 *
 * POST /api/databricks/dashboards/embed
 * Body: { externalViewerId: string, externalValue: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate configuration
    const missingConfig: string[] = [];
    if (!EMBED_CONFIG.instanceUrl) missingConfig.push("DATABRICKS_EMBED_INSTANCE_URL");
    if (!EMBED_CONFIG.workspaceId) missingConfig.push("DATABRICKS_EMBED_WORKSPACE_ID");
    if (!EMBED_CONFIG.dashboardId) missingConfig.push("DATABRICKS_EMBED_DASHBOARD_ID");
    if (!EMBED_CONFIG.servicePrincipalId) missingConfig.push("DATABRICKS_M2M_CLIENT_ID");
    if (!EMBED_CONFIG.servicePrincipalSecret) missingConfig.push("DATABRICKS_M2M_CLIENT_SECRET");

    if (missingConfig.length > 0) {
      return NextResponse.json(
        {
          error: "Dashboard embedding not configured",
          details: `Missing required environment variables: ${missingConfig.join(", ")}`,
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { externalViewerId, externalValue } = body;

    if (!externalViewerId || !externalValue) {
      return NextResponse.json(
        {
          error: "Missing required parameters",
          details: "externalViewerId and externalValue are required",
        },
        { status: 400 }
      );
    }

    // Create basic auth header for service principal
    const basicAuth = Buffer.from(
      `${EMBED_CONFIG.servicePrincipalId}:${EMBED_CONFIG.servicePrincipalSecret}`
    ).toString("base64");

    // Step 1: Get all-api token
    const oidcTokenResponse = await fetch(
      `${EMBED_CONFIG.instanceUrl}oidc/v1/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "all-apis",
        }),
      }
    );

    if (!oidcTokenResponse.ok) {
      const errorText = await oidcTokenResponse.text();
      console.error("Failed to get OIDC token:", errorText);
      return NextResponse.json(
        {
          error: "Failed to authenticate with Databricks",
          details: errorText,
        },
        { status: 500 }
      );
    }

    const oidcData = (await oidcTokenResponse.json()) as TokenResponse;
    const oidcToken = oidcData.access_token;

    // Step 2: Get token info for scoping
    const tokenInfoUrl = new URL(
      `${EMBED_CONFIG.instanceUrl}api/2.0/lakeview/dashboards/${EMBED_CONFIG.dashboardId}/published/tokeninfo`
    );
    tokenInfoUrl.searchParams.set("external_viewer_id", externalViewerId);
    tokenInfoUrl.searchParams.set("external_value", externalValue);

    const tokenInfoResponse = await fetch(tokenInfoUrl.toString(), {
      headers: {
        Authorization: `Bearer ${oidcToken}`,
      },
    });

    if (!tokenInfoResponse.ok) {
      const errorText = await tokenInfoResponse.text();
      console.error("Failed to get token info:", errorText);
      return NextResponse.json(
        {
          error: "Failed to get dashboard token info",
          details: errorText,
        },
        { status: 500 }
      );
    }

    const tokenInfo = (await tokenInfoResponse.json()) as TokenInfoResponse;

    // Step 3: Generate scoped token
    const { authorization_details, ...params } = tokenInfo;

    const scopedTokenResponse = await fetch(
      `${EMBED_CONFIG.instanceUrl}oidc/v1/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          ...Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)])
          ),
          authorization_details: JSON.stringify(authorization_details),
        }),
      }
    );

    if (!scopedTokenResponse.ok) {
      const errorText = await scopedTokenResponse.text();
      console.error("Failed to get scoped token:", errorText);
      return NextResponse.json(
        {
          error: "Failed to generate scoped token",
          details: errorText,
        },
        { status: 500 }
      );
    }

    const scopedData = (await scopedTokenResponse.json()) as TokenResponse;

    return NextResponse.json({
      token: scopedData.access_token,
      instanceUrl: EMBED_CONFIG.instanceUrl,
      workspaceId: EMBED_CONFIG.workspaceId,
      dashboardId: EMBED_CONFIG.dashboardId,
    });
  } catch (error) {
    console.error("Error generating embed token:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: String(error),
      },
      { status: 500 }
    );
  }
}

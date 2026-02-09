import { NextResponse } from "next/server";
import { db } from "@/db";
import { organization, userSpns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

interface SecretKey {
  key: string;
  last_updated_timestamp?: number;
}

interface SecretsListResponse {
  secrets?: SecretKey[];
}

interface SecretScope {
  name: string;
  backend_type: string;
}

interface ScopesListResponse {
  scopes?: SecretScope[];
}

/**
 * Gets an OAuth token using the global admin SPN credentials
 */
async function getGlobalAdminToken(
  workspaceUrl: string
): Promise<{ success: true; accessToken: string } | { success: false; error: string }> {
  const clientId = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID;
  const clientSecret = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      error:
        "Global admin SPN credentials not configured (FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID and FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET)",
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
 * Lists all secret scopes in the workspace
 */
async function listSecretScopes(
  workspaceUrl: string,
  accessToken: string
): Promise<{ success: true; scopes: SecretScope[] } | { success: false; error: string }> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/2.0/secrets/scopes/list`, {
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
        error: `Failed to list scopes: ${response.status} - ${errorText}`,
      };
    }

    const data: ScopesListResponse = await response.json();
    return {
      success: true,
      scopes: data.scopes || [],
    };
  } catch (error) {
    return {
      success: false,
      error: `Error listing scopes: ${String(error)}`,
    };
  }
}

/**
 * Lists secret keys in a scope
 */
async function listSecretKeys(
  workspaceUrl: string,
  accessToken: string,
  scopeName: string
): Promise<{ success: true; secrets: SecretKey[] } | { success: false; error: string }> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, "");
    const response = await fetch(
      `${baseUrl}/api/2.0/secrets/list?scope=${encodeURIComponent(scopeName)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      // If scope doesn't exist, return empty list
      if (response.status === 404 || errorText.includes("RESOURCE_DOES_NOT_EXIST")) {
        return {
          success: true,
          secrets: [],
        };
      }
      return {
        success: false,
        error: `Failed to list secrets: ${response.status} - ${errorText}`,
      };
    }

    const data: SecretsListResponse = await response.json();
    return {
      success: true,
      secrets: data.secrets || [],
    };
  } catch (error) {
    return {
      success: false,
      error: `Error listing secrets: ${String(error)}`,
    };
  }
}

export interface WorkspaceSecretsStatusResponse {
  configured: boolean;
  scopeName: string | null;
  scopeExists: boolean;
  secretKey: string | null;
  secretRegistered: boolean;
  lastUpdated: number | null;
  patSecretKey: string | null;
  patRegistered: boolean;
  patLastUpdated: number | null;
  workspaceUrl: string;
  error?: string;
}

/**
 * GET /api/sso-spn/workspace-secrets/status
 *
 * Checks the status of the user's SPN secret in the workspace.
 * Returns whether the scope exists and if the user's secret is registered.
 */
export async function GET() {
  try {
    const scopeName = process.env.FIREFLY_WORKSPACE_SPN_SECRET_SCOPE_NAME;

    const response: WorkspaceSecretsStatusResponse = {
      configured: !!scopeName,
      scopeName: scopeName || null,
      scopeExists: false,
      secretKey: null,
      secretRegistered: false,
      lastUpdated: null,
      patSecretKey: null,
      patRegistered: false,
      patLastUpdated: null,
      workspaceUrl: "",
    };

    if (!scopeName) {
      response.error = "FIREFLY_WORKSPACE_SPN_SECRET_SCOPE_NAME is not configured";
      return NextResponse.json({ data: response });
    }

    // Get the current session
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized - No active session" }, { status: 401 });
    }

    if (!session.session?.activeOrganizationId) {
      return NextResponse.json({ error: "No active organization in session" }, { status: 401 });
    }

    const userEmail = session.user.email;
    const activeOrgId = session.session.activeOrganizationId;

    // Fetch the organization
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, activeOrgId))
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

    // Get the SPN credentials for this user
    const [spnRecord] = await db
      .select()
      .from(userSpns)
      .where(eq(userSpns.email, userEmail))
      .limit(1);

    if (!spnRecord) {
      response.error = `No SPN credentials found for email: ${userEmail}`;
      return NextResponse.json({ data: response });
    }

    const workspaceUrl = org.workspaceUrl.replace(/\/$/, "");
    response.workspaceUrl = workspaceUrl;
    response.secretKey = spnRecord.clientId;

    // Get global admin token
    const tokenResult = await getGlobalAdminToken(workspaceUrl);
    if (!tokenResult.success) {
      response.error = tokenResult.error;
      return NextResponse.json({ data: response });
    }

    const { accessToken } = tokenResult;

    // Check if scope exists
    const scopesResult = await listSecretScopes(workspaceUrl, accessToken);
    if (!scopesResult.success) {
      response.error = scopesResult.error;
      return NextResponse.json({ data: response });
    }

    const scopeExists = scopesResult.scopes.some((s) => s.name === scopeName);
    response.scopeExists = scopeExists;

    if (!scopeExists) {
      return NextResponse.json({ data: response });
    }

    // Check if secret exists
    const secretsResult = await listSecretKeys(workspaceUrl, accessToken, scopeName);
    if (!secretsResult.success) {
      response.error = secretsResult.error;
      return NextResponse.json({ data: response });
    }

    const secret = secretsResult.secrets.find((s) => s.key === spnRecord.clientId);
    response.secretRegistered = !!secret;
    response.lastUpdated = secret?.last_updated_timestamp || null;

    // Check PAT secret status
    const patKey = `${spnRecord.clientId}-pat`;
    response.patSecretKey = patKey;
    const patSecret = secretsResult.secrets.find((s) => s.key === patKey);
    response.patRegistered = !!patSecret;
    response.patLastUpdated = patSecret?.last_updated_timestamp || null;

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error("Error checking workspace secrets status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

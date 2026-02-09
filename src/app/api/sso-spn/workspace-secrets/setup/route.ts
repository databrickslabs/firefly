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
 * Creates a new secret scope
 */
async function createSecretScope(
  workspaceUrl: string,
  accessToken: string,
  scopeName: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/2.0/secrets/scopes/create`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: scopeName,
        scope_backend_type: "DATABRICKS",
        initial_manage_principal: "users",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Check if scope already exists (not an error)
      if (response.status === 400 && errorText.includes("RESOURCE_ALREADY_EXISTS")) {
        return { success: true };
      }
      return {
        success: false,
        error: `Failed to create scope: ${response.status} - ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Error creating scope: ${String(error)}`,
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

/**
 * Puts a secret value
 */
async function putSecret(
  workspaceUrl: string,
  accessToken: string,
  scopeName: string,
  key: string,
  value: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/2.0/secrets/put`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: scopeName,
        key: key,
        string_value: value,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to put secret: ${response.status} - ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Error putting secret: ${String(error)}`,
    };
  }
}

// PAT token constants
const PAT_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days
const PAT_RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours before expiry
const PAT_COMMENT = "firefly-managed-pat";

/**
 * Gets an OAuth token using a user's SPN credentials
 */
async function getUserSpnToken(
  workspaceUrl: string,
  clientId: string,
  clientSecret: string
): Promise<{ success: true; accessToken: string } | { success: false; error: string }> {
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
        error: `User SPN token request failed: ${response.status} - ${errorText}`,
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
      error: `User SPN token request error: ${String(error)}`,
    };
  }
}

interface CreatePatResponse {
  token_info: {
    comment?: string;
    creation_time?: number;
    expiry_time?: number;
    token_id?: string;
  };
  token_value: string;
}

/**
 * Creates a PAT token for the user's SPN
 */
async function createUserPat(
  workspaceUrl: string,
  spnAccessToken: string,
  comment: string,
  lifetimeSeconds: number
): Promise<{ success: true; data: CreatePatResponse } | { success: false; error: string }> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/2.0/token/create`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${spnAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment,
        lifetime_seconds: lifetimeSeconds,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to create PAT: ${response.status} - ${errorText}`,
      };
    }

    const data: CreatePatResponse = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error creating PAT: ${String(error)}`,
    };
  }
}

export interface WorkspaceSecretsSetupResponse {
  scopeName: string;
  scopeExists: boolean;
  scopeCreated: boolean;
  secretKey: string;
  secretExists: boolean;
  secretUpdated: boolean;
  patSecretKey: string;
  patCreated: boolean;
  patRotated: boolean;
  workspaceUrl: string;
  error?: string;
}

/**
 * POST /api/sso-spn/workspace-secrets/setup
 *
 * Ensures the workspace has the SPN secret scope configured and the user's
 * SPN secret is stored in it. This should be called when a user logs in.
 *
 * Uses FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID and FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET
 * to authenticate as admin and manage secrets.
 *
 * The secret key is the user's SPN client_id and the value is the client_secret.
 */
export async function POST() {
  try {
    const scopeName = process.env.FIREFLY_WORKSPACE_SPN_SECRET_SCOPE_NAME;

    if (!scopeName) {
      return NextResponse.json(
        { error: "FIREFLY_WORKSPACE_SPN_SECRET_SCOPE_NAME is not configured" },
        { status: 500 }
      );
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
      return NextResponse.json(
        { error: `No SPN credentials found for email: ${userEmail}` },
        { status: 404 }
      );
    }

    const workspaceUrl = org.workspaceUrl.replace(/\/$/, "");
    const { clientId, clientSecret } = spnRecord;

    // Get global admin token
    const tokenResult = await getGlobalAdminToken(workspaceUrl);
    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error }, { status: 500 });
    }

    const { accessToken } = tokenResult;

    const patSecretKey = `${clientId}-pat`;
    const response: WorkspaceSecretsSetupResponse = {
      scopeName,
      scopeExists: false,
      scopeCreated: false,
      secretKey: clientId,
      secretExists: false,
      secretUpdated: false,
      patSecretKey,
      patCreated: false,
      patRotated: false,
      workspaceUrl,
    };

    // Step 1: Check if scope exists
    const scopesResult = await listSecretScopes(workspaceUrl, accessToken);
    if (!scopesResult.success) {
      return NextResponse.json(
        { error: scopesResult.error, response },
        { status: 500 }
      );
    }

    const scopeExists = scopesResult.scopes.some((s) => s.name === scopeName);
    response.scopeExists = scopeExists;

    // Step 2: Create scope if it doesn't exist
    if (!scopeExists) {
      const createResult = await createSecretScope(workspaceUrl, accessToken, scopeName);
      if (!createResult.success) {
        response.error = createResult.error;
        return NextResponse.json({ data: response }, { status: 500 });
      }
      response.scopeCreated = true;
      response.scopeExists = true;
    }

    // Step 3: Check if secret key exists
    const secretsResult = await listSecretKeys(workspaceUrl, accessToken, scopeName);
    if (!secretsResult.success) {
      response.error = secretsResult.error;
      return NextResponse.json({ data: response }, { status: 500 });
    }

    const secretExists = secretsResult.secrets.some((s) => s.key === clientId);
    response.secretExists = secretExists;

    // Step 4: Put the secret (create or update)
    // We always update to ensure the secret value is current
    const putResult = await putSecret(workspaceUrl, accessToken, scopeName, clientId, clientSecret);
    if (!putResult.success) {
      response.error = putResult.error;
      return NextResponse.json({ data: response }, { status: 500 });
    }
    response.secretUpdated = true;
    response.secretExists = true;

    // Step 5: Handle PAT token creation/rotation
    // Check if PAT exists and whether it needs rotation
    const patSecret = secretsResult.secrets.find((s) => s.key === patSecretKey);
    const now = Date.now();
    let needsPat = false;

    if (!patSecret) {
      // PAT doesn't exist yet
      needsPat = true;
    } else if (patSecret.last_updated_timestamp) {
      // Check if PAT will expire within 24 hours
      // last_updated_timestamp is in ms, PAT_LIFETIME_SECONDS is in seconds
      const estimatedExpiry = patSecret.last_updated_timestamp + PAT_LIFETIME_SECONDS * 1000;
      if (estimatedExpiry - now < PAT_RENEWAL_THRESHOLD_MS) {
        needsPat = true;
        response.patRotated = true;
      }
    }

    if (needsPat) {
      // Get user SPN OAuth token to create PAT
      const spnTokenResult = await getUserSpnToken(workspaceUrl, clientId, clientSecret);
      if (!spnTokenResult.success) {
        console.warn("Failed to get user SPN token for PAT creation:", spnTokenResult.error);
        response.error = `PAT setup failed: ${spnTokenResult.error}`;
        return NextResponse.json({ data: response });
      }

      // Create PAT
      const patResult = await createUserPat(
        workspaceUrl,
        spnTokenResult.accessToken,
        PAT_COMMENT,
        PAT_LIFETIME_SECONDS
      );
      if (!patResult.success) {
        console.warn("Failed to create PAT:", patResult.error);
        response.error = `PAT creation failed: ${patResult.error}`;
        return NextResponse.json({ data: response });
      }

      // Store PAT in secret scope
      const patPutResult = await putSecret(
        workspaceUrl,
        accessToken,
        scopeName,
        patSecretKey,
        patResult.data.token_value
      );
      if (!patPutResult.success) {
        console.warn("Failed to store PAT secret:", patPutResult.error);
        response.error = `PAT storage failed: ${patPutResult.error}`;
        return NextResponse.json({ data: response });
      }

      response.patCreated = true;
    }

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error("Error setting up workspace secrets:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

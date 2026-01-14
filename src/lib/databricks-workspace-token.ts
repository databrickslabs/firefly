import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization, account, userSpns } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { decodeJwt } from "jose";
import { revalidateTag } from "next/cache";

export interface DatabricksWorkspaceTokenInfo {
  accessToken: string;
  workspaceUrl: string;
  activeOrganizationId: string;
  userEmail: string;
}

export interface TokenError {
  error: string;
  status: number;
  details?: unknown;
}

/**
 * Checks if the user authenticated with the SPN provider
 */
async function isSpnAuthenticated(userId: string): Promise<boolean> {
  const accounts = await db
    .select()
    .from(account)
    .where(eq(account.userId, userId));

  return accounts.some(acc => acc.providerId === "databricks-spn-mapping");
}

/**
 * Gets a Databricks workspace token using SPN credentials
 * Uses the provided workspace URL from the organization configuration
 */
async function getSpnWorkspaceToken(
  userEmail: string,
  activeOrganizationId: string,
  workspaceUrl: string
): Promise<
  { success: true; data: DatabricksWorkspaceTokenInfo } | { success: false; error: TokenError }
> {
  // Look up the SPN credentials for this user's email
  const [spnRecord] = await db
    .select()
    .from(userSpns)
    .where(eq(userSpns.email, userEmail))
    .limit(1);

  if (!spnRecord) {
    return {
      success: false,
      error: {
        error: `No SPN credentials found for email: ${userEmail}`,
        status: 404,
        details: "Please contact your administrator to set up SPN credentials for your account.",
      },
    };
  }

  const { clientId, clientSecret } = spnRecord;

  // Normalize the URL - remove trailing slash if present
  const baseUrl = workspaceUrl.replace(/\/$/, '');

  // Workspace-level token endpoint
  const tokenUrl = `${baseUrl}/oidc/v1/token`;

  // Create Basic Auth header
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  console.log("Fetching SPN token from:", tokenUrl, "for user:", userEmail);

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "all-apis",
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Databricks SPN OAuth token request failed:", errorText);
    return {
      success: false,
      error: {
        error: "Failed to obtain Databricks OAuth token via SPN",
        status: tokenResponse.status,
        details: errorText,
      },
    };
  }

  const tokenData = await tokenResponse.json();

  return {
    success: true,
    data: {
      accessToken: tokenData.access_token,
      workspaceUrl: baseUrl,
      activeOrganizationId,
      userEmail,
    },
  };
}

/**
 * Gets Databricks workspace-level OAuth access token and workspace URL for the current session.
 * This is for workspace APIs only, not account-level APIs.
 * Returns either token info or error with status code.
 *
 * Automatically detects if the user authenticated with SPN provider and uses SPN credentials.
 *
 * @param orgIdOverride - Optional organization ID to use instead of session's activeOrganizationId
 */
export async function getDatabricksWorkspaceToken(orgIdOverride?: string): Promise<
  { success: true; data: DatabricksWorkspaceTokenInfo } | { success: false; error: TokenError }
> {
  try {
    // Get the session from Better Auth
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return {
        success: false,
        error: {
          error: "Unauthorized - No active session",
          status: 401,
        },
      };
    }

    // Use orgIdOverride if provided, otherwise use session's activeOrganizationId
    const targetOrgId = orgIdOverride || session.session.activeOrganizationId;

    // Get workspace URL from active organization
    if (!targetOrgId) {
      return {
        success: false,
        error: {
          error: "No active organization set in session",
          status: 400,
          details: "REQUIRE_ORG_SELECTION",
        },
      };
    }

    // Get the organization to fetch workspace URL
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, targetOrgId))
      .limit(1);

    if (!org) {
      return {
        success: false,
        error: {
          error: "Active organization not found in database",
          status: 404,
        },
      };
    }

    const workspaceUrl = org.workspaceUrl;

    if (!workspaceUrl) {
      return {
        success: false,
        error: {
          error: "No Databricks workspace URL configured for this organization",
          status: 400,
          details: {
            organizationId: org.id,
            organizationName: org.name,
          },
        },
      };
    }

    // Check if user authenticated with SPN provider
    const useSpn = await isSpnAuthenticated(session.user.id);

    if (useSpn) {
      console.log("User authenticated with SPN provider, using SPN credentials");
      return getSpnWorkspaceToken(
        session.user.email,
        targetOrgId,
        workspaceUrl
      );
    }

    // Use Better Auth's getAccessToken to retrieve the Databricks access token
    // This will automatically refresh the token if it's expired
    let tokenResponse;
    try {
      tokenResponse = await auth.api.getAccessToken({
        headers: await headers(),
        body: {
          providerId: `databricks-workspace-${targetOrgId}`,
        },
      });
    } catch (tokenError: unknown) {
      console.error("Error getting access token:", tokenError);

      // Type guard for error object
      const isTokenError = (error: unknown): error is { message?: string; status?: number; statusCode?: number } => {
        return typeof error === 'object' && error !== null;
      };

      // If we get a token error, invalidate the session and require re-authentication
      if (isTokenError(tokenError) && (
          tokenError?.message?.includes("Failed to get a valid access token") ||
          tokenError?.status === 400 ||
          tokenError?.statusCode === 400)) {
        console.log("Invalid token detected, revoking session and deleting account to force re-authentication");

        // Delete the account with invalid OAuth tokens first
        try {
          const providerId = `databricks-workspace-${targetOrgId}`;
          await db.delete(account).where(
            and(
              eq(account.userId, session.user.id),
              eq(account.providerId, providerId)
            )
          );
          console.log("Deleted account with invalid OAuth tokens for provider:", providerId);
        } catch (deleteError) {
          console.error("Error deleting account with invalid tokens:", deleteError);
        }

        // Revoke the current session
        try {
          await auth.api.revokeSession({
            headers: await headers(),
            body: {
              token: session.session.token,
            },
          });
          console.log("Session revoked successfully");

          // Invalidate all Databricks-related caches
          try {
            revalidateTag("databricks-clusters");
            revalidateTag("databricks-unity-catalog");
            revalidateTag("databricks-api");
            console.log("Cache tags invalidated after session revocation");
          } catch (cacheError) {
            console.error("Error invalidating cache tags:", cacheError);
          }
        } catch (revokeError) {
          console.error("Error revoking session:", revokeError);
        }

        return {
          success: false,
          error: {
            error: "Authentication session invalid. Please sign in again.",
            status: 401,
            details: "REQUIRE_REAUTHENTICATION",
          },
        };
      }

      throw tokenError;
    }

    if (!tokenResponse || !tokenResponse.accessToken) {
      return {
        success: false,
        error: {
          error: "No Databricks access token found. Please sign in with Databricks.",
          status: 401,
        },
      };
    }

    // Decode JWT to get user email
    const decoded = decodeJwt(tokenResponse.accessToken);
    const userEmail = (decoded.email as string) || (decoded.sub as string);

    return {
      success: true,
      data: {
        accessToken: tokenResponse.accessToken,
        workspaceUrl,
        activeOrganizationId: targetOrgId,
        userEmail,
      },
    };
  } catch (error) {
    console.error("Error getting Databricks token:", error);
    return {
      success: false,
      error: {
        error: "Internal server error",
        status: 500,
        details: String(error),
      },
    };
  }
}

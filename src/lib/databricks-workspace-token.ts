import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization, account, userSpns, guestUser, guestSpns, byodDatabricksSpns } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
  // Look up the SPN credentials for this user's email (case-insensitive: better-auth lowercases emails)
  const lowerEmail = userEmail.toLowerCase();
  const [spnRecord] = await db
    .select()
    .from(userSpns)
    .where(sql`lower(${userSpns.email}) = ${lowerEmail}`)
    .limit(1);

  let clientId: string;
  let clientSecret: string;

  if (spnRecord) {
    clientId = spnRecord.clientId;
    clientSecret = spnRecord.clientSecret;
  } else {
    // Fallback 1: look up via guestUser → guestSpns (case-insensitive)
    const [guest] = await db
      .select({ spnId: guestUser.spnId })
      .from(guestUser)
      .where(sql`lower(${guestUser.generatedEmail}) = ${lowerEmail}`)
      .limit(1);

    if (guest) {
      const [guestSpn] = await db
        .select()
        .from(guestSpns)
        .where(eq(guestSpns.id, guest.spnId))
        .limit(1);

      if (guestSpn) {
        console.log("Using guestSpns credentials for guest user:", userEmail);
        clientId = guestSpn.clientId;
        clientSecret = guestSpn.clientSecret;
      } else {
        return {
          success: false,
          error: {
            error: `Guest SPN not found for spnId: ${guest.spnId}`,
            status: 404,
            details: "The SPN associated with this guest user no longer exists.",
          },
        };
      }
    } else {
      // Fallback 2: check byodDatabricksSpns by org ID (for guests created before guestUser table)
      const [byodSpn] = await db
        .select()
        .from(byodDatabricksSpns)
        .where(eq(byodDatabricksSpns.organizationId, activeOrganizationId))
        .limit(1);

      if (byodSpn) {
        console.log("Using BYOD SPN credentials for org:", activeOrganizationId);
        clientId = byodSpn.clientId;
        clientSecret = byodSpn.clientSecret;
      } else {
        return {
          success: false,
          error: {
            error: `No SPN credentials found for email: ${userEmail}`,
            status: 404,
            details: "No SPN credentials found in userSpns, guestSpns, or byodDatabricksSpns.",
          },
        };
      }
    }
  }

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

    // Guest users authenticate via email/password, not OAuth — use SPN credentials
    if (session.user.role === 'guest') {
      console.log("Guest user detected, using SPN credentials");
      return getSpnWorkspaceToken(
        session.user.email,
        targetOrgId,
        workspaceUrl
      );
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

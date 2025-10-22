import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization, account } from "@/db/schema";
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
 * Gets Databricks workspace-level OAuth access token and workspace URL for the current session.
 * This is for workspace APIs only, not account-level APIs.
 * Returns either token info or error with status code.
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

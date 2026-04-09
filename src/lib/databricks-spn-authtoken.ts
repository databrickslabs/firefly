import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { userSpns, byodDatabricksSpns, guestUser, guestSpns } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export interface DatabricksSpnTokenInfo {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  userEmail: string;
  clientId: string;
}

export interface SpnTokenError {
  error: string;
  status: number;
  details?: unknown;
}

/**
 * Gets a Databricks OAuth token using the SPN credentials mapped to the current user's email.
 *
 * For account-level tokens (accounts.cloud.databricks.com):
 *   - URL format: https://accounts.cloud.databricks.com/oidc/accounts/<account-id>/v1/token
 *   - Uses Basic Auth with client_id:client_secret
 *
 * For workspace-level tokens:
 *   - URL format: https://<workspace-instance>/oidc/v1/token
 *   - Uses Basic Auth with client_id:client_secret
 *
 * @param databricksUrl - The Databricks URL (workspace URL, e.g., https://dbc-xxx.cloud.databricks.com)
 * @param accountId - The Databricks account ID (required for account-level tokens)
 * @param userEmailOverride - Optional user email to skip session lookup (for performance when caller already has session)
 * @param organizationId - Optional org ID to enable BYOD SPN fallback when no userSpns entry exists
 * @returns Either token info or error with status code
 */
export async function getDatabricksSpnToken(
  databricksUrl: string,
  accountId?: string,
  userEmailOverride?: string,
  organizationId?: string
): Promise<
  { success: true; data: DatabricksSpnTokenInfo } | { success: false; error: SpnTokenError }
> {
  try {
    let userEmail: string;

    if (userEmailOverride) {
      // Use the provided email, skip session lookup
      userEmail = userEmailOverride;
    } else {
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

      if (!session.user.email) {
        return {
          success: false,
          error: {
            error: "No email found in session",
            status: 400,
          },
        };
      }

      userEmail = session.user.email;
    }

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
      // Fallback 1: check guestUser → guestSpns (case-insensitive)
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
      } else if (organizationId) {
        // Fallback 2: check BYOD SPN entries for the org
        const [byodSpn] = await db
          .select()
          .from(byodDatabricksSpns)
          .where(eq(byodDatabricksSpns.organizationId, organizationId))
          .limit(1);

        if (!byodSpn) {
          return {
            success: false,
            error: {
              error: `No SPN credentials found for email: ${userEmail}`,
              status: 404,
              details: "Please contact your administrator to set up SPN credentials for your account.",
            },
          };
        }

        clientId = byodSpn.clientId;
        clientSecret = byodSpn.clientSecret;
      } else {
        return {
          success: false,
          error: {
            error: `No SPN credentials found for email: ${userEmail}`,
            status: 404,
            details: "Please contact your administrator to set up SPN credentials for your account.",
          },
        };
      }
    }

    // Normalize the URL - remove trailing slash if present
    const baseUrl = databricksUrl.replace(/\/$/, '');

    // Determine the token endpoint URL based on whether this is account-level or workspace-level
    let tokenUrl: string;
    const isAccountsUrl = baseUrl.includes('accounts.cloud.databricks.com') ||
                          baseUrl.includes('accounts.databricks.com');

    if (isAccountsUrl && accountId) {
      // Account-level token endpoint
      // Format: https://accounts.cloud.databricks.com/oidc/accounts/<account-id>/v1/token
      tokenUrl = `${baseUrl}/oidc/accounts/${accountId}/v1/token`;
    } else if (isAccountsUrl && !accountId) {
      return {
        success: false,
        error: {
          error: "Account ID is required for account-level tokens",
          status: 400,
          details: "Please provide an account ID when using accounts.cloud.databricks.com",
        },
      };
    } else {
      // Workspace-level token endpoint
      // Format: https://<workspace-instance>/oidc/v1/token
      tokenUrl = `${baseUrl}/oidc/v1/token`;
    }

    // Create Basic Auth header
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

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
      console.error("Databricks OAuth token request failed:", errorText);
      return {
        success: false,
        error: {
          error: "Failed to obtain Databricks OAuth token",
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
        tokenType: tokenData.token_type || "Bearer",
        expiresIn: tokenData.expires_in,
        userEmail,
        clientId,
      },
    };
  } catch (error) {
    console.error("Error getting Databricks SPN token:", error);
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

import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { userSpns } from "@/db/schema";
import { eq } from "drizzle-orm";

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
 * @returns Either token info or error with status code
 */
export async function getDatabricksSpnToken(
  databricksUrl: string,
  accountId?: string,
  userEmailOverride?: string
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

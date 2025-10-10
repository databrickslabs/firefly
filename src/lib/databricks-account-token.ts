import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { decodeJwt } from "jose";

export interface DatabricksAccountTokenInfo {
  accessToken: string;
  accountId: string;
  userEmail: string;
}

export interface TokenError {
  error: string;
  status: number;
  details?: unknown;
}

/**
 * Gets Databricks account-level OAuth access token for the current session.
 * This is for account-level APIs only (e.g., listing workspaces, managing users at account level).
 * Returns either token info or error with status code.
 */
export async function getDatabricksAccountToken(): Promise<
  { success: true; data: DatabricksAccountTokenInfo } | { success: false; error: TokenError }
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

    // Use Better Auth's getAccessToken to retrieve the Databricks account-level access token
    // This will automatically refresh the token if it's expired
    const tokenResponse = await auth.api.getAccessToken({
      headers: await headers(),
      body: {
        providerId: "databricks-account",
      },
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      return {
        success: false,
        error: {
          error: "No Databricks account access token found. Please sign in with Databricks at account level.",
          status: 401,
        },
      };
    }

    // Get account ID from environment
    const accountId = process.env.DATABRICKS_ACCOUNT_ID;

    if (!accountId) {
      return {
        success: false,
        error: {
          error: "DATABRICKS_ACCOUNT_ID not configured in environment",
          status: 500,
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
        accountId,
        userEmail,
      },
    };
  } catch (error) {
    console.error("Error getting Databricks account token:", error);
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

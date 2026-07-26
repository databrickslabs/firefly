import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { account } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface DatabricksApiOptions {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  queryParams?: Record<string, string>;
  requireReauth?: boolean;
}

export interface DatabricksApiResult<T = unknown> {
  success: true;
  data: T;
  response: Response;
}

export interface DatabricksApiError {
  success: false;
  error: string;
  details?: unknown;
  status: number;
  requireReauth?: boolean;
}

/**
 * Checks if a Databricks API response indicates an expired OAuth token
 * Common patterns:
 * - 400 Bad Request (malformed token)
 * - 401 Unauthorized (expired/invalid token)
 * - 403 Forbidden with specific error messages
 */
function isExpiredTokenError(status: number, errorBody?: string): boolean {
  // 400 or 401 status codes often indicate token issues
  if (status === 400 || status === 401) {
    return true;
  }

  // Check for specific error messages that indicate token expiration
  if (errorBody) {
    const lowerBody = errorBody.toLowerCase();
    return (
      lowerBody.includes("token") &&
      (lowerBody.includes("expired") ||
        lowerBody.includes("invalid") ||
        lowerBody.includes("unauthorized") ||
        lowerBody.includes("authentication"))
    );
  }

  return false;
}

/**
 * Revokes the current session to trigger re-authentication and invalidates all caches
 */
async function revokeSession(sessionToken: string, userId: string, activeOrganizationId: string): Promise<void> {
  try {
    // Delete the account with invalid OAuth tokens first
    try {
      const providerId = `databricks-workspace-${activeOrganizationId}`;
      await db.delete(account).where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, providerId)
        )
      );
      console.log("Deleted account with invalid OAuth tokens for provider:", providerId);
    } catch (deleteError) {
      console.error("Error deleting account with invalid tokens:", deleteError);
    }

    const auth = await getAuthInstance();
    await auth.api.revokeSession({
      headers: await headers(),
      body: {
        token: sessionToken,
      },
    });
    console.log("Session revoked successfully due to expired Databricks token");

    // Invalidate all Databricks-related caches
    // This ensures that any cached API responses are cleared when the session is revoked
    try {
      revalidateTag("databricks-clusters");
      revalidateTag("databricks-unity-catalog");
      revalidateTag("databricks-api");
      console.log("Cache tags invalidated after session revocation");
    } catch (cacheError) {
      console.error("Error invalidating cache tags:", cacheError);
    }
  } catch (error) {
    console.error("Error revoking session:", error);
    // Don't throw - we still want to return the re-auth error to the client
  }
}

/**
 * Wrapper for calling Databricks APIs with automatic OAuth token validation
 * and session revocation on expired tokens.
 *
 * Usage:
 * ```typescript
 * const result = await callDatabricksApi({
 *   endpoint: "/api/2.0/sql/warehouses",
 *   method: "GET"
 * });
 *
 * if (!result.success) {
 *   return NextResponse.json(
 *     { error: result.error, details: result.details, requireReauth: result.requireReauth },
 *     { status: result.status }
 *   );
 * }
 *
 * return NextResponse.json(result.data);
 * ```
 */
export async function callDatabricksApi<T = unknown>(
  options: DatabricksApiOptions
): Promise<DatabricksApiResult<T> | DatabricksApiError> {
  const { endpoint, method = "GET", body, queryParams } = options;

  try {
    // Get the Databricks workspace token
    const tokenResult = await getDatabricksWorkspaceToken();

    if (!tokenResult.success) {
      // Pass through token acquisition errors (including REQUIRE_REAUTHENTICATION)
      return {
        success: false,
        error: tokenResult.error.error,
        details: tokenResult.error.details,
        status: tokenResult.error.status,
        requireReauth: tokenResult.error.details === "REQUIRE_REAUTHENTICATION",
      };
    }

    const { accessToken, workspaceUrl } = tokenResult.data;

    // Construct the full API URL with query parameters
    let apiUrl = `${workspaceUrl}${endpoint}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const urlParams = new URLSearchParams(queryParams);
      apiUrl = `${apiUrl}?${urlParams}`;
    }

    // Log request details with token information
    const maskedToken = accessToken.length > 20
      ? `${accessToken.substring(0, 8)}...${accessToken.substring(accessToken.length - 8)}`
      : '***masked***';

    console.log('Databricks API Request:', {
      endpoint,
      method,
      url: apiUrl,
      hasBody: !!body,
      tokenPreview: maskedToken,
      tokenLength: accessToken.length,
    });

    // Log full token only if DEBUG_TOKENS environment variable is set (for debugging only)
    if (process.env.DEBUG_TOKENS === 'true') {
      console.warn('⚠️  DEBUG MODE - Full Token:', accessToken);
      console.warn('⚠️  DO NOT USE IN PRODUCTION - This exposes sensitive credentials');
    }

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOptions.body = JSON.stringify(body);
    }

    // Call the Databricks API
    const response = await fetch(apiUrl, fetchOptions);

    // If response is OK, return the data
    if (response.ok) {
      const data = await response.json();
      console.log('Databricks API Success:', {
        endpoint,
        method,
        status: response.status,
      });
      return {
        success: true,
        data: data as T,
        response,
      };
    }

    // Handle error responses
    const errorText = await response.text();
    const status = response.status;

    // Log detailed error information
    console.error('Databricks API Error:', {
      endpoint,
      method,
      status,
      statusText: response.statusText,
      errorBody: errorText,
      url: apiUrl,
    });

    // Try to parse error as JSON for better readability
    try {
      const errorJson = JSON.parse(errorText);
      console.error('Parsed error response:', JSON.stringify(errorJson, null, 2));
    } catch {
      // Not JSON, already logged as text
    }

    // Check if this is an expired token error
    if (isExpiredTokenError(status, errorText)) {
      console.log(
        `Databricks API returned ${status}, likely expired OAuth token. Revoking session.`
      );

      // Get session to revoke it
      const auth = await getAuthInstance();
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      if (session && session.session.activeOrganizationId) {
        // Don't revoke session for guest users — they use SPN credentials, not OAuth tokens
        if (session.user.role !== 'guest') {
          await revokeSession(session.session.token, session.user.id, session.session.activeOrganizationId);
        } else {
          console.log("Guest user - skipping session revocation on SPN token error");
        }
      }

      return {
        success: false,
        error: session?.user?.role === 'guest'
          ? "Databricks workspace access failed. Please contact your administrator."
          : "Databricks authentication expired. Please sign in again.",
        details: session?.user?.role === 'guest' ? "SPN_TOKEN_ERROR" : "REQUIRE_REAUTHENTICATION",
        status: 401,
        requireReauth: session?.user?.role !== 'guest',
      };
    }

    // See databricks-spn-api-wrapper.ts: a workspace IP access list rejects the
    // deployment's egress with a bare 403, which surfaces as "Databricks API
    // error: Forbidden" and reads like an application bug. The explanation is in
    // X-Databricks-Reason-Phrase; name the network policy so nobody debugs our
    // code for an enterprise control.
    const reason = response.headers.get("x-databricks-reason-phrase") || "";
    const blockedIp = /Source IP address: ([0-9a-fA-F:.]+) is blocked/.exec(reason)?.[1];
    if (blockedIp) {
      return {
        success: false,
        error:
          `Blocked by your Databricks workspace network policy, not by this app. ` +
          `The workspace's IP access list does not include this deployment's ` +
          `outbound address (${blockedIp}). Ask a workspace admin to allow it, ` +
          `or host the app inside an already-permitted network.`,
        details: reason || errorText,
        status,
        requireReauth: false,
      };
    }

    // Return other API errors as-is
    return {
      success: false,
      error: `Databricks API error: ${response.statusText}${reason ? ` — ${reason}` : ""}`,
      details: errorText,
      status,
      requireReauth: false,
    };
  } catch (error) {
    console.error("Error calling Databricks API:", error);
    return {
      success: false,
      error: "Internal server error",
      details: String(error),
      status: 500,
      requireReauth: false,
    };
  }
}

/**
 * Helper function to create a standardized error response for API routes
 */
export function createErrorResponse(error: DatabricksApiError): NextResponse {
  return NextResponse.json(
    {
      error: error.error,
      details: error.details,
      requireReauth: error.requireReauth,
    },
    { status: error.status }
  );
}

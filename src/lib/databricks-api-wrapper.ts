import { NextResponse } from "next/server";
import { getDatabricksWorkspaceToken } from "@/lib/databricks-workspace-token";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { revalidateTag } from "next/cache";

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
async function revokeSession(sessionToken: string): Promise<void> {
  try {
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
      return {
        success: true,
        data: data as T,
        response,
      };
    }

    // Handle error responses
    const errorText = await response.text();
    const status = response.status;

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

      if (session) {
        await revokeSession(session.session.token);
      }

      return {
        success: false,
        error: "Databricks authentication expired. Please sign in again.",
        details: "REQUIRE_REAUTHENTICATION",
        status: 401,
        requireReauth: true,
      };
    }

    // Return other API errors as-is
    return {
      success: false,
      error: `Databricks API error: ${response.statusText}`,
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

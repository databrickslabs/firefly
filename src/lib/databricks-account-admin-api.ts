import { NextResponse } from "next/server";

// ============================================================================
// Types
// ============================================================================

export interface AccountAdminApiOptions {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  queryParams?: Record<string, string>;
}

export interface AccountAdminApiResult<T = unknown> {
  success: true;
  data: T;
}

export interface AccountAdminApiError {
  success: false;
  error: string;
  details?: unknown;
  status: number;
}

// ============================================================================
// Token Management
// ============================================================================

/**
 * Gets an OAuth token at the Databricks account level using the global admin SPN credentials.
 *
 * Token endpoint: {accountsUrl}/oidc/accounts/{accountId}/v1/token
 * Uses Basic Auth with client_id:client_secret
 * Body: grant_type=client_credentials&scope=all-apis
 */
export async function getGlobalAdminAccountToken(): Promise<
  { success: true; accessToken: string } | { success: false; error: string }
> {
  const clientId = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID;
  const clientSecret = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET;
  const accountId = process.env.DATABRICKS_ACCOUNT_ID;
  const accountsUrl = (
    process.env.SPN_AUTH_DATABRICKS_ACCOUNTS_URL ||
    "https://accounts.cloud.databricks.com"
  ).replace(/\/+$/, "");

  if (!clientId || !clientSecret) {
    return {
      success: false,
      error:
        "Global admin SPN credentials not configured (FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID and FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET)",
    };
  }

  if (!accountId) {
    return {
      success: false,
      error: "DATABRICKS_ACCOUNT_ID environment variable is not configured",
    };
  }

  try {
    const tokenUrl = `${accountsUrl}/oidc/accounts/${accountId}/v1/token`;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );

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
        error: `Account token request failed: ${response.status} - ${errorText}`,
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
      error: `Account token request error: ${String(error)}`,
    };
  }
}

// ============================================================================
// Account-Level API Wrapper
// ============================================================================

/**
 * Wrapper for calling Databricks account-level APIs with the global admin SPN.
 *
 * Constructs URLs as: {accountsUrl}/api/2.0/accounts/{accountId}{endpoint}
 *
 * Usage:
 * ```typescript
 * const result = await callDatabricksAccountAdminApi({
 *   endpoint: "/scim/v2/ServicePrincipals",
 *   method: "GET"
 * });
 *
 * if (!result.success) {
 *   return createAccountAdminErrorResponse(result);
 * }
 *
 * return NextResponse.json(result.data);
 * ```
 */
export async function callDatabricksAccountAdminApi<T = unknown>(
  options: AccountAdminApiOptions
): Promise<AccountAdminApiResult<T> | AccountAdminApiError> {
  const { endpoint, method = "GET", body, queryParams } = options;

  const accountId = process.env.DATABRICKS_ACCOUNT_ID;
  const accountsUrl = (
    process.env.SPN_AUTH_DATABRICKS_ACCOUNTS_URL ||
    "https://accounts.cloud.databricks.com"
  ).replace(/\/+$/, "");

  if (!accountId) {
    return {
      success: false,
      error: "DATABRICKS_ACCOUNT_ID environment variable is not configured",
      status: 500,
    };
  }

  const tokenResult = await getGlobalAdminAccountToken();
  if (!tokenResult.success) {
    return {
      success: false,
      error: tokenResult.error,
      status: 500,
    };
  }

  const { accessToken } = tokenResult;

  try {
    let apiUrl = `${accountsUrl}/api/2.0/accounts/${accountId}${endpoint}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const urlParams = new URLSearchParams(queryParams);
      apiUrl = `${apiUrl}?${urlParams}`;
    }

    const maskedToken =
      accessToken.length > 20
        ? `${accessToken.substring(0, 8)}...${accessToken.substring(accessToken.length - 8)}`
        : "***masked***";

    console.log("Databricks Account Admin API Request:", {
      endpoint,
      method,
      url: apiUrl,
      hasBody: !!body,
      tokenPreview: maskedToken,
    });

    const fetchOptions: RequestInit = {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(apiUrl, fetchOptions);

    if (response.ok) {
      const data = await response.json();
      console.log("Databricks Account Admin API Success:", {
        endpoint,
        method,
        status: response.status,
      });
      return {
        success: true,
        data: data as T,
      };
    }

    const errorText = await response.text();
    console.error("Databricks Account Admin API Error:", {
      endpoint,
      method,
      status: response.status,
      statusText: response.statusText,
      errorBody: errorText,
      url: apiUrl,
    });

    return {
      success: false,
      error: `Databricks Account API error: ${response.statusText}`,
      details: errorText,
      status: response.status,
    };
  } catch (error) {
    console.error("Error calling Databricks Account Admin API:", error);
    return {
      success: false,
      error: "Internal server error",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Helper function to create a standardized error response for API routes
 */
export function createAccountAdminErrorResponse(
  error: AccountAdminApiError
): NextResponse {
  return NextResponse.json(
    {
      error: error.error,
      details: error.details,
    },
    { status: error.status }
  );
}

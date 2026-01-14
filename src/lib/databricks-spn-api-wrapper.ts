import { NextResponse } from "next/server";
import { getDatabricksSpnToken } from "@/lib/databricks-spn-authtoken";

// Databricks workspace URL for SPN token generation (from environment variables)
const DATABRICKS_WORKSPACE_URL = process.env.SPN_AUTH_DATABRICKS_WORKSPACE_URL || "";

export interface DatabricksSpnApiOptions {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  queryParams?: Record<string, string>;
}

export interface DatabricksSpnApiResult<T = unknown> {
  success: true;
  data: T;
  response: Response;
}

export interface DatabricksSpnApiError {
  success: false;
  error: string;
  details?: unknown;
  status: number;
}

/**
 * Wrapper for calling Databricks APIs with SPN (Service Principal) authentication.
 * This uses the SPN credentials mapped to the current user's email.
 *
 * Usage:
 * ```typescript
 * const result = await callDatabricksSpnApi({
 *   endpoint: "/api/2.0/sql/warehouses",
 *   method: "GET"
 * });
 *
 * if (!result.success) {
 *   return NextResponse.json(
 *     { error: result.error, details: result.details },
 *     { status: result.status }
 *   );
 * }
 *
 * return NextResponse.json(result.data);
 * ```
 */
export async function callDatabricksSpnApi<T = unknown>(
  options: DatabricksSpnApiOptions
): Promise<DatabricksSpnApiResult<T> | DatabricksSpnApiError> {
  const { endpoint, method = "GET", body, queryParams } = options;

  try {
    // Get the Databricks SPN token
    const tokenResult = await getDatabricksSpnToken(DATABRICKS_WORKSPACE_URL);

    if (!tokenResult.success) {
      return {
        success: false,
        error: tokenResult.error.error,
        details: tokenResult.error.details,
        status: tokenResult.error.status,
      };
    }

    const { accessToken } = tokenResult.data;
    const workspaceUrl = DATABRICKS_WORKSPACE_URL.replace(/\/$/, '');

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

    console.log('Databricks SPN API Request:', {
      endpoint,
      method,
      url: apiUrl,
      hasBody: !!body,
      tokenPreview: maskedToken,
      tokenLength: accessToken.length,
    });

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
      console.log('Databricks SPN API Success:', {
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
    console.error('Databricks SPN API Error:', {
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

    // Return API errors as-is
    return {
      success: false,
      error: `Databricks API error: ${response.statusText}`,
      details: errorText,
      status,
    };
  } catch (error) {
    console.error("Error calling Databricks SPN API:", error);
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
export function createSpnErrorResponse(error: DatabricksSpnApiError): NextResponse {
  return NextResponse.json(
    {
      error: error.error,
      details: error.details,
    },
    { status: error.status }
  );
}

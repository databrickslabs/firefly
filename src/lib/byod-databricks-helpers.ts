/**
 * BYOD Databricks Helper Functions
 *
 * Provides validation and API helper functions for BYOD (Bring Your Own Data)
 * Databricks workspace configurations.
 */

export interface ByodValidationCheck {
  name: string;
  status: "pending" | "success" | "error";
  message?: string;
  data?: unknown;
}

export interface ByodWorkspaceValidationResult {
  workspaceAccess: ByodValidationCheck;
  metastoreId: ByodValidationCheck;
  externalSharingEnabled: ByodValidationCheck;
  // Extracted data for updating the workspace record
  deltaSharingGlobalMetastoreId?: string;
  deltaSharingOrganizationName?: string;
  deltaSharingScope?: string;
}

export interface MetastoreSummary {
  metastore_id?: string;
  name?: string;
  global_metastore_id?: string;
  delta_sharing_scope?: string;
  delta_sharing_recipient_token_lifetime_in_seconds?: number;
  delta_sharing_organization_name?: string;
  storage_root?: string;
  storage_root_credential_id?: string;
  storage_root_credential_name?: string;
  default_data_access_config_id?: string;
  privilege_model_version?: string;
  region?: string;
  cloud?: string;
  owner?: string;
  created_at?: number;
  created_by?: string;
  updated_at?: number;
  updated_by?: string;
  external_access_enabled?: boolean;
}

export interface ScimMeResponse {
  id?: string;
  userName?: string;
  displayName?: string;
  active?: boolean;
  emails?: Array<{ value: string; primary?: boolean }>;
  groups?: Array<{ value: string; display?: string }>;
}

/**
 * Gets a Databricks OAuth token using the provided SPN credentials directly.
 * This bypasses the user-email mapping and uses credentials directly.
 */
export async function getByodSpnToken(
  workspaceUrl: string,
  clientId: string,
  clientSecret: string
): Promise<{ success: true; accessToken: string } | { success: false; error: string }> {
  try {
    // Normalize the URL - remove trailing slash
    const baseUrl = workspaceUrl.replace(/\/+$/, "");

    // Workspace-level token endpoint
    const tokenUrl = `${baseUrl}/oidc/v1/token`;

    // Create Basic Auth header
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenResponse = await fetch(tokenUrl, {
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

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("BYOD OAuth token request failed:", errorText);
      return {
        success: false,
        error: `Authentication failed: ${tokenResponse.status} - ${errorText}`,
      };
    }

    const tokenData = await tokenResponse.json();

    return {
      success: true,
      accessToken: tokenData.access_token,
    };
  } catch (error) {
    console.error("Error getting BYOD SPN token:", error);
    return {
      success: false,
      error: `Token request failed: ${String(error)}`,
    };
  }
}

/**
 * Calls a Databricks API endpoint using the provided token.
 */
async function callByodApi<T>(
  workspaceUrl: string,
  accessToken: string,
  endpoint: string
): Promise<{ success: true; data: T } | { success: false; error: string; status?: number }> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, "");
    const apiUrl = `${baseUrl}${endpoint}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API error ${response.status}: ${errorText}`,
        status: response.status,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    return {
      success: false,
      error: `Request failed: ${String(error)}`,
    };
  }
}

/**
 * Validates workspace access by calling the SCIM /Me endpoint.
 */
export async function validateWorkspaceAccess(
  workspaceUrl: string,
  accessToken: string
): Promise<ByodValidationCheck> {
  const result = await callByodApi<ScimMeResponse>(
    workspaceUrl,
    accessToken,
    "/api/2.0/preview/scim/v2/Me"
  );

  if (!result.success) {
    return {
      name: "Workspace Access",
      status: "error",
      message: result.error,
    };
  }

  return {
    name: "Workspace Access",
    status: "success",
    message: `Authenticated as: ${result.data.displayName || result.data.userName || "Unknown"}`,
    data: result.data,
  };
}

/**
 * Gets the metastore summary and extracts delta sharing information.
 */
export async function getMetastoreSummary(
  workspaceUrl: string,
  accessToken: string
): Promise<{
  metastoreCheck: ByodValidationCheck;
  externalSharingCheck: ByodValidationCheck;
  metastoreData?: MetastoreSummary;
}> {
  const result = await callByodApi<MetastoreSummary>(
    workspaceUrl,
    accessToken,
    "/api/2.1/unity-catalog/metastore_summary"
  );

  if (!result.success) {
    return {
      metastoreCheck: {
        name: "Metastore ID",
        status: "error",
        message: result.error,
      },
      externalSharingCheck: {
        name: "External Sharing",
        status: "error",
        message: "Cannot check - metastore not accessible",
      },
    };
  }

  const metastore = result.data;

  // Debug: Log the full metastore response
  console.log("Metastore Summary Response:", JSON.stringify(metastore, null, 2));

  // Check for global metastore ID
  const metastoreCheck: ByodValidationCheck = metastore.global_metastore_id
    ? {
        name: "Metastore ID",
        status: "success",
        message: `Global Metastore ID: ${metastore.global_metastore_id}`,
        data: { globalMetastoreId: metastore.global_metastore_id },
      }
    : {
        name: "Metastore ID",
        status: "error",
        message: "No global metastore ID found",
      };

  // Check for external sharing enabled (delta_sharing_scope must contain "EXTERNAL")
  const hasExternalSharing = metastore.delta_sharing_scope?.includes("EXTERNAL") === true;
  const externalSharingCheck: ByodValidationCheck = hasExternalSharing
    ? {
        name: "External Sharing",
        status: "success",
        message: `Enabled (Scope: ${metastore.delta_sharing_scope})`,
        data: {
          deltaSharingScope: metastore.delta_sharing_scope,
          deltaSharingOrganizationName: metastore.delta_sharing_organization_name,
        },
      }
    : {
        name: "External Sharing",
        status: "error",
        message: `External sharing not enabled (Scope: ${metastore.delta_sharing_scope || "N/A"})`,
      };

  return {
    metastoreCheck,
    externalSharingCheck,
    metastoreData: metastore,
  };
}

/**
 * Performs full validation of a BYOD Databricks workspace.
 *
 * Checks:
 * 1. Workspace Access (/api/2.0/preview/scim/v2/Me)
 * 2. Metastore ID (/api/2.1/unity-catalog/metastore_summary)
 * 3. External Sharing Enabled
 */
export async function validateByodWorkspace(
  workspaceUrl: string,
  clientId: string,
  clientSecret: string
): Promise<ByodWorkspaceValidationResult> {
  // Initialize result with pending states
  const result: ByodWorkspaceValidationResult = {
    workspaceAccess: { name: "Workspace Access", status: "pending" },
    metastoreId: { name: "Metastore ID", status: "pending" },
    externalSharingEnabled: { name: "External Sharing", status: "pending" },
  };

  // Step 1: Get OAuth token
  const tokenResult = await getByodSpnToken(workspaceUrl, clientId, clientSecret);

  if (!tokenResult.success) {
    // Authentication failed - all checks fail
    result.workspaceAccess = {
      name: "Workspace Access",
      status: "error",
      message: tokenResult.error,
    };
    result.metastoreId = {
      name: "Metastore ID",
      status: "error",
      message: "Cannot check - authentication failed",
    };
    result.externalSharingEnabled = {
      name: "External Sharing",
      status: "error",
      message: "Cannot check - authentication failed",
    };
    return result;
  }

  const { accessToken } = tokenResult;

  // Step 2: Validate workspace access
  result.workspaceAccess = await validateWorkspaceAccess(workspaceUrl, accessToken);

  // If workspace access failed, don't proceed with other checks
  if (result.workspaceAccess.status === "error") {
    result.metastoreId = {
      name: "Metastore ID",
      status: "error",
      message: "Cannot check - workspace access failed",
    };
    result.externalSharingEnabled = {
      name: "External Sharing",
      status: "error",
      message: "Cannot check - workspace access failed",
    };
    return result;
  }

  // Step 3: Get metastore summary (includes both metastore ID and external sharing check)
  const metastoreResult = await getMetastoreSummary(workspaceUrl, accessToken);
  result.metastoreId = metastoreResult.metastoreCheck;
  result.externalSharingEnabled = metastoreResult.externalSharingCheck;

  // Extract data for database update
  if (metastoreResult.metastoreData) {
    const metastore = metastoreResult.metastoreData;
    result.deltaSharingGlobalMetastoreId = metastore.global_metastore_id;
    result.deltaSharingOrganizationName = metastore.delta_sharing_organization_name;
    result.deltaSharingScope = metastore.delta_sharing_scope;
  }

  return result;
}

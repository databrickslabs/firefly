/**
 * Databricks Apps API wrapper using global admin SPN credentials.
 * This lib provides functions for managing Databricks Apps.
 */

// ============================================================================
// Types
// ============================================================================

export interface DatabricksApp {
  id: string;
  name: string;
  url?: string;
  description?: string;
  creator?: string;
  create_time?: string;
  update_time?: string;
  updater?: string;
  default_source_code_path?: string;
  service_principal_client_id?: string;
  service_principal_id?: number;
  service_principal_name?: string;
  app_status?: {
    state?: string;
    message?: string;
  };
  compute_status?: {
    state?: string;
    message?: string;
  };
  active_deployment?: {
    deployment_id?: string;
    source_code_path?: string;
    mode?: string;
    status?: {
      state?: string;
      message?: string;
    };
  };
  pending_deployment?: {
    deployment_id?: string;
    source_code_path?: string;
    mode?: string;
    status?: {
      state?: string;
      message?: string;
    };
  };
  resources?: Array<{
    name: string;
    description?: string;
    sql_warehouse?: { id: string; permission: string };
    serving_endpoint?: { name: string; permission: string };
    job?: { id: string; permission: string };
    secret?: { scope: string; key: string; permission: string };
  }>;
}

export interface AppPermission {
  user_name?: string;
  group_name?: string;
  service_principal_name?: string;
  permission_level: 'CAN_MANAGE' | 'CAN_USE';
}

export interface CreateAppOptions {
  name: string;
  description?: string;
  no_compute?: boolean;
  resources?: DatabricksApp['resources'];
}

export interface DeployAppOptions {
  source_code_path: string;
  mode?: 'SNAPSHOT' | 'AUTO_SYNC';
  command?: string[];
  env_vars?: Array<{
    name: string;
    value?: string;
    value_from?: string;
  }>;
}

export interface AppDeployment {
  deployment_id: string;
  source_code_path?: string;
  mode?: 'SNAPSHOT' | 'AUTO_SYNC';
  command?: string[];
  env_vars?: Array<{
    name: string;
    value?: string;
    value_from?: string;
  }>;
  status?: {
    state?: string;
    message?: string;
  };
  deployment_artifacts?: {
    source_code_path?: string;
  };
  create_time?: string;
  update_time?: string;
  creator?: string;
}

export type AppsApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status?: number };

// ============================================================================
// Token Management
// ============================================================================

/**
 * Gets an OAuth token using the global admin SPN credentials
 */
export async function getGlobalAdminToken(
  workspaceUrl: string
): Promise<{ success: true; accessToken: string } | { success: false; error: string }> {
  const clientId = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID;
  const clientSecret = process.env.FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      error: 'Global admin SPN credentials not configured (FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_ID and FIREFLY_SPN_GLOBAL_ADMIN_CLIENT_SECRET)',
    };
  }

  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const tokenUrl = `${baseUrl}/oidc/v1/token`;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'all-apis',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Token request failed: ${response.status} - ${errorText}`,
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
      error: `Token request error: ${String(error)}`,
    };
  }
}

// ============================================================================
// Apps API Functions
// ============================================================================

/**
 * Creates a new Databricks app
 */
export async function createApp(
  workspaceUrl: string,
  accessToken: string,
  options: CreateAppOptions
): Promise<AppsApiResult<DatabricksApp>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const queryParams = options.no_compute ? '?no_compute=true' : '';

    const response = await fetch(`${baseUrl}/api/2.0/apps${queryParams}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: options.name,
        description: options.description,
        resources: options.resources,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to create app: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    const app: DatabricksApp = await response.json();
    return { success: true, data: app };
  } catch (error) {
    return {
      success: false,
      error: `Error creating app: ${String(error)}`,
    };
  }
}

/**
 * Gets a Databricks app by name
 */
export async function getApp(
  workspaceUrl: string,
  accessToken: string,
  appName: string
): Promise<AppsApiResult<DatabricksApp>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/2.0/apps/${encodeURIComponent(appName)}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to get app: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    const app: DatabricksApp = await response.json();
    return { success: true, data: app };
  } catch (error) {
    return {
      success: false,
      error: `Error getting app: ${String(error)}`,
    };
  }
}

/**
 * Lists all Databricks apps in the workspace
 */
export async function listApps(
  workspaceUrl: string,
  accessToken: string,
  pageSize?: number,
  pageToken?: string
): Promise<AppsApiResult<{ apps: DatabricksApp[]; next_page_token?: string }>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const params = new URLSearchParams();
    if (pageSize) params.set('page_size', String(pageSize));
    if (pageToken) params.set('page_token', pageToken);

    const queryString = params.toString();
    const url = `${baseUrl}/api/2.0/apps${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to list apps: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    const data = await response.json();
    return { success: true, data: { apps: data.apps || [], next_page_token: data.next_page_token } };
  } catch (error) {
    return {
      success: false,
      error: `Error listing apps: ${String(error)}`,
    };
  }
}

/**
 * Deletes a Databricks app
 */
export async function deleteApp(
  workspaceUrl: string,
  accessToken: string,
  appName: string
): Promise<AppsApiResult<void>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/2.0/apps/${encodeURIComponent(appName)}`, {
      method: 'DELETE',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // 404 is OK - app already doesn't exist
    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to delete app: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: `Error deleting app: ${String(error)}`,
    };
  }
}

/**
 * Starts a Databricks app
 */
export async function startApp(
  workspaceUrl: string,
  accessToken: string,
  appName: string
): Promise<AppsApiResult<DatabricksApp>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/2.0/apps/${encodeURIComponent(appName)}/start`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to start app: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    const app: DatabricksApp = await response.json();
    return { success: true, data: app };
  } catch (error) {
    return {
      success: false,
      error: `Error starting app: ${String(error)}`,
    };
  }
}

/**
 * Stops a Databricks app
 */
export async function stopApp(
  workspaceUrl: string,
  accessToken: string,
  appName: string
): Promise<AppsApiResult<void>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/2.0/apps/${encodeURIComponent(appName)}/stop`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to stop app: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: `Error stopping app: ${String(error)}`,
    };
  }
}

/**
 * Creates a deployment for a Databricks app
 */
export async function createDeployment(
  workspaceUrl: string,
  accessToken: string,
  appName: string,
  options: DeployAppOptions
): Promise<AppsApiResult<AppDeployment>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');

    // Build env_vars with only the required fields (either value or value_from, not both)
    const env_vars = options.env_vars?.map(env => {
      if (env.value !== undefined) {
        return { name: env.name, value: env.value };
      } else if (env.value_from !== undefined) {
        return { name: env.name, value_from: env.value_from };
      }
      return { name: env.name };
    });

    const requestBody: Record<string, unknown> = {
      source_code_path: options.source_code_path,
      mode: options.mode || 'SNAPSHOT',
    };

    if (options.command) {
      requestBody.command = options.command;
    }
    if (env_vars && env_vars.length > 0) {
      requestBody.env_vars = env_vars;
    }

    console.log('Deployment request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${baseUrl}/api/2.0/apps/${encodeURIComponent(appName)}/deployments`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to create deployment: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    const deployment: AppDeployment = await response.json();
    return { success: true, data: deployment };
  } catch (error) {
    return {
      success: false,
      error: `Error creating deployment: ${String(error)}`,
    };
  }
}

/**
 * Gets a deployment by ID for a Databricks app
 */
export async function getDeployment(
  workspaceUrl: string,
  accessToken: string,
  appName: string,
  deploymentId: string
): Promise<AppsApiResult<AppDeployment>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(
      `${baseUrl}/api/2.0/apps/${encodeURIComponent(appName)}/deployments/${encodeURIComponent(deploymentId)}`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to get deployment: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    const deployment: AppDeployment = await response.json();
    return { success: true, data: deployment };
  } catch (error) {
    return {
      success: false,
      error: `Error getting deployment: ${String(error)}`,
    };
  }
}

/**
 * @deprecated Use createDeployment instead
 * Deploys code to a Databricks app
 */
export async function deployApp(
  workspaceUrl: string,
  accessToken: string,
  appName: string,
  options: DeployAppOptions
): Promise<AppsApiResult<AppDeployment>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/2.0/apps/${encodeURIComponent(appName)}/deployments`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_code_path: options.source_code_path,
        mode: options.mode || 'SNAPSHOT',
        command: options.command,
        env_vars: options.env_vars,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to deploy app: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    const deployment: AppDeployment = await response.json();
    return { success: true, data: deployment };
  } catch (error) {
    return {
      success: false,
      error: `Error deploying app: ${String(error)}`,
    };
  }
}

// ============================================================================
// Permissions API Functions
// ============================================================================

/**
 * Sets permissions on a Databricks app
 */
export async function setAppPermissions(
  workspaceUrl: string,
  accessToken: string,
  appName: string,
  permissions: AppPermission[]
): Promise<AppsApiResult<void>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/2.0/permissions/apps/${encodeURIComponent(appName)}`, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_control_list: permissions,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to set app permissions: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: `Error setting app permissions: ${String(error)}`,
    };
  }
}

/**
 * Gets permissions on a Databricks app
 */
export async function getAppPermissions(
  workspaceUrl: string,
  accessToken: string,
  appName: string
): Promise<AppsApiResult<{ access_control_list: AppPermission[] }>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/2.0/permissions/apps/${encodeURIComponent(appName)}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to get app permissions: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Error getting app permissions: ${String(error)}`,
    };
  }
}

// ============================================================================
// Convenience Functions (combines token + API call)
// ============================================================================

/**
 * Creates a Databricks app using global admin credentials
 */
export async function createAppWithAdminToken(
  workspaceUrl: string,
  options: CreateAppOptions
): Promise<AppsApiResult<DatabricksApp>> {
  const tokenResult = await getGlobalAdminToken(workspaceUrl);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  return createApp(workspaceUrl, tokenResult.accessToken, options);
}

/**
 * Gets a Databricks app using global admin credentials
 */
export async function getAppWithAdminToken(
  workspaceUrl: string,
  appName: string
): Promise<AppsApiResult<DatabricksApp>> {
  const tokenResult = await getGlobalAdminToken(workspaceUrl);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  return getApp(workspaceUrl, tokenResult.accessToken, appName);
}

/**
 * Deletes a Databricks app using global admin credentials
 */
export async function deleteAppWithAdminToken(
  workspaceUrl: string,
  appName: string
): Promise<AppsApiResult<void>> {
  const tokenResult = await getGlobalAdminToken(workspaceUrl);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  return deleteApp(workspaceUrl, tokenResult.accessToken, appName);
}

/**
 * Sets app permissions using global admin credentials
 */
export async function setAppPermissionsWithAdminToken(
  workspaceUrl: string,
  appName: string,
  permissions: AppPermission[]
): Promise<AppsApiResult<void>> {
  const tokenResult = await getGlobalAdminToken(workspaceUrl);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  return setAppPermissions(workspaceUrl, tokenResult.accessToken, appName, permissions);
}

/**
 * Starts an app using global admin credentials
 */
export async function startAppWithAdminToken(
  workspaceUrl: string,
  appName: string
): Promise<AppsApiResult<DatabricksApp>> {
  const tokenResult = await getGlobalAdminToken(workspaceUrl);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  return startApp(workspaceUrl, tokenResult.accessToken, appName);
}

/**
 * Stops an app using global admin credentials
 */
export async function stopAppWithAdminToken(
  workspaceUrl: string,
  appName: string
): Promise<AppsApiResult<void>> {
  const tokenResult = await getGlobalAdminToken(workspaceUrl);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  return stopApp(workspaceUrl, tokenResult.accessToken, appName);
}

/**
 * Creates a deployment using global admin credentials
 */
export async function createDeploymentWithAdminToken(
  workspaceUrl: string,
  appName: string,
  options: DeployAppOptions
): Promise<AppsApiResult<AppDeployment>> {
  const tokenResult = await getGlobalAdminToken(workspaceUrl);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  return createDeployment(workspaceUrl, tokenResult.accessToken, appName, options);
}

/**
 * Gets a deployment using global admin credentials
 */
export async function getDeploymentWithAdminToken(
  workspaceUrl: string,
  appName: string,
  deploymentId: string
): Promise<AppsApiResult<AppDeployment>> {
  const tokenResult = await getGlobalAdminToken(workspaceUrl);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  return getDeployment(workspaceUrl, tokenResult.accessToken, appName, deploymentId);
}

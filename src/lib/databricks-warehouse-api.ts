/**
 * Databricks SQL Warehouse API wrapper.
 * All functions accept a workspaceUrl and accessToken, keeping them
 * independent of how the caller obtains credentials.
 */

// ============================================================================
// Types
// ============================================================================

export interface WarehouseCreateConfig {
  name: string;
  cluster_size: string;
  warehouse_type?: string;
  enable_serverless_compute?: boolean;
  enable_photon?: boolean;
  auto_stop_mins?: number;
  min_num_clusters?: number;
  max_num_clusters?: number;
  tags?: {
    custom_tags?: { key: string; value: string }[];
  };
}

export interface WarehouseCreateResult {
  id: string;
}

export interface WarehouseListResult {
  warehouses?: Array<{
    id: string;
    name: string;
    state: string;
    cluster_size: string;
    auto_stop_mins: number;
    warehouse_type: string;
    enable_serverless_compute: boolean;
    enable_photon: boolean;
    num_clusters: number;
    min_num_clusters: number;
    max_num_clusters: number;
    creator_name?: string;
  }>;
}

export interface WarehousePermissionEntry {
  group_name?: string;
  user_name?: string;
  service_principal_name?: string;
  permission_level: string;
}

export interface WarehousePermissionsResult {
  access_control_list?: Array<{
    group_name?: string;
    user_name?: string;
    service_principal_name?: string;
    all_permissions: {
      permission_level: string;
      inherited: boolean;
      inherited_from_object?: string[];
    }[];
  }>;
}

export interface WarehouseApiResult<T = unknown> {
  success: true;
  data: T;
}

export interface WarehouseApiError {
  success: false;
  error: string;
  details?: string;
  status: number;
}

// ============================================================================
// Warehouse CRUD
// ============================================================================

/**
 * Lists all SQL warehouses in a workspace.
 */
export async function listWarehouses(
  workspaceUrl: string,
  accessToken: string
): Promise<WarehouseApiResult<WarehouseListResult> | WarehouseApiError> {
  const baseUrl = workspaceUrl.replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/api/2.0/sql/warehouses/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error listing warehouses:", errorText);
      return { success: false, error: "Failed to list warehouses", details: errorText, status: response.status };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Error listing warehouses:", error);
    return { success: false, error: "Internal error listing warehouses", details: String(error), status: 500 };
  }
}

/**
 * Creates a new SQL warehouse.
 */
export async function createWarehouse(
  workspaceUrl: string,
  accessToken: string,
  config: WarehouseCreateConfig
): Promise<WarehouseApiResult<WarehouseCreateResult> | WarehouseApiError> {
  const baseUrl = workspaceUrl.replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/api/2.0/sql/warehouses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error creating warehouse:", errorText);
      return { success: false, error: "Failed to create warehouse", details: errorText, status: response.status };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Error creating warehouse:", error);
    return { success: false, error: "Internal error creating warehouse", details: String(error), status: 500 };
  }
}

/**
 * Deletes a SQL warehouse by ID.
 * DELETE /api/2.0/sql/warehouses/{id}
 */
export async function deleteWarehouse(
  workspaceUrl: string,
  accessToken: string,
  warehouseId: string
): Promise<WarehouseApiResult<Record<string, never>> | WarehouseApiError> {
  const baseUrl = workspaceUrl.replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/api/2.0/sql/warehouses/${warehouseId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error deleting warehouse:", errorText);
      return { success: false, error: "Failed to delete warehouse", details: errorText, status: response.status };
    }

    return { success: true, data: {} };
  } catch (error) {
    console.error("Error deleting warehouse:", error);
    return { success: false, error: "Internal error deleting warehouse", details: String(error), status: 500 };
  }
}

// ============================================================================
// Warehouse Permissions
// ============================================================================

/**
 * Gets permissions for a SQL warehouse.
 * GET /api/2.0/permissions/warehouses/{warehouse_id}
 */
export async function getWarehousePermissions(
  workspaceUrl: string,
  accessToken: string,
  warehouseId: string
): Promise<WarehouseApiResult<WarehousePermissionsResult> | WarehouseApiError> {
  const baseUrl = workspaceUrl.replace(/\/$/, "");

  try {
    const response = await fetch(
      `${baseUrl}/api/2.0/permissions/warehouses/${warehouseId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error getting warehouse permissions:", errorText);
      return { success: false, error: "Failed to get permissions", details: errorText, status: response.status };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Error getting warehouse permissions:", error);
    return { success: false, error: "Internal error getting permissions", details: String(error), status: 500 };
  }
}

/**
 * Sets (replaces) permissions on a SQL warehouse.
 * PUT /api/2.0/permissions/warehouses/{warehouse_id}
 *
 * @param accessControlList Array of permission entries to set (replaces all existing)
 */
export async function setWarehousePermissions(
  workspaceUrl: string,
  accessToken: string,
  warehouseId: string,
  accessControlList: WarehousePermissionEntry[]
): Promise<WarehouseApiResult<WarehousePermissionsResult> | WarehouseApiError> {
  const baseUrl = workspaceUrl.replace(/\/$/, "");

  try {
    const response = await fetch(
      `${baseUrl}/api/2.0/permissions/warehouses/${warehouseId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_control_list: accessControlList }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error setting warehouse permissions:", errorText);
      return { success: false, error: "Failed to set permissions", details: errorText, status: response.status };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Error setting warehouse permissions:", error);
    return { success: false, error: "Internal error setting permissions", details: String(error), status: 500 };
  }
}

/**
 * Updates (adds/modifies) permissions on a SQL warehouse without replacing existing ones.
 * PATCH /api/2.0/permissions/warehouses/{warehouse_id}
 *
 * @param accessControlList Array of permission entries to add or update
 */
export async function updateWarehousePermissions(
  workspaceUrl: string,
  accessToken: string,
  warehouseId: string,
  accessControlList: WarehousePermissionEntry[]
): Promise<WarehouseApiResult<WarehousePermissionsResult> | WarehouseApiError> {
  const baseUrl = workspaceUrl.replace(/\/$/, "");

  try {
    const response = await fetch(
      `${baseUrl}/api/2.0/permissions/warehouses/${warehouseId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_control_list: accessControlList }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error updating warehouse permissions:", errorText);
      return { success: false, error: "Failed to update permissions", details: errorText, status: response.status };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Error updating warehouse permissions:", error);
    return { success: false, error: "Internal error updating permissions", details: String(error), status: 500 };
  }
}

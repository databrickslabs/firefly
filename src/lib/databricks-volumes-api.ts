import { getDatabricksSpnToken } from "@/lib/databricks-spn-authtoken";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

export type VolumeType = "MANAGED" | "EXTERNAL";

export interface VolumeInfo {
  access_point?: string;
  browse_only?: boolean;
  catalog_name: string;
  comment?: string;
  created_at?: number;
  created_by?: string;
  full_name: string;
  metastore_id?: string;
  name: string;
  owner?: string;
  schema_name: string;
  storage_location?: string;
  updated_at?: number;
  updated_by?: string;
  volume_id?: string;
  volume_type: VolumeType;
}

export interface ListVolumesResponse {
  volumes?: VolumeInfo[];
  next_page_token?: string;
}

export interface CreateVolumeRequest {
  catalog_name: string;
  schema_name: string;
  name: string;
  volume_type: VolumeType;
  comment?: string;
  storage_location?: string; // Required for EXTERNAL volumes
}

export interface UpdateVolumeRequest {
  new_name?: string;
  owner?: string;
  comment?: string;
}

export interface VolumesApiSuccess<T = void> {
  success: true;
  data: T;
}

export interface VolumesApiError {
  success: false;
  error: string;
  details?: unknown;
  status: number;
}

export type VolumesApiResult<T = void> = VolumesApiSuccess<T> | VolumesApiError;

interface AuthContext {
  workspaceUrl: string;
  accessToken: string;
  userEmail: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the authentication context (workspace URL and SPN token) for the current user
 */
async function getAuthContext(): Promise<VolumesApiResult<AuthContext>> {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session?.activeOrganizationId) {
      return {
        success: false,
        error: "No active organization in session",
        details: "Please select an organization first",
        status: 401,
      };
    }

    const activeOrgId = session.session.activeOrganizationId;

    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, activeOrgId))
      .limit(1);

    if (!org) {
      return {
        success: false,
        error: `Organization not found: ${activeOrgId}`,
        details: "The organization associated with your session no longer exists.",
        status: 404,
      };
    }

    if (!org.workspaceUrl) {
      return {
        success: false,
        error: "No workspace URL configured for this organization",
        details: {
          organizationId: org.id,
          organizationName: org.name,
        },
        status: 400,
      };
    }

    const workspaceUrl = org.workspaceUrl.replace(/\/$/, "");
    const userEmail = session.user.email;

    const tokenResult = await getDatabricksSpnToken(workspaceUrl, undefined, userEmail, activeOrgId);

    if (!tokenResult.success) {
      return {
        success: false,
        error: tokenResult.error.error,
        details: tokenResult.error.details,
        status: tokenResult.error.status,
      };
    }

    return {
      success: true,
      data: {
        workspaceUrl,
        accessToken: tokenResult.data.accessToken,
        userEmail,
      },
    };
  } catch (error) {
    console.error("Error getting auth context:", error);
    return {
      success: false,
      error: "Internal server error",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Builds a fully qualified volume name from catalog, schema, and volume name
 */
export function buildFullVolumeName(
  catalogName: string,
  schemaName: string,
  volumeName: string
): string {
  return `${catalogName}.${schemaName}.${volumeName}`;
}

/**
 * Parses a fully qualified volume name into its components
 */
export function parseFullVolumeName(fullName: string): {
  catalogName: string;
  schemaName: string;
  volumeName: string;
} | null {
  const parts = fullName.split(".");
  if (parts.length !== 3) return null;
  return {
    catalogName: parts[0],
    schemaName: parts[1],
    volumeName: parts[2],
  };
}

// ============================================================================
// Volume Operations
// ============================================================================

/**
 * List volumes in a catalog and schema
 * @param catalogName - The name of the catalog
 * @param schemaName - The name of the schema
 * @param maxResults - Maximum number of volumes to return (default: 10000)
 * @param pageToken - Token for pagination
 * @param includeBrowse - Whether to include browse-only volumes
 */
export async function listVolumes(
  catalogName: string,
  schemaName: string,
  maxResults: number = 10000,
  pageToken?: string,
  includeBrowse: boolean = false
): Promise<VolumesApiResult<ListVolumesResponse>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;

  const queryParams = new URLSearchParams();
  queryParams.set("catalog_name", catalogName);
  queryParams.set("schema_name", schemaName);
  queryParams.set("max_results", String(maxResults));
  if (pageToken) {
    queryParams.set("page_token", pageToken);
  }
  if (includeBrowse) {
    queryParams.set("include_browse", "true");
  }

  const url = `${workspaceUrl}/api/2.1/unity-catalog/volumes?${queryParams}`;

  console.log("Volumes API - List volumes:", { catalogName, schemaName, url });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Volumes API - List volumes error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to list volumes: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    const data = await response.json();
    return { success: true, data: data as ListVolumesResponse };
  } catch (error) {
    console.error("Volumes API - List volumes exception:", error);
    return {
      success: false,
      error: "Failed to list volumes",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * List all volumes in a catalog and schema (handles pagination automatically)
 * @param catalogName - The name of the catalog
 * @param schemaName - The name of the schema
 * @param includeBrowse - Whether to include browse-only volumes
 */
export async function listVolumesAll(
  catalogName: string,
  schemaName: string,
  includeBrowse: boolean = false
): Promise<VolumesApiResult<VolumeInfo[]>> {
  const allVolumes: VolumeInfo[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listVolumes(
      catalogName,
      schemaName,
      10000,
      pageToken,
      includeBrowse
    );
    if (!result.success) return result;

    if (result.data.volumes) {
      allVolumes.push(...result.data.volumes);
    }
    pageToken = result.data.next_page_token;
  } while (pageToken);

  return { success: true, data: allVolumes };
}

/**
 * Get a volume by its fully qualified name
 * @param fullName - The three-level fully qualified name (catalog.schema.volume)
 * @param includeBrowse - Whether to include browse-only metadata
 */
export async function getVolume(
  fullName: string,
  includeBrowse: boolean = false
): Promise<VolumesApiResult<VolumeInfo>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;

  const queryParams = new URLSearchParams();
  if (includeBrowse) {
    queryParams.set("include_browse", "true");
  }

  const encodedName = encodeURIComponent(fullName);
  let url = `${workspaceUrl}/api/2.1/unity-catalog/volumes/${encodedName}`;
  if (queryParams.toString()) {
    url += `?${queryParams}`;
  }

  console.log("Volumes API - Get volume:", { fullName, url });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Volumes API - Get volume error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to get volume: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    const data = await response.json();
    return { success: true, data: data as VolumeInfo };
  } catch (error) {
    console.error("Volumes API - Get volume exception:", error);
    return {
      success: false,
      error: "Failed to get volume",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Create a new volume
 * @param request - The volume creation request
 */
export async function createVolume(
  request: CreateVolumeRequest
): Promise<VolumesApiResult<VolumeInfo>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;

  // Validate request
  if (request.volume_type === "EXTERNAL" && !request.storage_location) {
    return {
      success: false,
      error: "storage_location is required for EXTERNAL volumes",
      status: 400,
    };
  }

  const url = `${workspaceUrl}/api/2.1/unity-catalog/volumes`;

  console.log("Volumes API - Create volume:", {
    catalog: request.catalog_name,
    schema: request.schema_name,
    name: request.name,
    type: request.volume_type,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Volumes API - Create volume error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to create volume: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    const data = await response.json();
    return { success: true, data: data as VolumeInfo };
  } catch (error) {
    console.error("Volumes API - Create volume exception:", error);
    return {
      success: false,
      error: "Failed to create volume",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Create a managed volume (convenience function)
 * @param catalogName - The name of the catalog
 * @param schemaName - The name of the schema
 * @param volumeName - The name of the volume
 * @param comment - Optional comment
 */
export async function createManagedVolume(
  catalogName: string,
  schemaName: string,
  volumeName: string,
  comment?: string
): Promise<VolumesApiResult<VolumeInfo>> {
  return createVolume({
    catalog_name: catalogName,
    schema_name: schemaName,
    name: volumeName,
    volume_type: "MANAGED",
    comment,
  });
}

/**
 * Create an external volume (convenience function)
 * @param catalogName - The name of the catalog
 * @param schemaName - The name of the schema
 * @param volumeName - The name of the volume
 * @param storageLocation - The external storage location
 * @param comment - Optional comment
 */
export async function createExternalVolume(
  catalogName: string,
  schemaName: string,
  volumeName: string,
  storageLocation: string,
  comment?: string
): Promise<VolumesApiResult<VolumeInfo>> {
  return createVolume({
    catalog_name: catalogName,
    schema_name: schemaName,
    name: volumeName,
    volume_type: "EXTERNAL",
    storage_location: storageLocation,
    comment,
  });
}

/**
 * Update a volume
 * @param fullName - The three-level fully qualified name (catalog.schema.volume)
 * @param updates - The updates to apply
 */
export async function updateVolume(
  fullName: string,
  updates: UpdateVolumeRequest
): Promise<VolumesApiResult<VolumeInfo>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;

  // Validate that at least one update field is provided
  if (!updates.new_name && !updates.owner && updates.comment === undefined) {
    return {
      success: false,
      error: "At least one update field (new_name, owner, comment) is required",
      status: 400,
    };
  }

  const encodedName = encodeURIComponent(fullName);
  const url = `${workspaceUrl}/api/2.1/unity-catalog/volumes/${encodedName}`;

  console.log("Volumes API - Update volume:", { fullName, updates });

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Volumes API - Update volume error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to update volume: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    const data = await response.json();
    return { success: true, data: data as VolumeInfo };
  } catch (error) {
    console.error("Volumes API - Update volume exception:", error);
    return {
      success: false,
      error: "Failed to update volume",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Rename a volume
 * @param fullName - The current three-level fully qualified name
 * @param newName - The new volume name (not fully qualified, just the volume name)
 */
export async function renameVolume(
  fullName: string,
  newName: string
): Promise<VolumesApiResult<VolumeInfo>> {
  return updateVolume(fullName, { new_name: newName });
}

/**
 * Update a volume's owner
 * @param fullName - The three-level fully qualified name
 * @param newOwner - The new owner identifier
 */
export async function updateVolumeOwner(
  fullName: string,
  newOwner: string
): Promise<VolumesApiResult<VolumeInfo>> {
  return updateVolume(fullName, { owner: newOwner });
}

/**
 * Update a volume's comment
 * @param fullName - The three-level fully qualified name
 * @param comment - The new comment
 */
export async function updateVolumeComment(
  fullName: string,
  comment: string
): Promise<VolumesApiResult<VolumeInfo>> {
  return updateVolume(fullName, { comment });
}

/**
 * Delete a volume
 * @param fullName - The three-level fully qualified name (catalog.schema.volume)
 */
export async function deleteVolume(fullName: string): Promise<VolumesApiResult<void>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;

  const encodedName = encodeURIComponent(fullName);
  const url = `${workspaceUrl}/api/2.1/unity-catalog/volumes/${encodedName}`;

  console.log("Volumes API - Delete volume:", { fullName, url });

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Volumes API - Delete volume error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to delete volume: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Volumes API - Delete volume exception:", error);
    return {
      success: false,
      error: "Failed to delete volume",
      details: String(error),
      status: 500,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a volume exists
 * @param fullName - The three-level fully qualified name
 */
export async function volumeExists(fullName: string): Promise<VolumesApiResult<boolean>> {
  const result = await getVolume(fullName);
  if (result.success) {
    return { success: true, data: true };
  }
  if (result.status === 404) {
    return { success: true, data: false };
  }
  return result as VolumesApiError;
}

/**
 * Check if a volume exists by its components
 * @param catalogName - The catalog name
 * @param schemaName - The schema name
 * @param volumeName - The volume name
 */
export async function volumeExistsByName(
  catalogName: string,
  schemaName: string,
  volumeName: string
): Promise<VolumesApiResult<boolean>> {
  const fullName = buildFullVolumeName(catalogName, schemaName, volumeName);
  return volumeExists(fullName);
}

/**
 * Get the volume path for use with the Files API
 * Returns the path format: /Volumes/catalog/schema/volume
 * @param fullName - The three-level fully qualified name
 */
export function getVolumePath(fullName: string): string {
  const parts = parseFullVolumeName(fullName);
  if (!parts) {
    throw new Error(`Invalid volume name: ${fullName}`);
  }
  return `/Volumes/${parts.catalogName}/${parts.schemaName}/${parts.volumeName}`;
}

/**
 * Get the volume path from components
 * @param catalogName - The catalog name
 * @param schemaName - The schema name
 * @param volumeName - The volume name
 */
export function getVolumePathFromComponents(
  catalogName: string,
  schemaName: string,
  volumeName: string
): string {
  return `/Volumes/${catalogName}/${schemaName}/${volumeName}`;
}

/**
 * Filter volumes by type
 * @param volumes - Array of volumes to filter
 * @param volumeType - The type to filter by
 */
export function filterVolumesByType(
  volumes: VolumeInfo[],
  volumeType: VolumeType
): VolumeInfo[] {
  return volumes.filter((v) => v.volume_type === volumeType);
}

/**
 * Filter managed volumes
 * @param volumes - Array of volumes to filter
 */
export function filterManagedVolumes(volumes: VolumeInfo[]): VolumeInfo[] {
  return filterVolumesByType(volumes, "MANAGED");
}

/**
 * Filter external volumes
 * @param volumes - Array of volumes to filter
 */
export function filterExternalVolumes(volumes: VolumeInfo[]): VolumeInfo[] {
  return filterVolumesByType(volumes, "EXTERNAL");
}

/**
 * Sort volumes by name
 * @param volumes - Array of volumes to sort
 * @param ascending - Sort order (default: true)
 */
export function sortVolumesByName(
  volumes: VolumeInfo[],
  ascending: boolean = true
): VolumeInfo[] {
  return [...volumes].sort((a, b) => {
    const comparison = a.name.localeCompare(b.name);
    return ascending ? comparison : -comparison;
  });
}

/**
 * Sort volumes by creation date
 * @param volumes - Array of volumes to sort
 * @param ascending - Sort order (default: false, newest first)
 */
export function sortVolumesByCreatedAt(
  volumes: VolumeInfo[],
  ascending: boolean = false
): VolumeInfo[] {
  return [...volumes].sort((a, b) => {
    const aTime = a.created_at || 0;
    const bTime = b.created_at || 0;
    return ascending ? aTime - bTime : bTime - aTime;
  });
}

/**
 * Format a volume's creation timestamp
 * @param createdAt - The created_at timestamp (milliseconds since epoch)
 */
export function formatVolumeCreatedAt(createdAt?: number): string {
  if (!createdAt) return "Unknown";
  return new Date(createdAt).toLocaleString();
}

/**
 * Format a volume's size-related information for display
 * @param volume - The volume info
 */
export function getVolumeDisplayInfo(volume: VolumeInfo): {
  fullName: string;
  displayType: string;
  createdAt: string;
  owner: string;
} {
  return {
    fullName: volume.full_name,
    displayType: volume.volume_type === "MANAGED" ? "Managed" : "External",
    createdAt: formatVolumeCreatedAt(volume.created_at),
    owner: volume.owner || "Unknown",
  };
}

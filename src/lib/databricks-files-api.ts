import { getDatabricksSpnToken } from "@/lib/databricks-spn-authtoken";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

export interface DirectoryEntry {
  name: string;
  path: string;
  is_directory: boolean;
  file_size?: number;
  last_modified?: number;
}

export interface ListDirectoryResponse {
  contents: DirectoryEntry[];
  next_page_token?: string;
}

export interface FileMetadata {
  contentLength: number;
  contentType: string;
  lastModified: string;
}

export interface FilesApiSuccess<T = void> {
  success: true;
  data: T;
}

export interface FilesApiError {
  success: false;
  error: string;
  details?: unknown;
  status: number;
}

export type FilesApiResult<T = void> = FilesApiSuccess<T> | FilesApiError;

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
async function getAuthContext(): Promise<FilesApiResult<AuthContext>> {
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

    const tokenResult = await getDatabricksSpnToken(workspaceUrl, undefined, userEmail);

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
 * Encodes a file/directory path for use in the API URL
 * The path should start with /Volumes/...
 */
function encodePath(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // URL encode each segment of the path
  return normalizedPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Download a file from a Databricks volume
 * @param filePath - The absolute path of the file (e.g., /Volumes/catalog/schema/volume/file.txt)
 * @param range - Optional byte range (e.g., "bytes=0-499")
 * @param ifUnmodifiedSince - Optional timestamp for conditional download
 */
export async function downloadFile(
  filePath: string,
  range?: string,
  ifUnmodifiedSince?: string
): Promise<FilesApiResult<{ data: ArrayBuffer; metadata: FileMetadata }>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;
  const encodedPath = encodePath(filePath);
  const url = `${workspaceUrl}/api/2.0/fs/files${encodedPath}`;

  const requestHeaders: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
  };

  if (range) {
    requestHeaders["Range"] = range;
  }
  if (ifUnmodifiedSince) {
    requestHeaders["If-Unmodified-Since"] = ifUnmodifiedSince;
  }

  console.log("Files API - Download file:", { filePath, url });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: requestHeaders,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Files API - Download file error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to download file: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    const data = await response.arrayBuffer();
    const metadata: FileMetadata = {
      contentLength: parseInt(response.headers.get("content-length") || "0", 10),
      contentType: response.headers.get("content-type") || "application/octet-stream",
      lastModified: response.headers.get("last-modified") || "",
    };

    return {
      success: true,
      data: { data, metadata },
    };
  } catch (error) {
    console.error("Files API - Download file exception:", error);
    return {
      success: false,
      error: "Failed to download file",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Upload a file to a Databricks volume
 * @param filePath - The absolute path where the file should be uploaded
 * @param content - The file content as ArrayBuffer, Blob, or string
 * @param overwrite - If true, overwrite existing file (default: true)
 */
export async function uploadFile(
  filePath: string,
  content: ArrayBuffer | Blob | string,
  overwrite: boolean = true
): Promise<FilesApiResult<void>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;
  const encodedPath = encodePath(filePath);
  const url = `${workspaceUrl}/api/2.0/fs/files${encodedPath}?overwrite=${overwrite}`;

  console.log("Files API - Upload file:", { filePath, url, overwrite });

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: content,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Files API - Upload file error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to upload file: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Files API - Upload file exception:", error);
    return {
      success: false,
      error: "Failed to upload file",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Get metadata for a file
 * @param filePath - The absolute path of the file
 */
export async function getFileMetadata(
  filePath: string
): Promise<FilesApiResult<FileMetadata>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;
  const encodedPath = encodePath(filePath);
  const url = `${workspaceUrl}/api/2.0/fs/files${encodedPath}`;

  console.log("Files API - Get file metadata:", { filePath, url });

  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error("Files API - Get file metadata error:", {
        status: response.status,
      });
      return {
        success: false,
        error: `Failed to get file metadata: ${response.statusText}`,
        status: response.status,
      };
    }

    const metadata: FileMetadata = {
      contentLength: parseInt(response.headers.get("content-length") || "0", 10),
      contentType: response.headers.get("content-type") || "application/octet-stream",
      lastModified: response.headers.get("last-modified") || "",
    };

    return { success: true, data: metadata };
  } catch (error) {
    console.error("Files API - Get file metadata exception:", error);
    return {
      success: false,
      error: "Failed to get file metadata",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Delete a file
 * @param filePath - The absolute path of the file to delete
 */
export async function deleteFile(filePath: string): Promise<FilesApiResult<void>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;
  const encodedPath = encodePath(filePath);
  const url = `${workspaceUrl}/api/2.0/fs/files${encodedPath}`;

  console.log("Files API - Delete file:", { filePath, url });

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Files API - Delete file error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to delete file: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Files API - Delete file exception:", error);
    return {
      success: false,
      error: "Failed to delete file",
      details: String(error),
      status: 500,
    };
  }
}

// ============================================================================
// Directory Operations
// ============================================================================

/**
 * List contents of a directory
 * @param directoryPath - The absolute path of the directory (must end with /)
 * @param pageSize - Maximum number of entries to return (default: 1000)
 * @param pageToken - Token for pagination
 */
export async function listDirectory(
  directoryPath: string,
  pageSize: number = 1000,
  pageToken?: string
): Promise<FilesApiResult<ListDirectoryResponse>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;

  // Ensure directory path ends with /
  const normalizedPath = directoryPath.endsWith("/") ? directoryPath : `${directoryPath}/`;
  const encodedPath = encodePath(normalizedPath);

  const queryParams = new URLSearchParams();
  queryParams.set("page_size", String(pageSize));
  if (pageToken) {
    queryParams.set("page_token", pageToken);
  }

  const url = `${workspaceUrl}/api/2.0/fs/directories${encodedPath}?${queryParams}`;

  console.log("Files API - List directory:", { directoryPath, url });

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
      console.error("Files API - List directory error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to list directory: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    const data = await response.json();
    // Normalize response to ensure contents is always an array
    const normalizedData: ListDirectoryResponse = {
      contents: data.contents || [],
      next_page_token: data.next_page_token,
    };
    return { success: true, data: normalizedData };
  } catch (error) {
    console.error("Files API - List directory exception:", error);
    return {
      success: false,
      error: "Failed to list directory",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * List all contents of a directory (handles pagination automatically)
 * @param directoryPath - The absolute path of the directory
 */
export async function listDirectoryAll(
  directoryPath: string
): Promise<FilesApiResult<DirectoryEntry[]>> {
  const allEntries: DirectoryEntry[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listDirectory(directoryPath, 1000, pageToken);
    if (!result.success) return result;

    // Defensive: handle case where contents might be undefined
    if (result.data.contents && result.data.contents.length > 0) {
      allEntries.push(...result.data.contents);
    }
    pageToken = result.data.next_page_token;
  } while (pageToken);

  return { success: true, data: allEntries };
}

/**
 * Create a directory
 * @param directoryPath - The absolute path of the directory to create (must end with /)
 */
export async function createDirectory(directoryPath: string): Promise<FilesApiResult<void>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;

  // Ensure directory path ends with /
  const normalizedPath = directoryPath.endsWith("/") ? directoryPath : `${directoryPath}/`;
  const encodedPath = encodePath(normalizedPath);
  const url = `${workspaceUrl}/api/2.0/fs/directories${encodedPath}`;

  console.log("Files API - Create directory:", { directoryPath, url });

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Files API - Create directory error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to create directory: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Files API - Create directory exception:", error);
    return {
      success: false,
      error: "Failed to create directory",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Get metadata for a directory (check if it exists)
 * @param directoryPath - The absolute path of the directory
 */
export async function getDirectoryMetadata(
  directoryPath: string
): Promise<FilesApiResult<void>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;

  // Ensure directory path ends with /
  const normalizedPath = directoryPath.endsWith("/") ? directoryPath : `${directoryPath}/`;
  const encodedPath = encodePath(normalizedPath);
  const url = `${workspaceUrl}/api/2.0/fs/directories${encodedPath}`;

  console.log("Files API - Get directory metadata:", { directoryPath, url });

  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error("Files API - Get directory metadata error:", {
        status: response.status,
      });
      return {
        success: false,
        error: `Failed to get directory metadata: ${response.statusText}`,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Files API - Get directory metadata exception:", error);
    return {
      success: false,
      error: "Failed to get directory metadata",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Delete an empty directory
 * @param directoryPath - The absolute path of the directory to delete
 */
export async function deleteDirectory(directoryPath: string): Promise<FilesApiResult<void>> {
  const authResult = await getAuthContext();
  if (!authResult.success) return authResult;

  const { workspaceUrl, accessToken } = authResult.data;

  // Ensure directory path ends with /
  const normalizedPath = directoryPath.endsWith("/") ? directoryPath : `${directoryPath}/`;
  const encodedPath = encodePath(normalizedPath);
  const url = `${workspaceUrl}/api/2.0/fs/directories${encodedPath}`;

  console.log("Files API - Delete directory:", { directoryPath, url });

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Files API - Delete directory error:", {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Failed to delete directory: ${response.statusText}`,
        details: errorText,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Files API - Delete directory exception:", error);
    return {
      success: false,
      error: "Failed to delete directory",
      details: String(error),
      status: 500,
    };
  }
}

/**
 * Delete a directory and all its contents recursively
 * @param directoryPath - The absolute path of the directory to delete
 */
export async function deleteDirectoryRecursive(
  directoryPath: string
): Promise<FilesApiResult<void>> {
  // First, list all contents
  const listResult = await listDirectoryAll(directoryPath);
  if (!listResult.success) return listResult;

  // Delete all contents
  for (const entry of listResult.data) {
    if (entry.is_directory) {
      // Recursively delete subdirectories
      const deleteResult = await deleteDirectoryRecursive(entry.path);
      if (!deleteResult.success) return deleteResult;
    } else {
      // Delete files
      const deleteResult = await deleteFile(entry.path);
      if (!deleteResult.success) return deleteResult;
    }
  }

  // Finally, delete the now-empty directory
  return deleteDirectory(directoryPath);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a file exists
 * @param filePath - The absolute path of the file
 */
export async function fileExists(filePath: string): Promise<FilesApiResult<boolean>> {
  const result = await getFileMetadata(filePath);
  if (result.success) {
    return { success: true, data: true };
  }
  if (result.status === 404) {
    return { success: true, data: false };
  }
  return result as FilesApiError;
}

/**
 * Check if a directory exists
 * @param directoryPath - The absolute path of the directory
 */
export async function directoryExists(
  directoryPath: string
): Promise<FilesApiResult<boolean>> {
  const result = await getDirectoryMetadata(directoryPath);
  if (result.success) {
    return { success: true, data: true };
  }
  if (result.status === 404) {
    return { success: true, data: false };
  }
  return result as FilesApiError;
}

/**
 * Copy a file to a new location
 * @param sourcePath - The source file path
 * @param destinationPath - The destination file path
 */
export async function copyFile(
  sourcePath: string,
  destinationPath: string
): Promise<FilesApiResult<void>> {
  // Download the source file
  const downloadResult = await downloadFile(sourcePath);
  if (!downloadResult.success) return downloadResult;

  // Upload to destination
  return uploadFile(destinationPath, downloadResult.data.data, true);
}

/**
 * Move a file to a new location (copy + delete)
 * @param sourcePath - The source file path
 * @param destinationPath - The destination file path
 */
export async function moveFile(
  sourcePath: string,
  destinationPath: string
): Promise<FilesApiResult<void>> {
  // Copy the file
  const copyResult = await copyFile(sourcePath, destinationPath);
  if (!copyResult.success) return copyResult;

  // Delete the source
  return deleteFile(sourcePath);
}

/**
 * Get the file extension from a path
 */
export function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf(".");
  const lastSlash = path.lastIndexOf("/");
  if (lastDot > lastSlash) {
    return path.substring(lastDot + 1).toLowerCase();
  }
  return "";
}

/**
 * Get the file name from a path
 */
export function getFileName(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return path.substring(lastSlash + 1);
}

/**
 * Get the parent directory from a path
 */
export function getParentDirectory(path: string): string {
  // Remove trailing slash if present
  const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
  const lastSlash = normalizedPath.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return normalizedPath.substring(0, lastSlash);
}

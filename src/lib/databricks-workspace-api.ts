/**
 * Databricks Workspace API wrapper using global admin SPN credentials.
 * Provides functions for managing workspace files (import, export, mkdirs).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { type AppsApiResult } from './databricks-apps-api';

// ============================================================================
// Types
// ============================================================================

interface WorkspaceExportResponse {
  content: string; // base64-encoded file content
  file_type?: string;
}

// Mapping of tool types to their local and remote file paths
const BUILTIN_APP_FILES = {
  MARIMO: {
    localPath: 'databricks-apps/marimo-notebook/app.py',
    remotePath: '/Workspace/firefly-apps/marimo-notebooks/app.py',
    remoteDir: '/Workspace/firefly-apps/marimo-notebooks',
  },
  CODE_SERVER: {
    localPath: 'databricks-apps/code-editor/app.py',
    remotePath: '/Workspace/firefly-apps/code-editor/app.py',
    remoteDir: '/Workspace/firefly-apps/code-editor',
  },
} as const;

// ============================================================================
// Low-level Workspace API Functions
// ============================================================================

/**
 * Creates a directory in the workspace (and necessary parent directories).
 * Idempotent — succeeds if directory already exists.
 */
export async function mkdirs(
  workspaceUrl: string,
  accessToken: string,
  dirPath: string
): Promise<AppsApiResult<void>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/2.0/workspace/mkdirs`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: dirPath }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to create directory: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: `mkdirs error: ${String(error)}`,
    };
  }
}

/**
 * Imports (uploads) a file to the workspace.
 */
export async function importWorkspaceFile(
  workspaceUrl: string,
  accessToken: string,
  filePath: string,
  contentBase64: string
): Promise<AppsApiResult<void>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/2.0/workspace/import`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: filePath,
        content: contentBase64,
        format: 'AUTO',
        overwrite: true,
        language: 'PYTHON',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to import file: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: `Import error: ${String(error)}`,
    };
  }
}

/**
 * Exports (downloads) a file from the workspace.
 * Returns base64-encoded content. Returns status 404 if file does not exist.
 */
export async function exportWorkspaceFile(
  workspaceUrl: string,
  accessToken: string,
  filePath: string
): Promise<AppsApiResult<WorkspaceExportResponse>> {
  try {
    const baseUrl = workspaceUrl.replace(/\/+$/, '');
    const params = new URLSearchParams({
      path: filePath,
      format: 'AUTO',
    });

    const response = await fetch(
      `${baseUrl}/api/2.0/workspace/export?${params.toString()}`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to export file: ${response.status} - ${errorText}`,
        status: response.status,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Export error: ${String(error)}`,
    };
  }
}

// ============================================================================
// High-level Orchestrator
// ============================================================================

/**
 * Ensures the builtin app source code for the given tool type exists in the
 * Databricks workspace and matches the local version shipped with the app.
 *
 * Reads the local Python file from the bundled `databricks-apps/` directory,
 * compares with the remote workspace file, and uploads if missing or different.
 */
export async function ensureBuiltinAppInWorkspace(
  workspaceUrl: string,
  accessToken: string,
  toolType: 'MARIMO' | 'CODE_SERVER'
): Promise<AppsApiResult<{ synced: boolean; action: 'skipped' | 'created' | 'updated' }>> {
  const fileConfig = BUILTIN_APP_FILES[toolType];
  if (!fileConfig) {
    return { success: false, error: `Unknown tool type: ${toolType}` };
  }

  try {
    // 1. Read local file
    const localFilePath = path.join(process.cwd(), fileConfig.localPath);
    const localContent = await fs.readFile(localFilePath, 'utf-8');
    const localBase64 = Buffer.from(localContent).toString('base64');

    // 2. Try to export remote file
    const exportResult = await exportWorkspaceFile(
      workspaceUrl,
      accessToken,
      fileConfig.remotePath
    );

    if (exportResult.success) {
      // 3. Compare content (decode both to UTF-8 to handle base64 padding differences)
      const remoteContent = Buffer.from(exportResult.data.content, 'base64').toString('utf-8');
      if (remoteContent === localContent) {
        console.log(`Builtin app ${toolType}: remote file matches local, skipping sync`);
        return { success: true, data: { synced: true, action: 'skipped' } };
      }

      // Content differs — need to update
      console.log(`Builtin app ${toolType}: remote file differs from local, updating`);
    } else if (exportResult.status === 404) {
      // File does not exist — need to create
      console.log(`Builtin app ${toolType}: remote file not found, creating`);
    } else {
      // Non-404 error — don't attempt import, could be permission issue
      return {
        success: false,
        error: `Failed to check remote file: ${exportResult.error}`,
        status: exportResult.status,
      };
    }

    // 4. Ensure parent directory exists
    const mkdirsResult = await mkdirs(workspaceUrl, accessToken, fileConfig.remoteDir);
    if (!mkdirsResult.success) {
      return {
        success: false,
        error: `Failed to create directory ${fileConfig.remoteDir}: ${mkdirsResult.error}`,
      };
    }

    // 5. Upload the file
    const importResult = await importWorkspaceFile(
      workspaceUrl,
      accessToken,
      fileConfig.remotePath,
      localBase64
    );
    if (!importResult.success) {
      return {
        success: false,
        error: `Failed to upload file: ${importResult.error}`,
      };
    }

    const action = exportResult.success ? 'updated' : 'created';
    console.log(`Builtin app ${toolType}: file ${action} at ${fileConfig.remotePath}`);
    return { success: true, data: { synced: true, action } };
  } catch (error) {
    return {
      success: false,
      error: `ensureBuiltinAppInWorkspace error: ${String(error)}`,
    };
  }
}

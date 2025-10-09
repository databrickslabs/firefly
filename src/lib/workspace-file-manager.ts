/**
 * Workspace File Manager
 * Types and utilities for managing Databricks Workspace files
 */

/**
 * Get the Monaco root path for a user
 * @param userEmail - The user's email address
 * @returns The workspace path for the user's Monaco files
 */
export function getMonacoRootPath(userEmail: string): string {
  return `/Workspace/Users/${userEmail}/.monaco`;
}

/**
 * @deprecated Use getMonacoRootPath(userEmail) instead
 * This constant is kept for backwards compatibility but should not be used
 */
export const MONACO_ROOT_PATH = "/Workspace/Users/.monaco";

export type WorkspaceObjectType = "NOTEBOOK" | "DIRECTORY" | "LIBRARY" | "FILE" | "REPO" | "DASHBOARD";

export interface WorkspaceFile {
  path: string;
  name: string;
  object_type: WorkspaceObjectType;
  object_id?: number;
  resource_id?: string;
  created_at?: number;
  modified_at?: number;
  language?: "SCALA" | "PYTHON" | "SQL" | "R";
  size?: number;
  isDirectory: boolean;
}

export interface FileTreeNode extends WorkspaceFile {
  children?: FileTreeNode[];
  isExpanded?: boolean;
  level: number;
  parentPath: string;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: "sql";
}

export interface WorkspaceFileState {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  fileTree: FileTreeNode[];
  expandedFolders: Set<string>;
}

/**
 * Parse workspace path to get file name
 */
export function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || "";
}

/**
 * Parse workspace path to get parent directory
 */
export function getParentPath(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/") || "/";
}

/**
 * Check if path is a SQL file
 */
export function isSqlFile(path: string): boolean {
  return path.endsWith(".sql");
}

/**
 * Build file tree from flat list of workspace objects
 */
export function buildFileTree(
  objects: WorkspaceFile[],
  rootPath: string = MONACO_ROOT_PATH
): FileTreeNode[] {
  const tree: FileTreeNode[] = [];
  const pathMap = new Map<string, FileTreeNode>();

  // Sort by path to ensure parents come before children
  const sortedObjects = [...objects].sort((a, b) => a.path.localeCompare(b.path));

  for (const obj of sortedObjects) {
    const relativePath = obj.path.replace(rootPath, "");
    const level = relativePath.split("/").filter(Boolean).length;
    const parentPath = getParentPath(obj.path);

    const node: FileTreeNode = {
      ...obj,
      name: getFileName(obj.path),
      isDirectory: obj.object_type === "DIRECTORY",
      children: obj.object_type === "DIRECTORY" ? [] : undefined,
      isExpanded: false,
      level,
      parentPath,
    };

    pathMap.set(obj.path, node);

    // If this is a direct child of root, add to tree
    if (parentPath === rootPath || parentPath === rootPath + "/") {
      tree.push(node);
    } else {
      // Find parent and add as child
      const parent = pathMap.get(parentPath);
      if (parent && parent.children) {
        parent.children.push(node);
      }
    }
  }

  return tree;
}

/**
 * Flatten file tree for rendering
 */
export function flattenFileTree(nodes: FileTreeNode[], expandedPaths: Set<string>): FileTreeNode[] {
  const result: FileTreeNode[] = [];

  function traverse(nodes: FileTreeNode[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.isDirectory && node.children && expandedPaths.has(node.path)) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return result;
}

/**
 * Find node in tree by path
 */
export function findNodeByPath(nodes: FileTreeNode[], path: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Create a new file path with unique name
 */
export function createUniqueFilePath(parentPath: string, baseName: string, existingPaths: string[]): string {
  let counter = 1;
  let newPath = `${parentPath}/${baseName}`;

  while (existingPaths.includes(newPath)) {
    const parts = baseName.split(".");
    if (parts.length > 1) {
      const extension = parts.pop();
      const nameWithoutExt = parts.join(".");
      newPath = `${parentPath}/${nameWithoutExt}_${counter}.${extension}`;
    } else {
      newPath = `${parentPath}/${baseName}_${counter}`;
    }
    counter++;
  }

  return newPath;
}

/**
 * Validate file name
 */
export function isValidFileName(name: string): boolean {
  // Check for empty name
  if (!name || name.trim().length === 0) {
    return false;
  }

  // Check for invalid characters
  const invalidChars = /[<>:"|?*\x00-\x1F]/;
  if (invalidChars.test(name)) {
    return false;
  }

  // Check for reserved names (Windows-style)
  const reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
  const nameWithoutExt = name.split(".")[0];
  if (reservedNames.test(nameWithoutExt)) {
    return false;
  }

  return true;
}

/**
 * Sort files and directories (directories first, then alphabetically)
 */
export function sortFileTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    // Directories first
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;

    // Then alphabetically
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/**
 * Get file extension
 */
export function getFileExtension(path: string): string {
  const parts = path.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return "";

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format date
 */
export function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  return date.toLocaleString();
}

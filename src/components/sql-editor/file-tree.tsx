"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  type WorkspaceFile,
  type FileTreeNode,
  MONACO_ROOT_PATH,
  buildFileTree,
  flattenFileTree,
  sortFileTreeNodes,
  isSqlFile,
  isValidFileName,
  createUniqueFilePath,
} from "@/lib/workspace-file-manager";

interface FileTreeProps {
  onFileSelect: (filePath: string) => void;
  selectedFilePath: string | null;
}

interface ListResponse {
  objects?: WorkspaceFile[];
}

export function FileTree({ onFileSelect, selectedFilePath }: FileTreeProps) {
  const queryClient = useQueryClient();
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(
    new Set([MONACO_ROOT_PATH])
  );
  const [contextMenuPath, setContextMenuPath] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [createFileDialogOpen, setCreateFileDialogOpen] = React.useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = React.useState(false);
  const [newItemName, setNewItemName] = React.useState("");
  const [targetParentPath, setTargetParentPath] = React.useState<string>(MONACO_ROOT_PATH);

  // Store files by parent path
  const [filesByPath, setFilesByPath] = React.useState<Map<string, WorkspaceFile[]>>(new Map());

  // Fetch workspace files for root
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ["workspace-files", MONACO_ROOT_PATH],
    queryFn: async () => {
      const response = await fetch(
        `/api/databricks/workspace/list?path=${encodeURIComponent(MONACO_ROOT_PATH)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch workspace files");
      }
      return response.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Update filesByPath when root data changes
  React.useEffect(() => {
    if (data?.objects) {
      setFilesByPath((prev) => {
        const next = new Map(prev);
        next.set(MONACO_ROOT_PATH, data.objects || []);
        return next;
      });
    }
  }, [data]);

  // Fetch folder contents mutation
  const fetchFolderMutation = useMutation({
    mutationFn: async (folderPath: string) => {
      const response = await fetch(
        `/api/databricks/workspace/list?path=${encodeURIComponent(folderPath)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch folder contents");
      }
      return { path: folderPath, data: await response.json() as ListResponse };
    },
    onSuccess: ({ path, data }) => {
      setFilesByPath((prev) => {
        const next = new Map(prev);
        next.set(path, data.objects || []);
        return next;
      });
    },
  });

  // Build file tree from all loaded files
  const fileTree = React.useMemo(() => {
    const allFiles: WorkspaceFile[] = [];
    filesByPath.forEach((files) => {
      allFiles.push(...files);
    });
    if (allFiles.length === 0) return [];
    const tree = buildFileTree(allFiles, MONACO_ROOT_PATH);
    return sortFileTreeNodes(tree);
  }, [filesByPath]);

  // Flatten tree for rendering
  const flatTree = React.useMemo(() => {
    return flattenFileTree(fileTree, expandedPaths);
  }, [fileTree, expandedPaths]);

  // Create file mutation
  const createFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const response = await fetch("/api/databricks/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          content,
          format: "AUTO",
          isNotebook: false, // Create as file, not notebook
          overwrite: false,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to create file");
      }
      return { path, result: await response.json() };
    },
    onSuccess: ({ path }) => {
      // Refresh the parent folder
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      if (filesByPath.has(parentPath)) {
        fetchFolderMutation.mutate(parentPath);
      }
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      setCreateFileDialogOpen(false);
      setNewItemName("");
    },
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (path: string) => {
      const response = await fetch("/api/databricks/workspace/mkdirs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!response.ok) {
        throw new Error("Failed to create folder");
      }
      return { path, result: await response.json() };
    },
    onSuccess: ({ path }) => {
      // Refresh the parent folder
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      if (filesByPath.has(parentPath)) {
        fetchFolderMutation.mutate(parentPath);
      }
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      setCreateFolderDialogOpen(false);
      setNewItemName("");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ path, isDirectory }: { path: string; isDirectory: boolean }) => {
      const response = await fetch("/api/databricks/workspace/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          recursive: isDirectory,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to delete");
      }
      return { path, result: await response.json() };
    },
    onSuccess: ({ path }) => {
      // Refresh the parent folder
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      if (filesByPath.has(parentPath)) {
        fetchFolderMutation.mutate(parentPath);
      }
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      setDeleteDialogOpen(false);
      setContextMenuPath(null);
    },
  });

  const toggleExpanded = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        // Collapsing
        next.delete(path);
      } else {
        // Expanding - fetch contents if not already loaded
        next.add(path);
        if (!filesByPath.has(path)) {
          fetchFolderMutation.mutate(path);
        }
      }
      return next;
    });
  };

  const handleFileClick = (node: FileTreeNode) => {
    if (node.isDirectory) {
      toggleExpanded(node.path);
    } else if (isSqlFile(node.path)) {
      onFileSelect(node.path);
    }
  };

  const handleNewFile = (parentPath: string) => {
    setTargetParentPath(parentPath);
    setNewItemName("untitled.sql");
    setCreateFileDialogOpen(true);
  };

  const handleNewFolder = (parentPath: string) => {
    setTargetParentPath(parentPath);
    setNewItemName("New Folder");
    setCreateFolderDialogOpen(true);
  };

  const handleDelete = (path: string) => {
    setContextMenuPath(path);
    setDeleteDialogOpen(true);
  };

  const confirmCreateFile = () => {
    if (!isValidFileName(newItemName)) {
      alert("Invalid file name");
      return;
    }

    const allPaths = data?.objects?.map((obj) => obj.path) || [];
    const filePath = createUniqueFilePath(targetParentPath, newItemName, allPaths);

    createFileMutation.mutate({
      path: filePath,
      content: "-- New SQL query\n",
    });
  };

  const confirmCreateFolder = () => {
    if (!isValidFileName(newItemName)) {
      alert("Invalid folder name");
      return;
    }

    const allPaths = data?.objects?.map((obj) => obj.path) || [];
    const folderPath = createUniqueFilePath(targetParentPath, newItemName, allPaths);

    createFolderMutation.mutate(folderPath);
  };

  const confirmDelete = () => {
    if (!contextMenuPath) return;

    const node = flatTree.find((n) => n.path === contextMenuPath);
    if (!node) return;

    deleteMutation.mutate({
      path: contextMenuPath,
      isDirectory: node.isDirectory,
    });
  };

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">
        <p>Failed to load workspace files</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase">Files</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleNewFile(MONACO_ROOT_PATH)}
            className="h-6 w-6 p-0"
            title="New File"
          >
            <FilePlus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleNewFolder(MONACO_ROOT_PATH)}
            className="h-6 w-6 p-0"
            title="New Folder"
          >
            <FolderPlus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-6 w-6 p-0"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="py-1">
            {flatTree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                isExpanded={expandedPaths.has(node.path)}
                isSelected={selectedFilePath === node.path}
                onClick={() => handleFileClick(node)}
                onNewFile={() => handleNewFile(node.path)}
                onNewFolder={() => handleNewFolder(node.path)}
                onDelete={() => handleDelete(node.path)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create File Dialog */}
      <AlertDialog open={createFileDialogOpen} onOpenChange={setCreateFileDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create New File</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a name for the new SQL file
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="filename.sql"
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmCreateFile();
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCreateFile} disabled={createFileMutation.isPending}>
              {createFileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Folder Dialog */}
      <AlertDialog open={createFolderDialogOpen} onOpenChange={setCreateFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create New Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a name for the new folder
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Folder Name"
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmCreateFolder();
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCreateFolder} disabled={createFolderMutation.isPending}>
              {createFolderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface FileTreeItemProps {
  node: FileTreeNode;
  isExpanded: boolean;
  isSelected: boolean;
  onClick: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
}

function FileTreeItem({
  node,
  isExpanded,
  isSelected,
  onClick,
  onNewFile,
  onNewFolder,
  onDelete,
}: FileTreeItemProps) {
  const paddingLeft = node.level * 12 + 8;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`
            flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent text-sm
            ${isSelected ? "bg-accent" : ""}
          `}
          style={{ paddingLeft }}
          onClick={onClick}
        >
          {node.isDirectory ? (
            <>
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-yellow-600" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-yellow-600" />
              )}
            </>
          ) : (
            <>
              <span className="w-3" />
              <File className="h-4 w-4 shrink-0 text-blue-600" />
            </>
          )}
          <span className="truncate">{node.name}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {node.isDirectory && (
          <>
            <ContextMenuItem onClick={onNewFile}>
              <FilePlus className="h-4 w-4 mr-2" />
              New File
            </ContextMenuItem>
            <ContextMenuItem onClick={onNewFolder}>
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </ContextMenuItem>
          </>
        )}
        <ContextMenuItem onClick={onDelete} className="text-red-600">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

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

  // Track items being created that should show loading indicator in tree
  const [pendingCreations, setPendingCreations] = React.useState<Map<string, { type: 'file' | 'folder'; name: string }>>(new Map());

  // Store files by parent path
  const [filesByPath, setFilesByPath] = React.useState<Map<string, WorkspaceFile[]>>(new Map());

  // Ref to access latest filesByPath in async callbacks
  const filesByPathRef = React.useRef(filesByPath);
  React.useEffect(() => {
    filesByPathRef.current = filesByPath;
  }, [filesByPath]);

  // Fetch workspace files for root
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ["workspace-files", MONACO_ROOT_PATH],
    queryFn: async () => {
      const response = await fetch(
        `/api/databricks/workspace/list?path=${encodeURIComponent(MONACO_ROOT_PATH)}`
      );

      // If 404, create the .monaco folder
      if (response.status === 404) {
        const createResponse = await fetch("/api/databricks/workspace/mkdirs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: MONACO_ROOT_PATH }),
        });

        if (!createResponse.ok) {
          throw new Error("Failed to create .monaco folder");
        }

        // Return empty list after creating folder
        return { objects: [] };
      }

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

  // Track which folders are currently loading
  const [loadingFolders, setLoadingFolders] = React.useState<Set<string>>(new Set());

  // Track pending operations (create/delete) on specific paths
  const [pendingOperations, setPendingOperations] = React.useState<Map<string, 'creating' | 'deleting'>>(new Map());

  // Fetch folder contents mutation
  const fetchFolderMutation = useMutation({
    mutationFn: async (folderPath: string) => {
      setLoadingFolders((prev) => new Set(prev).add(folderPath));
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
      setLoadingFolders((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    },
    onError: (_, folderPath) => {
      setLoadingFolders((prev) => {
        const next = new Set(prev);
        next.delete(folderPath);
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
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      setPendingOperations((prev) => new Map(prev).set(parentPath, 'creating'));

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
    onSuccess: async ({ path }) => {
      const parentPath = path.substring(0, path.lastIndexOf('/'));

      // Clear pending operations
      setPendingOperations((prev) => {
        const next = new Map(prev);
        next.delete(parentPath);
        return next;
      });

      // Start polling for the file to appear with 10s timeout
      const startTime = Date.now();
      const pollInterval = 500; // Poll every 500ms
      const timeout = 10000; // 10 second timeout

      const pollForFile = async (): Promise<void> => {
        if (Date.now() - startTime > timeout) {
          // Timeout - remove pending creation indicator
          console.log('Timeout waiting for file to appear');
          setPendingCreations((prev) => {
            const next = new Map(prev);
            next.delete(parentPath);
            return next;
          });
          return;
        }

        // Refresh the parent folder
        await fetchFolderMutation.mutateAsync(parentPath);
        await queryClient.refetchQueries({ queryKey: ["workspace-files", MONACO_ROOT_PATH] });

        // Check if file now exists in filesByPath using the ref to get latest state
        const currentFiles = filesByPathRef.current.get(parentPath) || [];
        const fileExists = currentFiles.some(f => f.path === path);

        if (fileExists) {
          // File found! Remove pending creation indicator
          console.log('File found in tree, removing indicator');
          setPendingCreations((prev) => {
            const next = new Map(prev);
            next.delete(parentPath);
            return next;
          });
        } else {
          // File not found yet, poll again
          setTimeout(() => pollForFile(), pollInterval);
        }
      };

      // Start polling
      pollForFile();
    },
    onError: (_, { path }) => {
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      setPendingOperations((prev) => {
        const next = new Map(prev);
        next.delete(parentPath);
        return next;
      });
    },
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (path: string) => {
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      setPendingOperations((prev) => new Map(prev).set(parentPath, 'creating'));

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
    onSuccess: async ({ path }) => {
      const parentPath = path.substring(0, path.lastIndexOf('/'));

      // Clear pending operations
      setPendingOperations((prev) => {
        const next = new Map(prev);
        next.delete(parentPath);
        return next;
      });

      // Start polling for the folder to appear with 10s timeout
      const startTime = Date.now();
      const pollInterval = 500; // Poll every 500ms
      const timeout = 10000; // 10 second timeout

      const pollForFolder = async (): Promise<void> => {
        if (Date.now() - startTime > timeout) {
          // Timeout - remove pending creation indicator
          console.log('Timeout waiting for folder to appear');
          setPendingCreations((prev) => {
            const next = new Map(prev);
            next.delete(parentPath);
            return next;
          });
          return;
        }

        // Refresh the parent folder
        await fetchFolderMutation.mutateAsync(parentPath);
        await queryClient.refetchQueries({ queryKey: ["workspace-files", MONACO_ROOT_PATH] });

        // Check if folder now exists in filesByPath using the ref to get latest state
        const currentFiles = filesByPathRef.current.get(parentPath) || [];
        const folderExists = currentFiles.some(f => f.path === path);

        if (folderExists) {
          // Folder found! Remove pending creation indicator
          console.log('Folder found in tree, removing indicator');
          setPendingCreations((prev) => {
            const next = new Map(prev);
            next.delete(parentPath);
            return next;
          });
        } else {
          // Folder not found yet, poll again
          setTimeout(() => pollForFolder(), pollInterval);
        }
      };

      // Start polling
      pollForFolder();
    },
    onError: (_, path) => {
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      setPendingOperations((prev) => {
        const next = new Map(prev);
        next.delete(parentPath);
        return next;
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ path, isDirectory }: { path: string; isDirectory: boolean }) => {
      setPendingOperations((prev) => new Map(prev).set(path, 'deleting'));

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
    onSuccess: async ({ path }) => {
      const parentPath = path.substring(0, path.lastIndexOf('/'));

      // Always refresh the parent folder (or root if it's the parent)
      // Use mutateAsync to ensure we wait for completion
      await fetchFolderMutation.mutateAsync(parentPath);

      // Also invalidate and refetch the root query to ensure everything is fresh
      await queryClient.refetchQueries({ queryKey: ["workspace-files", MONACO_ROOT_PATH] });

      // Now close the dialog and clear states
      setPendingOperations((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      setDeleteDialogOpen(false);
      setContextMenuPath(null);
    },
    onError: (_, { path }) => {
      setPendingOperations((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
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
    } else if (isSqlFile(node.path) || node.path.endsWith(".ipynb")) {
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
    const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

    // Make sure parent folder is expanded so user can see the indicator
    setExpandedPaths((prev) => new Set(prev).add(targetParentPath));

    // Add to pending creations BEFORE starting the mutation
    setPendingCreations((prev) => {
      const next = new Map(prev);
      next.set(targetParentPath, { type: 'file', name: fileName });
      console.log('Added pending creation for file:', fileName, 'in parent:', targetParentPath, 'Map size:', next.size);
      return next;
    });

    // Close dialog immediately
    setCreateFileDialogOpen(false);
    setNewItemName("");

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
    const folderName = folderPath.substring(folderPath.lastIndexOf('/') + 1);

    // Make sure parent folder is expanded so user can see the indicator
    setExpandedPaths((prev) => new Set(prev).add(targetParentPath));

    // Add to pending creations BEFORE starting the mutation
    setPendingCreations((prev) => {
      const next = new Map(prev);
      next.set(targetParentPath, { type: 'folder', name: folderName });
      console.log('Added pending creation for folder:', folderName, 'in parent:', targetParentPath, 'Map size:', next.size);
      return next;
    });

    // Close dialog immediately
    setCreateFolderDialogOpen(false);
    setNewItemName("");

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
            {/* Show creation indicator for root-level pending items */}
            {pendingCreations.has(MONACO_ROOT_PATH) && (
              <div
                className="flex items-center gap-2 px-2 py-1 text-xs text-green-600"
                style={{ paddingLeft: 4 }}
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="font-medium">
                  Creating {pendingCreations.get(MONACO_ROOT_PATH)?.name}...
                </span>
              </div>
            )}
            {flatTree.map((node) => (
              <React.Fragment key={node.path}>
                <FileTreeItem
                  node={node}
                  isExpanded={expandedPaths.has(node.path)}
                  isSelected={selectedFilePath === node.path}
                  onClick={() => handleFileClick(node)}
                  onNewFile={() => handleNewFile(node.path)}
                  onNewFolder={() => handleNewFolder(node.path)}
                  onDelete={() => handleDelete(node.path)}
                  isDeleting={pendingOperations.get(node.path) === 'deleting'}
                />
                {/* Show loading indicator right after the expanded folder when loading children */}
                {node.isDirectory && expandedPaths.has(node.path) && loadingFolders.has(node.path) && (
                  <div
                    className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${4 + (Math.max(0, node.level) * 12)}px` }}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Loading...</span>
                  </div>
                )}
                {/* Show green creation indicator for pending items */}
                {node.isDirectory && expandedPaths.has(node.path) && pendingCreations.has(node.path) && (
                  <div
                    className="flex items-center gap-2 px-2 py-1 text-xs text-green-600"
                    style={{ paddingLeft: `${4 + (Math.max(0, node.level) * 12)}px` }}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="font-medium">
                      Creating {pendingCreations.get(node.path)?.name}...
                    </span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Create File Dialog */}
      <AlertDialog
        open={createFileDialogOpen}
        onOpenChange={(open) => {
          // Prevent closing while mutation is pending
          if (!createFileMutation.isPending) {
            setCreateFileDialogOpen(open);
          }
        }}
      >
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
            disabled={createFileMutation.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !createFileMutation.isPending) {
                confirmCreateFile();
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createFileMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCreateFile} disabled={createFileMutation.isPending}>
              {createFileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Folder Dialog */}
      <AlertDialog
        open={createFolderDialogOpen}
        onOpenChange={(open) => {
          // Prevent closing while mutation is pending
          if (!createFolderMutation.isPending) {
            setCreateFolderDialogOpen(open);
          }
        }}
      >
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
            disabled={createFolderMutation.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !createFolderMutation.isPending) {
                confirmCreateFolder();
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createFolderMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCreateFolder} disabled={createFolderMutation.isPending}>
              {createFolderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          // Prevent closing while mutation is pending
          if (!deleteMutation.isPending) {
            setDeleteDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
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
  isDeleting?: boolean;
}

function FileTreeItem({
  node,
  isExpanded,
  isSelected,
  onClick,
  onNewFile,
  onNewFolder,
  onDelete,
  isDeleting = false,
}: FileTreeItemProps) {
  // Calculate padding: base 4px + 12px per level for proper indentation
  // Subtract 1 from level since we start from MONACO_ROOT_PATH
  const adjustedLevel = Math.max(0, node.level - 1);
  const paddingLeft = 4 + (adjustedLevel * 12);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`
            flex items-center gap-2 py-1.5 cursor-pointer hover:bg-accent text-sm
            ${isSelected ? "bg-accent" : ""}
            ${isDeleting ? "opacity-50" : ""}
          `}
          style={{ paddingLeft: `${paddingLeft}px`, paddingRight: '4px' }}
          onClick={onClick}
        >
          {isDeleting ? (
            <>
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-red-600" />
              {node.isDirectory ? (
                <Folder className="h-4 w-4 shrink-0 text-yellow-600" />
              ) : (
                <File className="h-4 w-4 shrink-0 text-blue-600" />
              )}
              <span className="truncate">{node.name}</span>
              <span className="ml-auto text-xs text-red-600">Deleting...</span>
            </>
          ) : (
            <>
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
                  <ChevronRight className="h-3 w-3 shrink-0 opacity-0" />
                  <File className="h-4 w-4 shrink-0 text-blue-600" />
                </>
              )}
              <span className="truncate">{node.name}</span>
            </>
          )}
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

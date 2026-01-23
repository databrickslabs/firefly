"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, List, Plus, Upload, Trash2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreadcrumbNav } from "./breadcrumb-nav";
import { VolumeView } from "./volume-view";
import { FileView } from "./file-view";
import type { ViewMode, Volume, FileItem } from "./types";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

interface VolumesResponse {
  volumes: Volume[];
  catalogName: string;
  schemaName: string;
}

interface FilesResponse {
  files: FileItem[];
}

export function FileExplorer() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("icon");
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSelectedIndex = useRef<number | null>(null);

  // Determine if we're at the root (volumes) level
  const isAtRoot = currentPath.length === 0;
  const currentPathString = currentPath.join("/");

  // Clear selection when changing directories
  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
    lastSelectedIndex.current = null;
  }, []);

  // Fetch volumes at root level
  const {
    data: volumesData,
    isLoading: isLoadingVolumes,
    error: volumesError,
  } = useQuery<VolumesResponse>({
    queryKey: ["volumes"],
    queryFn: async () => {
      const response = await fetch("/api/sso-spn/files/volumes");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch volumes");
      }
      return response.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Fetch files when inside a volume
  const {
    data: filesData,
    isLoading: isLoadingFiles,
    error: filesError,
  } = useQuery<FilesResponse>({
    queryKey: ["files", currentPathString],
    queryFn: async () => {
      const response = await fetch(`/api/sso-spn/files/list?path=${encodeURIComponent(currentPathString)}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch files");
      }
      return response.json();
    },
    enabled: !isAtRoot && currentPathString.length > 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const volumes = volumesData?.volumes || [];
  const currentFiles = filesData?.files || [];

  // Create volume mutation with optimistic update
  const createVolumeMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch("/api/sso-spn/files/volumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create volume");
      }
      return response.json();
    },
    onMutate: async (name: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["volumes"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<VolumesResponse>(["volumes"]);

      // Optimistically add the new volume
      if (previousData) {
        const { catalogName, schemaName } = previousData;
        const optimisticVolume: Volume = {
          name,
          fullName: `${catalogName}.${schemaName}.${name}`,
          type: "MANAGED",
          owner: "current_user",
          createdAt: new Date(),
        };
        queryClient.setQueryData<VolumesResponse>(["volumes"], {
          ...previousData,
          volumes: [...previousData.volumes, optimisticVolume],
        });
      }

      // Return context with the snapshot
      return { previousData };
    },
    onError: (_error, _name, context) => {
      // Rollback to the previous value on error
      if (context?.previousData) {
        queryClient.setQueryData(["volumes"], context.previousData);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ["volumes"] });
    },
  });

  // Delete volume mutation with optimistic update
  const deleteVolumeMutation = useMutation({
    mutationFn: async (volumeName: string) => {
      const response = await fetch(`/api/sso-spn/files/volumes/${encodeURIComponent(volumeName)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete volume");
      }
      return response.json();
    },
    onMutate: async (volumeName: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["volumes"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<VolumesResponse>(["volumes"]);

      // Optimistically remove the volume
      if (previousData) {
        queryClient.setQueryData<VolumesResponse>(["volumes"], {
          ...previousData,
          volumes: previousData.volumes.filter((v) => v.name !== volumeName),
        });
      }

      // Return context with the snapshot
      return { previousData };
    },
    onError: (_error, _volumeName, context) => {
      // Rollback to the previous value on error
      if (context?.previousData) {
        queryClient.setQueryData(["volumes"], context.previousData);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ["volumes"] });
    },
  });

  // Create folder mutation with optimistic update
  const createFolderMutation = useMutation({
    mutationFn: async (path: string) => {
      const response = await fetch("/api/sso-spn/files/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create folder");
      }
      return response.json();
    },
    onMutate: async (path: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["files", currentPathString] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<FilesResponse>(["files", currentPathString]);

      // Extract folder name from path
      const folderName = path.split("/").pop() || path;

      // Optimistically add the new folder
      if (previousData) {
        const optimisticFolder: FileItem = {
          name: folderName,
          path: path,
          isDirectory: true,
          modifiedAt: new Date(),
        };
        queryClient.setQueryData<FilesResponse>(["files", currentPathString], {
          ...previousData,
          files: [...previousData.files, optimisticFolder],
        });
      }

      // Return context with the snapshot
      return { previousData };
    },
    onError: (_error, _path, context) => {
      // Rollback to the previous value on error
      if (context?.previousData) {
        queryClient.setQueryData(["files", currentPathString], context.previousData);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ["files", currentPathString] });
    },
  });

  // Delete item mutation (file or folder) with optimistic update
  const deleteItemMutation = useMutation({
    mutationFn: async ({ path, isDirectory }: { path: string; isDirectory: boolean }) => {
      const endpoint = isDirectory ? "/api/sso-spn/files/directory" : "/api/sso-spn/files/file";
      const response = await fetch(`${endpoint}?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete item");
      }
      return response.json();
    },
    onMutate: async ({ path }: { path: string; isDirectory: boolean }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["files", currentPathString] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<FilesResponse>(["files", currentPathString]);

      // Optimistically remove the item
      if (previousData) {
        queryClient.setQueryData<FilesResponse>(["files", currentPathString], {
          ...previousData,
          files: previousData.files.filter((f) => f.path !== path),
        });
      }

      // Return context with the snapshot
      return { previousData };
    },
    onError: (_error, _variables, context) => {
      // Rollback to the previous value on error
      if (context?.previousData) {
        queryClient.setQueryData(["files", currentPathString], context.previousData);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ["files", currentPathString] });
    },
  });

  // Upload file mutation with toast
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", currentPathString);

      const response = await fetch("/api/sso-spn/files/file", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload file");
      }
      return response.json();
    },
    onSuccess: (_data, file) => {
      queryClient.invalidateQueries({ queryKey: ["files", currentPathString] });
      toast.success(`Uploaded "${file.name}" successfully`);
    },
    onError: (error, file) => {
      toast.error(`Failed to upload "${file.name}": ${error.message}`);
    },
  });

  // Multi-file upload mutation
  const uploadMultipleFilesMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const toastId = toast.loading(`Uploading ${files.length} file(s)...`, {
        description: "0% complete",
      });

      const results: { file: File; success: boolean; error?: string }[] = [];
      let completed = 0;

      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("path", currentPathString);

          const response = await fetch("/api/sso-spn/files/file", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            results.push({ file, success: false, error: error.error || "Failed to upload" });
          } else {
            results.push({ file, success: true });
          }
        } catch (err) {
          results.push({ file, success: false, error: String(err) });
        }

        completed++;
        const progress = Math.round((completed / files.length) * 100);
        toast.loading(`Uploading ${files.length} file(s)...`, {
          id: toastId,
          description: `${progress}% complete (${completed}/${files.length})`,
        });
      }

      toast.dismiss(toastId);
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["files", currentPathString] });

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      if (failed === 0) {
        toast.success(`Uploaded ${successful} file(s) successfully`);
      } else if (successful === 0) {
        toast.error(`Failed to upload ${failed} file(s)`);
      } else {
        toast.warning(`Uploaded ${successful} file(s), ${failed} failed`);
      }
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (items: { path: string; isDirectory: boolean }[]) => {
      const toastId = toast.loading(`Deleting ${items.length} item(s)...`, {
        description: "0% complete",
      });

      // Optimistically remove items from cache
      const previousData = queryClient.getQueryData<FilesResponse>(["files", currentPathString]);
      if (previousData) {
        const pathsToDelete = new Set(items.map((i) => i.path));
        queryClient.setQueryData<FilesResponse>(["files", currentPathString], {
          ...previousData,
          files: previousData.files.filter((f) => !pathsToDelete.has(f.path)),
        });
      }

      const results: { path: string; success: boolean; error?: string }[] = [];
      let completed = 0;

      for (const item of items) {
        try {
          const endpoint = item.isDirectory ? "/api/sso-spn/files/directory" : "/api/sso-spn/files/file";
          const response = await fetch(`${endpoint}?path=${encodeURIComponent(item.path)}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            const error = await response.json();
            results.push({ path: item.path, success: false, error: error.error || "Failed to delete" });
          } else {
            results.push({ path: item.path, success: true });
          }
        } catch (err) {
          results.push({ path: item.path, success: false, error: String(err) });
        }

        completed++;
        const progress = Math.round((completed / items.length) * 100);
        toast.loading(`Deleting ${items.length} item(s)...`, {
          id: toastId,
          description: `${progress}% complete (${completed}/${items.length})`,
        });
      }

      toast.dismiss(toastId);
      return { results, previousData };
    },
    onSuccess: ({ results, previousData }) => {
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      if (failed > 0 && previousData) {
        // Restore failed items
        const failedPaths = new Set(results.filter((r) => !r.success).map((r) => r.path));
        const currentData = queryClient.getQueryData<FilesResponse>(["files", currentPathString]);
        const restoredFiles = previousData.files.filter((f) => failedPaths.has(f.path));

        if (currentData) {
          queryClient.setQueryData<FilesResponse>(["files", currentPathString], {
            ...currentData,
            files: [...currentData.files, ...restoredFiles],
          });
        }
      }

      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["files", currentPathString] });

      // Clear selection
      clearSelection();

      if (failed === 0) {
        toast.success(`Deleted ${successful} item(s) successfully`);
      } else if (successful === 0) {
        toast.error(`Failed to delete ${failed} item(s)`);
      } else {
        toast.warning(`Deleted ${successful} item(s), ${failed} failed`);
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["files", currentPathString] });
      toast.error("Failed to delete items");
    },
  });

  // Navigation handlers
  const navigateToPath = useCallback((index: number) => {
    clearSelection();
    if (index === -1) {
      setCurrentPath([]);
    } else {
      setCurrentPath((prev) => prev.slice(0, index + 1));
    }
  }, [clearSelection]);

  const openVolume = useCallback((volumeName: string) => {
    clearSelection();
    setCurrentPath([volumeName]);
  }, [clearSelection]);

  const openFolder = useCallback((path: string) => {
    clearSelection();
    setCurrentPath(path.split("/"));
  }, [clearSelection]);

  // Selection handlers
  const handleItemSelect = useCallback((path: string, event?: React.MouseEvent) => {
    const shiftKey = event?.shiftKey ?? false;
    const ctrlKey = event?.ctrlKey ?? event?.metaKey ?? false;

    setSelectedItems((prev) => {
      const newSet = new Set(prev);

      if (shiftKey && lastSelectedIndex.current !== null) {
        // Shift-click: select range
        const currentIndex = currentFiles.findIndex((f) => f.path === path);
        if (currentIndex !== -1) {
          const start = Math.min(lastSelectedIndex.current, currentIndex);
          const end = Math.max(lastSelectedIndex.current, currentIndex);
          for (let i = start; i <= end; i++) {
            newSet.add(currentFiles[i].path);
          }
        }
      } else if (ctrlKey) {
        // Ctrl/Cmd-click: toggle selection
        if (newSet.has(path)) {
          newSet.delete(path);
        } else {
          newSet.add(path);
          lastSelectedIndex.current = currentFiles.findIndex((f) => f.path === path);
        }
      } else {
        // Regular click: single selection
        newSet.clear();
        newSet.add(path);
        lastSelectedIndex.current = currentFiles.findIndex((f) => f.path === path);
      }

      return newSet;
    });
  }, [currentFiles]);

  const handleSelectAll = useCallback(() => {
    setSelectedItems(new Set(currentFiles.map((f) => f.path)));
  }, [currentFiles]);

  // Volume operations
  const createVolume = useCallback((name: string) => {
    createVolumeMutation.mutate(name);
  }, [createVolumeMutation]);

  const deleteVolume = useCallback((volumeName: string) => {
    deleteVolumeMutation.mutate(volumeName);
  }, [deleteVolumeMutation]);

  // File operations
  const createFolder = useCallback((name: string) => {
    const folderPath = `${currentPathString}/${name}`;
    createFolderMutation.mutate(folderPath);
  }, [currentPathString, createFolderMutation]);

  const uploadFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (files.length === 1) {
        uploadFileMutation.mutate(files[0]);
      } else {
        uploadMultipleFilesMutation.mutate(Array.from(files));
      }
    }
    // Reset input so the same file can be selected again
    e.target.value = "";
  }, [uploadFileMutation, uploadMultipleFilesMutation]);

  const downloadFile = useCallback((path: string) => {
    // Open download in new tab/window
    const url = `/api/sso-spn/files/file?path=${encodeURIComponent(path)}`;
    window.open(url, "_blank");
  }, []);

  const renameItem = useCallback((_path: string, _newName: string) => {
    // Note: Databricks Files API doesn't support rename directly
    // Would need to copy + delete, which we'll skip for now
    console.log("Rename not supported by Databricks Files API");
  }, []);

  const deleteItem = useCallback((path: string) => {
    const item = currentFiles.find((f) => f.path === path);
    if (item) {
      deleteItemMutation.mutate({ path, isDirectory: item.isDirectory });
    }
  }, [currentFiles, deleteItemMutation]);

  const handleBulkDelete = useCallback(() => {
    if (selectedItems.size === 0) return;

    const itemsToDelete = currentFiles
      .filter((f) => selectedItems.has(f.path))
      .map((f) => ({ path: f.path, isDirectory: f.isDirectory }));

    if (itemsToDelete.length > 0) {
      bulkDeleteMutation.mutate(itemsToDelete);
    }
  }, [selectedItems, currentFiles, bulkDeleteMutation]);

  const isLoading = isAtRoot ? isLoadingVolumes : isLoadingFiles;
  const error = isAtRoot ? volumesError : filesError;
  const isMutating = createVolumeMutation.isPending ||
    deleteVolumeMutation.isPending ||
    createFolderMutation.isPending ||
    deleteItemMutation.isPending ||
    uploadFileMutation.isPending ||
    uploadMultipleFilesMutation.isPending ||
    bulkDeleteMutation.isPending;

  return (
    <div className="flex flex-col h-full border rounded-lg bg-background">
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <BreadcrumbNav path={currentPath} onNavigate={navigateToPath} />

          {/* Selection indicator */}
          {!isAtRoot && selectedItems.size > 0 && (
            <div className="flex items-center gap-2 pl-3 border-l">
              <span className="text-sm text-muted-foreground">
                {selectedItems.size} item{selectedItems.size > 1 ? "s" : ""} selected
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={clearSelection}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk delete button when items selected */}
          {!isAtRoot && selectedItems.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete ({selectedItems.size})
            </Button>
          )}

          {!isAtRoot && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={uploadFile}
                disabled={isMutating}
              >
                {uploadFileMutation.isPending || uploadMultipleFilesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Trigger create folder dialog via a simple prompt for now
                  const name = window.prompt("Enter folder name:");
                  if (name) {
                    createFolder(name);
                  }
                }}
                disabled={isMutating}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Folder
              </Button>
            </>
          )}

          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "icon" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setViewMode("icon")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner className="h-8 w-8 text-emerald-600" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p>Error loading {isAtRoot ? "volumes" : "files"}</p>
            <p className="text-sm">{(error as Error).message}</p>
          </div>
        ) : isAtRoot ? (
          <VolumeView
            volumes={volumes}
            viewMode={viewMode}
            onVolumeOpen={openVolume}
            onVolumeCreate={createVolume}
            onVolumeDelete={deleteVolume}
            isLoading={isMutating}
            isCreating={createVolumeMutation.isPending}
            isDeleting={deleteVolumeMutation.isPending}
            createError={createVolumeMutation.error?.message}
            deleteError={deleteVolumeMutation.error?.message}
            onClearCreateError={createVolumeMutation.reset}
            onClearDeleteError={deleteVolumeMutation.reset}
          />
        ) : (
          <FileView
            files={currentFiles}
            viewMode={viewMode}
            onFolderOpen={openFolder}
            onFolderCreate={createFolder}
            onFileUpload={uploadFile}
            onFileDownload={downloadFile}
            onItemRename={renameItem}
            onItemDelete={deleteItem}
            isLoading={isMutating}
            isCreatingFolder={createFolderMutation.isPending}
            isDeleting={deleteItemMutation.isPending}
            isUploading={uploadFileMutation.isPending}
            createFolderError={createFolderMutation.error?.message}
            deleteError={deleteItemMutation.error?.message}
            uploadError={uploadFileMutation.error?.message}
            onClearCreateFolderError={createFolderMutation.reset}
            onClearDeleteError={deleteItemMutation.reset}
            onClearUploadError={uploadFileMutation.reset}
            selectedItems={selectedItems}
            onItemSelect={handleItemSelect}
            onSelectAll={handleSelectAll}
            onClearSelection={clearSelection}
          />
        )}
      </div>
    </div>
  );
}

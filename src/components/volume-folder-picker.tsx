"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Home,
  HardDrive,
  Folder,
  FolderOpen,
  FolderPlus,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

interface Volume {
  name: string;
  fullName: string;
  type: string;
}

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface VolumeFolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  currentPath?: string;
  title?: string;
  description?: string;
}

export function VolumeFolderPicker({
  open,
  onOpenChange,
  onSelect,
  currentPath,
  title = "Select Folder",
  description = "Browse and select a folder for file backup",
}: VolumeFolderPickerProps) {
  const queryClient = useQueryClient();

  // Parse initial path to set starting navigation
  const parseInitialPath = useCallback((path?: string): string[] => {
    if (!path) return [];
    // Path format: /Volumes/catalog/schema/volume/folder/subfolder
    // We want: [volume, folder, subfolder]
    const match = path.match(/^\/Volumes\/[^/]+\/[^/]+\/(.+)$/);
    if (match) {
      return match[1].split("/").filter(Boolean);
    }
    return [];
  }, []);

  const [navigationPath, setNavigationPath] = useState<string[]>(() =>
    parseInitialPath(currentPath)
  );
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Determine if we're at the root (volumes) level
  const isAtRoot = navigationPath.length === 0;
  const currentPathString = navigationPath.join("/");

  // Fetch volumes at root level
  const {
    data: volumesData,
    isLoading: isLoadingVolumes,
    error: volumesError,
  } = useQuery<{ volumes: Volume[]; catalogName: string; schemaName: string }>({
    queryKey: ["volumes"],
    queryFn: async () => {
      const response = await fetch("/api/sso-spn/files/volumes");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch volumes");
      }
      return response.json();
    },
    enabled: open,
    staleTime: 30000,
  });

  // Fetch files when inside a volume
  const {
    data: filesData,
    isLoading: isLoadingFiles,
    error: filesError,
  } = useQuery<{ files: FileItem[] }>({
    queryKey: ["files", currentPathString],
    queryFn: async () => {
      const response = await fetch(
        `/api/sso-spn/files/list?path=${encodeURIComponent(currentPathString)}`
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch files");
      }
      return response.json();
    },
    enabled: open && !isAtRoot && currentPathString.length > 0,
    staleTime: 0,
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (folderPath: string) => {
      const response = await fetch("/api/sso-spn/files/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: folderPath }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create folder");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", currentPathString] });
      setIsCreatingFolder(false);
      setNewFolderName("");
    },
  });

  const volumes = volumesData?.volumes || [];
  const catalogName = volumesData?.catalogName || "";
  const schemaName = volumesData?.schemaName || "";
  const folders = (filesData?.files || []).filter((f) => f.isDirectory);

  // Navigation handlers
  const navigateToPath = useCallback((index: number) => {
    if (index === -1) {
      setNavigationPath([]);
    } else {
      setNavigationPath((prev) => prev.slice(0, index + 1));
    }
    setIsCreatingFolder(false);
    setNewFolderName("");
  }, []);

  const openVolume = useCallback((volumeName: string) => {
    setNavigationPath([volumeName]);
    setIsCreatingFolder(false);
    setNewFolderName("");
  }, []);

  const openFolder = useCallback((path: string) => {
    setNavigationPath(path.split("/"));
    setIsCreatingFolder(false);
    setNewFolderName("");
  }, []);

  // Build the full volume path
  const getFullPath = useCallback(() => {
    if (navigationPath.length === 0) return "";
    return `/Volumes/${catalogName}/${schemaName}/${navigationPath.join("/")}`;
  }, [navigationPath, catalogName, schemaName]);

  const handleSelect = useCallback(() => {
    const fullPath = getFullPath();
    if (fullPath) {
      onSelect(fullPath);
      onOpenChange(false);
    }
  }, [getFullPath, onSelect, onOpenChange]);

  const handleClear = useCallback(() => {
    onSelect("");
    onOpenChange(false);
  }, [onSelect, onOpenChange]);

  const handleCreateFolder = useCallback(() => {
    if (!newFolderName.trim()) return;
    const folderPath = `${currentPathString}/${newFolderName.trim()}`;
    createFolderMutation.mutate(folderPath);
  }, [currentPathString, newFolderName, createFolderMutation]);

  const isLoading = isAtRoot ? isLoadingVolumes : isLoadingFiles;
  const error = isAtRoot ? volumesError : filesError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Toolbar with Breadcrumb and New Folder */}
        <div className="flex items-center justify-between gap-4 py-2 border-b">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
            <button
              onClick={() => navigateToPath(-1)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors flex-shrink-0",
                navigationPath.length === 0
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              <Home className="h-4 w-4" />
              <span>Volumes</span>
            </button>

            {navigationPath.map((segment, index) => (
              <div key={index} className="flex items-center gap-1 flex-shrink-0">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <button
                  onClick={() => navigateToPath(index)}
                  className={cn(
                    "px-2 py-1 rounded hover:bg-muted transition-colors truncate max-w-[150px]",
                    index === navigationPath.length - 1
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  )}
                  title={segment}
                >
                  {segment}
                </button>
              </div>
            ))}
          </nav>

          {/* New Folder Button */}
          {!isAtRoot && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreatingFolder(true)}
              disabled={isCreatingFolder}
              className="flex-shrink-0"
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </Button>
          )}
        </div>

        {/* Current Selection Display */}
        {navigationPath.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md text-sm">
            <span className="text-muted-foreground flex-shrink-0">Selected:</span>
            <code className="font-mono text-xs truncate">{getFullPath()}</code>
          </div>
        )}

        {/* New Folder Input */}
        {isCreatingFolder && (
          <div className="flex items-center gap-2 p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/20">
            <FolderPlus className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <Input
              placeholder="Enter folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") {
                  setIsCreatingFolder(false);
                  setNewFolderName("");
                }
              }}
              autoFocus
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
            >
              {createFolderMutation.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                "Create"
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto min-h-[350px] border rounded-lg relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner className="h-8 w-8 text-emerald-600" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p>Error loading {isAtRoot ? "volumes" : "folders"}</p>
              <p className="text-sm text-center">
                {(error as Error).message}
              </p>
            </div>
          ) : isAtRoot ? (
            // Volume List View
            <div className="divide-y">
              {volumes.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  No volumes found
                </div>
              ) : (
                volumes.map((volume) => (
                  <button
                    key={volume.name}
                    onClick={() => openVolume(volume.name)}
                    className="flex items-center gap-4 w-full px-4 py-3 hover:bg-muted transition-colors text-left"
                  >
                    <HardDrive className="h-6 w-6 text-emerald-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{volume.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {volume.fullName}
                      </p>
                    </div>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded flex-shrink-0",
                      volume.type === "MANAGED"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    )}>
                      {volume.type}
                    </span>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          ) : (
            // Folder List View
            <div className="divide-y">
              {folders.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No subfolders in this directory</p>
                  <p className="text-sm mt-1">
                    You can select this folder or create a new one
                  </p>
                </div>
              ) : (
                folders.map((folder) => (
                  <button
                    key={folder.path}
                    onClick={() => openFolder(folder.path)}
                    className="flex items-center gap-4 w-full px-4 py-3 hover:bg-muted transition-colors text-left"
                  >
                    <Folder className="h-6 w-6 text-amber-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{folder.name}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {createFolderMutation.isError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {createFolderMutation.error instanceof Error
              ? createFolderMutation.error.message
              : "Failed to create folder"}
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button variant="outline" onClick={handleClear}>
            Clear Selection
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSelect}
              disabled={navigationPath.length === 0}
            >
              <Check className="h-4 w-4 mr-2" />
              Select This Folder
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

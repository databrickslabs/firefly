"use client";

import { useState, useEffect, useRef } from "react";
import { HardDrive, MoreVertical, Trash2, FolderOpen, Plus, Loader2, AlertCircle } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Volume, ViewMode } from "./types";

interface VolumeViewProps {
  volumes: Volume[];
  viewMode: ViewMode;
  onVolumeOpen: (volumeName: string) => void;
  onVolumeCreate: (name: string) => void;
  onVolumeDelete: (volumeName: string) => void;
  isLoading?: boolean;
  isCreating?: boolean;
  isDeleting?: boolean;
  createError?: string;
  deleteError?: string;
  onClearCreateError?: () => void;
  onClearDeleteError?: () => void;
}

export function VolumeView({
  volumes,
  viewMode,
  onVolumeOpen,
  onVolumeCreate,
  onVolumeDelete,
  isLoading = false,
  isCreating = false,
  isDeleting = false,
  createError,
  deleteError,
  onClearCreateError,
  onClearDeleteError,
}: VolumeViewProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [newVolumeName, setNewVolumeName] = useState("");

  // Track previous loading states to detect completion
  const prevIsCreating = useRef(isCreating);
  const prevIsDeleting = useRef(isDeleting);

  // Close dialogs when operations complete successfully (no error)
  useEffect(() => {
    // If isCreating went from true to false AND no error, operation completed successfully
    if (prevIsCreating.current && !isCreating && createDialogOpen && !createError) {
      setCreateDialogOpen(false);
      setNewVolumeName("");
    }
    prevIsCreating.current = isCreating;
  }, [isCreating, createDialogOpen, createError]);

  useEffect(() => {
    // If isDeleting went from true to false AND no error, operation completed successfully
    if (prevIsDeleting.current && !isDeleting && deleteDialogOpen && !deleteError) {
      setDeleteDialogOpen(false);
      setSelectedVolume(null);
    }
    prevIsDeleting.current = isDeleting;
  }, [isDeleting, deleteDialogOpen, deleteError]);

  // Clear errors when user starts typing
  const handleVolumeNameChange = (value: string) => {
    setNewVolumeName(value);
    if (createError) {
      onClearCreateError?.();
    }
  };

  // Handle dialog close - clear errors
  const handleCreateDialogOpenChange = (open: boolean) => {
    if (!isCreating) {
      setCreateDialogOpen(open);
      if (!open) {
        setNewVolumeName("");
        onClearCreateError?.();
      }
    }
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (!isDeleting) {
      setDeleteDialogOpen(open);
      if (!open) {
        setSelectedVolume(null);
        onClearDeleteError?.();
      }
    }
  };

  const handleCreate = () => {
    if (newVolumeName.trim() && !isCreating) {
      onVolumeCreate(newVolumeName.trim());
      // Don't close dialog here - it will close when isCreating becomes false
    }
  };

  const handleDelete = () => {
    if (selectedVolume && !isDeleting) {
      onVolumeDelete(selectedVolume);
      // Don't close dialog here - it will close when isDeleting becomes false
    }
  };

  const openDeleteDialog = (volumeName: string) => {
    setSelectedVolume(volumeName);
    setDeleteDialogOpen(true);
  };

  // Background context menu for creating volumes
  const BackgroundContextMenu = ({ children }: { children: React.ReactNode }) => (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="h-full">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Volume
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  // Volume context menu
  const VolumeContextMenu = ({
    volume,
    children,
  }: {
    volume: Volume;
    children: React.ReactNode;
  }) => (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onVolumeOpen(volume.name)}>
          <FolderOpen className="h-4 w-4 mr-2" />
          Open
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => openDeleteDialog(volume.name)}
          className="text-red-600 focus:text-red-600"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Volume
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  if (viewMode === "icon") {
    return (
      <div className="h-full flex flex-col">
        <BackgroundContextMenu>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4">
            {volumes.map((volume) => (
              <VolumeContextMenu key={volume.name} volume={volume}>
                <div
                  className="relative flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-muted cursor-pointer transition-colors group"
                  onClick={() => onVolumeOpen(volume.name)}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onVolumeOpen(volume.name)}>
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog(volume.name)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Volume
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="relative">
                    <HardDrive className="h-16 w-16 text-emerald-600" />
                    <span
                      className={cn(
                        "absolute -bottom-1 -right-1 text-[10px] px-1.5 py-0.5 rounded",
                        volume.type === "MANAGED"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700"
                      )}
                    >
                      {volume.type}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-center truncate w-full">
                    {volume.name}
                  </span>
                </div>
              </VolumeContextMenu>
            ))}
          </div>
        </BackgroundContextMenu>

        {/* Create Volume Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Volume</DialogTitle>
              <DialogDescription>
                Enter a name for the new volume. Volume names must be unique and contain only letters, numbers, and underscores.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <Input
                placeholder="Volume name"
                value={newVolumeName}
                onChange={(e) => handleVolumeNameChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isCreating && handleCreate()}
                disabled={isCreating}
                className={createError ? "border-red-500" : ""}
              />
              {createError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{createError}</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleCreateDialogOpenChange(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!newVolumeName.trim() || isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Volume Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Volume</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the volume &quot;{selectedVolume}&quot;? This action cannot be undone and all files within the volume will be permanently deleted.
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <div className="flex items-center gap-2 text-sm text-red-600 py-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleDeleteDialogOpenChange(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="h-full flex flex-col">
      <BackgroundContextMenu>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {volumes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No volumes found. Right-click to create a new volume.
                </TableCell>
              </TableRow>
            ) : (
              volumes.map((volume) => (
                <VolumeContextMenu key={volume.name} volume={volume}>
                  <TableRow
                    className="cursor-pointer"
                    onDoubleClick={() => onVolumeOpen(volume.name)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium">{volume.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded",
                          volume.type === "MANAGED"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        )}
                      >
                        {volume.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{volume.owner}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {volume.createdAt.toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onVolumeOpen(volume.name)}>
                            <FolderOpen className="h-4 w-4 mr-2" />
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openDeleteDialog(volume.name)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Volume
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                </VolumeContextMenu>
              ))
            )}
          </TableBody>
        </Table>
      </BackgroundContextMenu>

      {/* Create Volume Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Volume</DialogTitle>
            <DialogDescription>
              Enter a name for the new volume. Volume names must be unique and contain only letters, numbers, and underscores.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Input
              placeholder="Volume name"
              value={newVolumeName}
              onChange={(e) => handleVolumeNameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isCreating && handleCreate()}
              disabled={isCreating}
              className={createError ? "border-red-500" : ""}
            />
            {createError && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{createError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateDialogOpenChange(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newVolumeName.trim() || isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Volume Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Volume</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the volume &quot;{selectedVolume}&quot;? This action cannot be undone and all files within the volume will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="flex items-center gap-2 text-sm text-red-600 py-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDeleteDialogOpenChange(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

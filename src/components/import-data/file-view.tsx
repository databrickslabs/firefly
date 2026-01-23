"use client";

import { useState, useEffect, useRef } from "react";
import {
  Folder,
  File,
  FileSpreadsheet,
  FileJson,
  FileText,
  MoreVertical,
  Trash2,
  FolderOpen,
  Download,
  Pencil,
  Upload,
  FolderPlus,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { FileItem, ViewMode } from "./types";
import { formatFileSize } from "./types";

interface FileViewProps {
  files: FileItem[];
  viewMode: ViewMode;
  onFolderOpen: (path: string) => void;
  onFolderCreate: (name: string) => void;
  onFileUpload: () => void;
  onFileDownload: (path: string) => void;
  onItemRename: (path: string, newName: string) => void;
  onItemDelete: (path: string) => void;
  isLoading?: boolean;
  isCreatingFolder?: boolean;
  isDeleting?: boolean;
  isUploading?: boolean;
  createFolderError?: string;
  deleteError?: string;
  uploadError?: string;
  onClearCreateFolderError?: () => void;
  onClearDeleteError?: () => void;
  onClearUploadError?: () => void;
  // Selection props
  selectedItems?: Set<string>;
  onItemSelect?: (path: string, event?: React.MouseEvent) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
}

function getFileIcon(item: FileItem) {
  if (item.isDirectory) {
    return <Folder className="h-16 w-16 text-amber-500" />;
  }

  switch (item.type) {
    case "csv":
    case "xlsx":
      return <FileSpreadsheet className="h-16 w-16 text-green-600" />;
    case "json":
      return <FileJson className="h-16 w-16 text-yellow-600" />;
    case "parquet":
      return <File className="h-16 w-16 text-purple-600" />;
    case "pdf":
      return <FileText className="h-16 w-16 text-red-600" />;
    default:
      return <File className="h-16 w-16 text-gray-500" />;
  }
}

function getSmallFileIcon(item: FileItem) {
  if (item.isDirectory) {
    return <Folder className="h-4 w-4 text-amber-500" />;
  }

  switch (item.type) {
    case "csv":
    case "xlsx":
      return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
    case "json":
      return <FileJson className="h-4 w-4 text-yellow-600" />;
    case "parquet":
      return <File className="h-4 w-4 text-purple-600" />;
    case "pdf":
      return <FileText className="h-4 w-4 text-red-600" />;
    default:
      return <File className="h-4 w-4 text-gray-500" />;
  }
}

export function FileView({
  files,
  viewMode,
  onFolderOpen,
  onFolderCreate,
  onFileUpload,
  onFileDownload,
  onItemRename,
  onItemDelete,
  isLoading = false,
  isCreatingFolder = false,
  isDeleting = false,
  isUploading = false,
  createFolderError,
  deleteError,
  uploadError,
  onClearCreateFolderError,
  onClearDeleteError,
  onClearUploadError,
  selectedItems = new Set(),
  onItemSelect,
  onSelectAll,
  onClearSelection,
}: FileViewProps) {
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newName, setNewName] = useState("");

  // Track previous loading states to detect completion
  const prevIsCreatingFolder = useRef(isCreatingFolder);
  const prevIsDeleting = useRef(isDeleting);

  // Close dialogs when operations complete successfully (no error)
  useEffect(() => {
    if (prevIsCreatingFolder.current && !isCreatingFolder && createFolderDialogOpen && !createFolderError) {
      setCreateFolderDialogOpen(false);
      setNewFolderName("");
    }
    prevIsCreatingFolder.current = isCreatingFolder;
  }, [isCreatingFolder, createFolderDialogOpen, createFolderError]);

  useEffect(() => {
    if (prevIsDeleting.current && !isDeleting && deleteDialogOpen && !deleteError) {
      setDeleteDialogOpen(false);
      setSelectedItem(null);
    }
    prevIsDeleting.current = isDeleting;
  }, [isDeleting, deleteDialogOpen, deleteError]);

  // Clear errors when user starts typing
  const handleFolderNameChange = (value: string) => {
    setNewFolderName(value);
    if (createFolderError) {
      onClearCreateFolderError?.();
    }
  };

  // Handle dialog close - clear errors
  const handleCreateFolderDialogOpenChange = (open: boolean) => {
    if (!isCreatingFolder) {
      setCreateFolderDialogOpen(open);
      if (!open) {
        setNewFolderName("");
        onClearCreateFolderError?.();
      }
    }
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (!isDeleting) {
      setDeleteDialogOpen(open);
      if (!open) {
        setSelectedItem(null);
        onClearDeleteError?.();
      }
    }
  };

  // Suppress unused variable warnings - these are kept for future use
  void isLoading;
  void isUploading;
  void uploadError;
  void onClearUploadError;

  // Handle item click - single click selects, double click opens
  const handleItemClick = (item: FileItem, event: React.MouseEvent) => {
    // If ctrl/cmd or shift is held, always just select
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      onItemSelect?.(item.path, event);
      return;
    }
    // Single click selects (without modifier keys)
    onItemSelect?.(item.path, event);
  };

  const handleItemDoubleClick = (item: FileItem) => {
    if (item.isDirectory) {
      onFolderOpen(item.path);
    } else {
      onFileDownload(item.path);
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim() && !isCreatingFolder) {
      onFolderCreate(newFolderName.trim());
      // Don't close dialog here - it will close when isCreatingFolder becomes false
    }
  };

  const handleRename = () => {
    if (selectedItem && newName.trim()) {
      onItemRename(selectedItem.path, newName.trim());
      setSelectedItem(null);
      setNewName("");
      setRenameDialogOpen(false);
    }
  };

  const handleDelete = () => {
    if (selectedItem && !isDeleting) {
      onItemDelete(selectedItem.path);
      // Don't close dialog here - it will close when isDeleting becomes false
    }
  };

  const openRenameDialog = (item: FileItem) => {
    setSelectedItem(item);
    setNewName(item.name);
    setRenameDialogOpen(true);
  };

  const openDeleteDialog = (item: FileItem) => {
    setSelectedItem(item);
    setDeleteDialogOpen(true);
  };

  // Background context menu
  const BackgroundContextMenu = ({ children }: { children: React.ReactNode }) => (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="h-full">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => setCreateFolderDialogOpen(true)}>
          <FolderPlus className="h-4 w-4 mr-2" />
          New Folder
        </ContextMenuItem>
        <ContextMenuItem onClick={onFileUpload}>
          <Upload className="h-4 w-4 mr-2" />
          Upload File
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  // Item context menu
  const ItemContextMenu = ({
    item,
    children,
  }: {
    item: FileItem;
    children: React.ReactNode;
  }) => (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {item.isDirectory ? (
          <ContextMenuItem onClick={() => onFolderOpen(item.path)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Open
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={() => onFileDownload(item.path)}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => openRenameDialog(item)}>
          <Pencil className="h-4 w-4 mr-2" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => openDeleteDialog(item)}
          className="text-red-600 focus:text-red-600"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  if (viewMode === "icon") {
    return (
      <div className="h-full flex flex-col">
        <BackgroundContextMenu>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4">
            {files.map((item) => {
              const isSelected = selectedItems.has(item.path);
              return (
                <ItemContextMenu key={item.path} item={item}>
                  <div
                    className={cn(
                      "relative flex flex-col items-center gap-2 p-4 rounded-lg cursor-pointer transition-colors group",
                      isSelected
                        ? "bg-primary/10 ring-2 ring-primary"
                        : "hover:bg-muted"
                    )}
                    onClick={(e) => handleItemClick(item, e)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                  >
                    {/* Checkbox for selection */}
                    <div
                      className={cn(
                        "absolute top-2 left-2 transition-opacity",
                        isSelected || selectedItems.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onItemSelect?.(item.path)}
                      />
                    </div>

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
                        {item.isDirectory ? (
                          <DropdownMenuItem onClick={() => onFolderOpen(item.path)}>
                            <FolderOpen className="h-4 w-4 mr-2" />
                            Open
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => onFileDownload(item.path)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openRenameDialog(item)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openDeleteDialog(item)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {getFileIcon(item)}
                    <span className="text-sm font-medium text-center truncate w-full">
                      {item.name}
                    </span>
                    {!item.isDirectory && item.size && (
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(item.size)}
                      </span>
                    )}
                  </div>
                </ItemContextMenu>
              );
            })}
          </div>
        </BackgroundContextMenu>

        {/* Create Folder Dialog */}
        <Dialog open={createFolderDialogOpen} onOpenChange={handleCreateFolderDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Folder</DialogTitle>
              <DialogDescription>
                Enter a name for the new folder.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <Input
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => handleFolderNameChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isCreatingFolder && handleCreateFolder()}
                disabled={isCreatingFolder}
                className={createFolderError ? "border-red-500" : ""}
              />
              {createFolderError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{createFolderError}</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleCreateFolderDialogOpenChange(false)} disabled={isCreatingFolder}>
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isCreatingFolder}>
                {isCreatingFolder ? (
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

        {/* Rename Dialog */}
        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename {selectedItem?.isDirectory ? "Folder" : "File"}</DialogTitle>
              <DialogDescription>
                Enter a new name for &quot;{selectedItem?.name}&quot;.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="New name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleRename} disabled={!newName.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {selectedItem?.isDirectory ? "Folder" : "File"}</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{selectedItem?.name}&quot;?
                {selectedItem?.isDirectory && " All contents will be permanently deleted."}
                This action cannot be undone.
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
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={files.length > 0 && selectedItems.size === files.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onSelectAll?.();
                    } else {
                      onClearSelection?.();
                    }
                  }}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Modified</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  This folder is empty. Right-click to create a folder or upload a file.
                </TableCell>
              </TableRow>
            ) : (
              files.map((item) => {
                const isSelected = selectedItems.has(item.path);
                return (
                  <ItemContextMenu key={item.path} item={item}>
                    <TableRow
                      className={cn(
                        "cursor-pointer",
                        isSelected && "bg-primary/10"
                      )}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onItemSelect?.(item.path)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getSmallFileIcon(item)}
                          <span className="font-medium">{item.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.isDirectory ? "Folder" : item.type?.toUpperCase() || "File"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.isDirectory ? "-" : item.size ? formatFileSize(item.size) : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.modifiedAt?.toLocaleDateString() || "-"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {item.isDirectory ? (
                              <DropdownMenuItem onClick={() => onFolderOpen(item.path)}>
                                <FolderOpen className="h-4 w-4 mr-2" />
                                Open
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => onFileDownload(item.path)}>
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openRenameDialog(item)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openDeleteDialog(item)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  </ItemContextMenu>
                );
              })
            )}
          </TableBody>
        </Table>
      </BackgroundContextMenu>

      {/* Create Folder Dialog */}
      <Dialog open={createFolderDialogOpen} onOpenChange={handleCreateFolderDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => handleFolderNameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isCreatingFolder && handleCreateFolder()}
              disabled={isCreatingFolder}
              className={createFolderError ? "border-red-500" : ""}
            />
            {createFolderError && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{createFolderError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateFolderDialogOpenChange(false)} disabled={isCreatingFolder}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isCreatingFolder}>
              {isCreatingFolder ? (
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

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {selectedItem?.isDirectory ? "Folder" : "File"}</DialogTitle>
            <DialogDescription>
              Enter a new name for &quot;{selectedItem?.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="New name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedItem?.isDirectory ? "Folder" : "File"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedItem?.name}&quot;?
              {selectedItem?.isDirectory && " All contents will be permanently deleted."}
              This action cannot be undone.
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

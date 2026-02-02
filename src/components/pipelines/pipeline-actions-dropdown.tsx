"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Share2, Copy, Trash2, Type, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PipelineListItem } from "./types";

interface PipelineActionsDropdownProps {
  pipeline: PipelineListItem;
  onEdit: () => void;
  onShare: () => void;
  onClone: () => void;
  onDelete: () => void;
  onRename: (newName: string) => Promise<void>;
}

export function PipelineActionsDropdown({
  pipeline,
  onEdit,
  onShare,
  onClone,
  onDelete,
  onRename,
}: PipelineActionsDropdownProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false);
  const [newName, setNewName] = React.useState(pipeline.name);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const isOwner = pipeline.accessType === 'owner';
  const canEdit = isOwner || pipeline.permissionLevel === 'CAN_EDIT';

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    onDelete();
    setDeleteDialogOpen(false);
  };

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNewName(pipeline.name);
    setRenameDialogOpen(true);
  };

  const handleConfirmRename = async () => {
    const trimmedName = newName.trim();
    if (trimmedName && trimmedName !== pipeline.name) {
      setIsRenaming(true);
      try {
        await onRename(trimmedName);
        setRenameDialogOpen(false);
      } finally {
        setIsRenaming(false);
      }
    } else {
      setRenameDialogOpen(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirmRename();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            {canEdit ? 'Edit' : 'View'}
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem onClick={handleRename}>
              <Type className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
          )}
          {isOwner && (
            <DropdownMenuItem onClick={onShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onClone}>
            <Copy className="h-4 w-4 mr-2" />
            Clone
          </DropdownMenuItem>
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={(open) => !isRenaming && setRenameDialogOpen(open)}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Rename Pipeline</DialogTitle>
            <DialogDescription>
              Enter a new name for this pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="pipeline-name" className="sr-only">
              Pipeline Name
            </Label>
            <Input
              id="pipeline-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              placeholder="Pipeline name"
              autoFocus
              disabled={isRenaming}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)} disabled={isRenaming}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmRename}
              disabled={!newName.trim() || newName.trim() === pipeline.name || isRenaming}
            >
              {isRenaming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Renaming...
                </>
              ) : (
                "Rename"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pipeline</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{pipeline.name}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

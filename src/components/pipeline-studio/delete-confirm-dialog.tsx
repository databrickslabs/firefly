"use client";

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
import { AlertTriangle } from "lucide-react";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeCount: number;
  nodeLabels: string[];
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  nodeCount,
  nodeLabels,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const displayLabels = nodeLabels.slice(0, 5);
  const remainingCount = nodeLabels.length - displayLabels.length;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Delete {nodeCount} node{nodeCount !== 1 ? "s" : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This action cannot be undone. The following node
                {nodeCount !== 1 ? "s" : ""} and their connections will be
                permanently deleted:
              </p>
              <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                {displayLabels.map((label, index) => (
                  <li key={index} className="truncate">
                    {label}
                  </li>
                ))}
                {remainingCount > 0 && (
                  <li className="text-slate-400">
                    ...and {remainingCount} more
                  </li>
                )}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

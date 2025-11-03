"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

interface ShareNotebookModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notebookPath: string;
  notebookName: string;
}

interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface NotebookShareInfo {
  id: string;
  sharedWithUserId: string;
  sharedWithName: string;
  sharedWithEmail: string;
  permissionLevel: string;
  sharedAt: string;
}

type PermissionLevel = "CAN_READ" | "CAN_EDIT";

export function ShareNotebookModal({
  open,
  onOpenChange,
  notebookPath,
  notebookName,
}: ShareNotebookModalProps) {
  const queryClient = useQueryClient();
  const [selectedUserEmail, setSelectedUserEmail] = React.useState<string>("");
  const [permissionLevel, setPermissionLevel] = React.useState<PermissionLevel>("CAN_READ");

  // Fetch organization users
  const { data: usersData, isLoading: isLoadingUsers } = useQuery<{ users: OrgUser[] }>({
    queryKey: ["organization-users"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/workspace/organization-users");
      if (!response.ok) {
        throw new Error("Failed to fetch organization users");
      }
      return response.json();
    },
    enabled: open,
    staleTime: 60000, // Cache for 1 minute
  });

  // Fetch existing shares for this notebook
  const { data: sharesData, isLoading: isLoadingShares } = useQuery<{ shares: NotebookShareInfo[] }>({
    queryKey: ["notebook-shares", notebookPath],
    queryFn: async () => {
      const response = await fetch(
        `/api/databricks/workspace/notebook-shares?workspacePath=${encodeURIComponent(notebookPath)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch notebook shares");
      }
      return response.json();
    },
    enabled: open && !!notebookPath,
    staleTime: 0,
  });

  // Share notebook mutation
  const shareNotebookMutation = useMutation({
    mutationFn: async ({
      workspacePath,
      sharedWithEmail,
      permissionLevel,
    }: {
      workspacePath: string;
      sharedWithEmail: string;
      permissionLevel: PermissionLevel;
    }) => {
      const response = await fetch("/api/databricks/workspace/share-notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspacePath,
          sharedWithEmail,
          permissionLevel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to share notebook");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Notebook shared successfully");
      queryClient.invalidateQueries({ queryKey: ["shared-notebooks"] });
      queryClient.invalidateQueries({ queryKey: ["notebook-shares", notebookPath] });
      setSelectedUserEmail("");
      setPermissionLevel("CAN_READ");
    },
    onError: (error: Error) => {
      toast.error(`Failed to share notebook: ${error.message}`);
    },
  });

  // Remove share mutation
  const removeShareMutation = useMutation({
    mutationFn: async (shareId: string) => {
      const response = await fetch("/api/databricks/workspace/notebook-shares", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove share");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Access removed successfully");
      queryClient.invalidateQueries({ queryKey: ["shared-notebooks"] });
      queryClient.invalidateQueries({ queryKey: ["notebook-shares", notebookPath] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove access: ${error.message}`);
    },
  });

  // Update permission mutation with optimistic updates
  const updatePermissionMutation = useMutation({
    mutationFn: async ({
      sharedWithEmail,
      newPermissionLevel,
    }: {
      sharedWithEmail: string;
      newPermissionLevel: PermissionLevel;
    }) => {
      const response = await fetch("/api/databricks/workspace/share-notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspacePath: notebookPath,
          sharedWithEmail,
          permissionLevel: newPermissionLevel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update permission");
      }

      return response.json();
    },
    onMutate: async ({ sharedWithEmail, newPermissionLevel }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["notebook-shares", notebookPath] });

      // Snapshot the previous value
      const previousShares = queryClient.getQueryData<{ shares: NotebookShareInfo[] }>(["notebook-shares", notebookPath]);

      // Optimistically update to the new value
      if (previousShares) {
        queryClient.setQueryData<{ shares: NotebookShareInfo[] }>(["notebook-shares", notebookPath], {
          ...previousShares,
          shares: previousShares.shares.map((share) =>
            share.sharedWithEmail === sharedWithEmail
              ? { ...share, permissionLevel: newPermissionLevel }
              : share
          ),
        });
      }

      // Return a context object with the snapshotted value
      return { previousShares };
    },
    onError: (error: Error, _variables, context) => {
      // Rollback to the previous value on error
      if (context?.previousShares) {
        queryClient.setQueryData(["notebook-shares", notebookPath], context.previousShares);
      }
      toast.error(`Failed to update permission: ${error.message}`);
    },
    onSuccess: () => {
      toast.success("Permission updated successfully");
    },
    onSettled: () => {
      // Refetch to ensure we're in sync with the server
      queryClient.invalidateQueries({ queryKey: ["shared-notebooks"] });
      queryClient.invalidateQueries({ queryKey: ["notebook-shares", notebookPath] });
    },
  });

  const handleShare = () => {
    if (!selectedUserEmail) {
      toast.error("Please select a user to share with");
      return;
    }

    shareNotebookMutation.mutate({
      workspacePath: notebookPath,
      sharedWithEmail: selectedUserEmail,
      permissionLevel,
    });
  };

  // Get selected user details
  const selectedUser = usersData?.users.find((u) => u.email === selectedUserEmail);

  // Sort shares alphabetically by name to prevent reordering
  const sortedShares = React.useMemo(() => {
    if (!sharesData?.shares) return [];
    return [...sharesData.shares].sort((a, b) =>
      a.sharedWithName.localeCompare(b.sharedWithName)
    );
  }, [sharesData?.shares]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-xl">Share: {notebookName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* People with access */}
          {isLoadingShares ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-5 w-5 text-purple-600" />
            </div>
          ) : sortedShares.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">People with access</Label>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                {sortedShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium text-sm truncate">{share.sharedWithName}</span>
                        <span className="text-xs text-muted-foreground truncate">{share.sharedWithEmail}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={share.permissionLevel}
                        onValueChange={(value: PermissionLevel) => {
                          updatePermissionMutation.mutate({
                            sharedWithEmail: share.sharedWithEmail,
                            newPermissionLevel: value,
                          });
                        }}
                        disabled={updatePermissionMutation.isPending}
                      >
                        <SelectTrigger className="h-8 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CAN_READ" className="text-xs">
                            Can Read
                          </SelectItem>
                          <SelectItem value="CAN_EDIT" className="text-xs">
                            Can Edit
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/20"
                        onClick={() => removeShareMutation.mutate(share.id)}
                        disabled={removeShareMutation.isPending}
                        title="Remove access"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {sortedShares.length > 0 && <Separator />}

          {/* User Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Add people</Label>
            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-5 w-5 text-purple-600" />
              </div>
            ) : (
              <Select
                value={selectedUserEmail}
                onValueChange={setSelectedUserEmail}
                disabled={shareNotebookMutation.isPending}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select a user from your organization">
                    {selectedUser && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{selectedUser.name}</span>
                        <span className="text-muted-foreground">({selectedUser.email})</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {usersData?.users.map((user) => (
                    <SelectItem key={user.id} value={user.email} className="py-3">
                      <div className="flex items-start gap-3">
                        <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Permission Level */}
          {selectedUserEmail && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Permission level</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPermissionLevel("CAN_READ")}
                  disabled={shareNotebookMutation.isPending}
                  className={`
                    relative flex flex-col gap-2 p-4 rounded-lg border-2 text-left transition-all
                    ${
                      permissionLevel === "CAN_READ"
                        ? "border-purple-600 bg-purple-50 dark:bg-purple-950/20"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                    }
                    ${shareNotebookMutation.isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Can Read</span>
                    {permissionLevel === "CAN_READ" && (
                      <Badge variant="default" className="bg-purple-600">Selected</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    View and run notebook cells
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPermissionLevel("CAN_EDIT")}
                  disabled={shareNotebookMutation.isPending}
                  className={`
                    relative flex flex-col gap-2 p-4 rounded-lg border-2 text-left transition-all
                    ${
                      permissionLevel === "CAN_EDIT"
                        ? "border-purple-600 bg-purple-50 dark:bg-purple-950/20"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                    }
                    ${shareNotebookMutation.isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Can Edit</span>
                    {permissionLevel === "CAN_EDIT" && (
                      <Badge variant="default" className="bg-purple-600">Selected</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    Edit and modify the notebook
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={shareNotebookMutation.isPending}
            className="min-w-[100px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            disabled={shareNotebookMutation.isPending || !selectedUserEmail}
            className="min-w-[100px]"
          >
            {shareNotebookMutation.isPending ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                Sharing...
              </>
            ) : (
              "Share"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

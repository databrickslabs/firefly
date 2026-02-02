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
import type { PipelineShareInfo, PipelinePermissionLevel } from "./types";

interface SharePipelineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  pipelineName: string;
}

interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function SharePipelineModal({
  open,
  onOpenChange,
  pipelineId,
  pipelineName,
}: SharePipelineModalProps) {
  const queryClient = useQueryClient();
  const [selectedUserEmail, setSelectedUserEmail] = React.useState<string>("");
  const [permissionLevel, setPermissionLevel] = React.useState<PipelinePermissionLevel>("CAN_READ");

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
    staleTime: 60000,
  });

  // Fetch existing shares for this pipeline
  const { data: sharesData, isLoading: isLoadingShares } = useQuery<{ shares: PipelineShareInfo[] }>({
    queryKey: ["pipeline-shares", pipelineId],
    queryFn: async () => {
      const response = await fetch(`/api/pipelines/${pipelineId}/shares`);
      if (!response.ok) {
        throw new Error("Failed to fetch pipeline shares");
      }
      return response.json();
    },
    enabled: open && !!pipelineId,
    staleTime: 0,
  });

  // Share pipeline mutation
  const sharePipelineMutation = useMutation({
    mutationFn: async ({
      sharedWithEmail,
      permissionLevel,
    }: {
      sharedWithEmail: string;
      permissionLevel: PipelinePermissionLevel;
    }) => {
      const response = await fetch(`/api/pipelines/${pipelineId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedWithEmail,
          permissionLevel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to share pipeline");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Pipeline shared successfully");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-shares", pipelineId] });
      setSelectedUserEmail("");
      setPermissionLevel("CAN_READ");
    },
    onError: (error: Error) => {
      toast.error(`Failed to share pipeline: ${error.message}`);
    },
  });

  // Remove share mutation
  const removeShareMutation = useMutation({
    mutationFn: async (sharedWithUserId: string) => {
      const response = await fetch(
        `/api/pipelines/${pipelineId}/shares?sharedWithUserId=${sharedWithUserId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove share");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Access removed successfully");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-shares", pipelineId] });
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
      newPermissionLevel: PipelinePermissionLevel;
    }) => {
      const response = await fetch(`/api/pipelines/${pipelineId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      await queryClient.cancelQueries({ queryKey: ["pipeline-shares", pipelineId] });

      const previousShares = queryClient.getQueryData<{ shares: PipelineShareInfo[] }>(
        ["pipeline-shares", pipelineId]
      );

      if (previousShares) {
        queryClient.setQueryData<{ shares: PipelineShareInfo[] }>(
          ["pipeline-shares", pipelineId],
          {
            ...previousShares,
            shares: previousShares.shares.map((share) =>
              share.sharedWithEmail === sharedWithEmail
                ? { ...share, permissionLevel: newPermissionLevel }
                : share
            ),
          }
        );
      }

      return { previousShares };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousShares) {
        queryClient.setQueryData(
          ["pipeline-shares", pipelineId],
          context.previousShares
        );
      }
      toast.error(`Failed to update permission: ${error.message}`);
    },
    onSuccess: () => {
      toast.success("Permission updated successfully");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-shares", pipelineId] });
    },
  });

  const handleShare = () => {
    if (!selectedUserEmail) {
      toast.error("Please select a user to share with");
      return;
    }

    sharePipelineMutation.mutate({
      sharedWithEmail: selectedUserEmail,
      permissionLevel,
    });
  };

  const selectedUser = usersData?.users.find((u) => u.email === selectedUserEmail);

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
          <DialogTitle className="text-xl">Share: {pipelineName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* People with access */}
          {isLoadingShares ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="h-5 w-5 text-emerald-600" />
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
                        <span className="font-medium text-sm truncate">
                          {share.sharedWithName}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {share.sharedWithEmail}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={share.permissionLevel}
                        onValueChange={(value: PipelinePermissionLevel) => {
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
                          <SelectItem value="CAN_RUN" className="text-xs">
                            Can Run
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
                        onClick={() => removeShareMutation.mutate(share.sharedWithUserId)}
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
                <Spinner className="h-5 w-5 text-emerald-600" />
              </div>
            ) : (
              <Select
                value={selectedUserEmail}
                onValueChange={setSelectedUserEmail}
                disabled={sharePipelineMutation.isPending}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select a user from your organization">
                    {selectedUser && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{selectedUser.name}</span>
                        <span className="text-muted-foreground">
                          ({selectedUser.email})
                        </span>
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
                          <span className="text-xs text-muted-foreground">
                            {user.email}
                          </span>
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
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPermissionLevel("CAN_READ")}
                  disabled={sharePipelineMutation.isPending}
                  className={`
                    relative flex flex-col gap-2 p-4 rounded-lg border-2 text-left transition-all
                    ${
                      permissionLevel === "CAN_READ"
                        ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                    }
                    ${sharePipelineMutation.isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Read</span>
                    {permissionLevel === "CAN_READ" && (
                      <Badge variant="default" className="bg-emerald-600 text-[10px]">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    View only
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPermissionLevel("CAN_RUN")}
                  disabled={sharePipelineMutation.isPending}
                  className={`
                    relative flex flex-col gap-2 p-4 rounded-lg border-2 text-left transition-all
                    ${
                      permissionLevel === "CAN_RUN"
                        ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                    }
                    ${sharePipelineMutation.isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Run</span>
                    {permissionLevel === "CAN_RUN" && (
                      <Badge variant="default" className="bg-emerald-600 text-[10px]">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    View & run
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPermissionLevel("CAN_EDIT")}
                  disabled={sharePipelineMutation.isPending}
                  className={`
                    relative flex flex-col gap-2 p-4 rounded-lg border-2 text-left transition-all
                    ${
                      permissionLevel === "CAN_EDIT"
                        ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                    }
                    ${sharePipelineMutation.isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Edit</span>
                    {permissionLevel === "CAN_EDIT" && (
                      <Badge variant="default" className="bg-emerald-600 text-[10px]">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    Full access
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
            disabled={sharePipelineMutation.isPending}
            className="min-w-[100px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            disabled={sharePipelineMutation.isPending || !selectedUserEmail}
            className="min-w-[100px]"
          >
            {sharePipelineMutation.isPending ? (
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

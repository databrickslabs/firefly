"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Server, Play, RotateCw, Power, Unplug } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface Cluster {
  cluster_id: string;
  cluster_name: string;
  state: "PENDING" | "RUNNING" | "RESTARTING" | "RESIZING" | "TERMINATING" | "TERMINATED" | "ERROR" | "UNKNOWN";
}

interface ClusterActionsMenuProps {
  cluster: Cluster | undefined;
  contextHealthy: boolean | undefined;
  onDetach: () => void;
  onClusterActionStart: () => void;
  onClusterActionComplete: () => void;
}

export function ClusterActionsMenu({
  cluster,
  contextHealthy,
  onDetach,
  onClusterActionStart,
  onClusterActionComplete,
}: ClusterActionsMenuProps) {
  const queryClient = useQueryClient();

  const startClusterMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const response = await fetch("/api/databricks/clusters/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start cluster");
      }
      return response.json();
    },
    onMutate: () => {
      onClusterActionStart();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      onClusterActionComplete();
    },
    onError: (error: Error) => {
      console.error("Failed to start cluster:", error);
      onClusterActionComplete();
    },
  });

  const restartClusterMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const response = await fetch("/api/databricks/clusters/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to restart cluster");
      }
      return response.json();
    },
    onMutate: () => {
      onClusterActionStart();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      onClusterActionComplete();
    },
    onError: (error: Error) => {
      console.error("Failed to restart cluster:", error);
      onClusterActionComplete();
    },
  });

  const terminateClusterMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const response = await fetch("/api/databricks/clusters/terminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to terminate cluster");
      }
      return response.json();
    },
    onMutate: () => {
      onClusterActionStart();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      onDetach(); // Auto-detach when terminating
      onClusterActionComplete();
    },
    onError: (error: Error) => {
      console.error("Failed to terminate cluster:", error);
      onClusterActionComplete();
    },
  });

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cluster) {
      startClusterMutation.mutate(cluster.cluster_id);
    }
  };

  const handleRestart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cluster) {
      restartClusterMutation.mutate(cluster.cluster_id);
    }
  };

  const handleTerminate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cluster && confirm(`Are you sure you want to terminate "${cluster.cluster_name}"?`)) {
      terminateClusterMutation.mutate(cluster.cluster_id);
    }
  };

  const handleDetach = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDetach();
  };

  const getButtonColor = () => {
    if (!cluster) return "text-muted-foreground";
    if (contextHealthy === undefined) return "text-yellow-600 dark:text-yellow-400";
    return contextHealthy
      ? "text-green-600 dark:text-green-400"
      : "text-yellow-600 dark:text-yellow-400";
  };

  const getButtonDotColor = () => {
    if (!cluster) return "bg-gray-500";
    if (contextHealthy === undefined) return "bg-yellow-500";
    return contextHealthy ? "bg-green-500" : "bg-yellow-500";
  };

  const isTransitioning =
    cluster?.state === "PENDING" ||
    cluster?.state === "RESTARTING" ||
    cluster?.state === "RESIZING" ||
    cluster?.state === "TERMINATING";

  const isPending =
    startClusterMutation.isPending ||
    restartClusterMutation.isPending ||
    terminateClusterMutation.isPending;

  if (!cluster) {
    return (
      <span className="text-xs text-muted-foreground px-2">
        No cluster selected
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-7 px-2 text-xs gap-1.5 font-normal justify-start hover:bg-accent",
            getButtonColor()
          )}
          disabled={isPending}
        >
          {isPending || isTransitioning ? (
            <Spinner className="h-3 w-3 text-purple-600 shrink-0" />
          ) : (
            <div className={cn("w-2 h-2 rounded-full shrink-0", getButtonDotColor())} />
          )}
          <Server className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[200px]">{cluster.cluster_name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Connected Section */}
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          Connected
        </div>

        <DropdownMenuItem onClick={handleDetach} disabled={isPending}>
          <Unplug className="h-4 w-4 mr-2" />
          Detach
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Actions based on cluster state */}
        {cluster.state === "TERMINATED" && (
          <DropdownMenuItem
            onClick={handleStart}
            disabled={isPending || startClusterMutation.isPending}
          >
            <Play className="h-4 w-4 mr-2" />
            Start cluster
            {startClusterMutation.isPending && (
              <Spinner className="h-3 w-3 text-purple-600 ml-auto" />
            )}
          </DropdownMenuItem>
        )}

        {cluster.state === "RUNNING" && (
          <>
            <DropdownMenuItem
              onClick={handleRestart}
              disabled={isPending || restartClusterMutation.isPending}
            >
              <RotateCw className="h-4 w-4 mr-2" />
              Restart
              {restartClusterMutation.isPending && (
                <Spinner className="h-3 w-3 text-purple-600 ml-auto" />
              )}
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={handleTerminate}
              disabled={isPending || terminateClusterMutation.isPending}
              className="text-red-600 focus:text-red-700 focus:bg-red-100 dark:focus:bg-red-900/20"
            >
              <Power className="h-4 w-4 mr-2" />
              Terminate
              {terminateClusterMutation.isPending && (
                <Spinner className="h-3 w-3 text-purple-600 ml-auto" />
              )}
            </DropdownMenuItem>
          </>
        )}

        {isTransitioning && (
          <div className="px-2 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <Spinner className="h-3 w-3 text-purple-600" />
            <span>{cluster.state}...</span>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

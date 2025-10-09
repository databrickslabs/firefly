"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, Server, Loader2, Play, RotateCw, Power, Unplug, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface Cluster {
  cluster_id: string;
  cluster_name: string;
  state: "PENDING" | "RUNNING" | "RESTARTING" | "RESIZING" | "TERMINATING" | "TERMINATED" | "ERROR" | "UNKNOWN";
  spark_version: string;
  node_type_id?: string;
  num_workers?: number;
}

interface ClustersResponse {
  clusters: Cluster[];
}

interface Warehouse {
  id: string;
  name: string;
  state: "RUNNING" | "STARTING" | "STOPPED" | "STOPPING" | "DELETING" | "DELETED";
  warehouse_type?: string;
  cluster_size?: string;
}

interface WarehousesResponse {
  warehouses: Warehouse[];
}

interface UnifiedClusterSelectorProps {
  value?: string;
  onValueChange: (clusterId: string) => void;
  contextHealthy?: boolean;
  onDetach?: () => void;
  onClusterActionStart?: () => void;
  onClusterActionComplete?: () => void;
}

export function UnifiedClusterSelector({
  value,
  onValueChange,
  contextHealthy,
  onDetach,
  onClusterActionStart,
  onClusterActionComplete,
}: UnifiedClusterSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: clustersData, isLoading: isLoadingClusters } = useQuery<ClustersResponse>({
    queryKey: ["clusters"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/clusters/list");
      if (!response.ok) {
        throw new Error("Failed to fetch clusters");
      }
      return response.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: warehousesData, isLoading: isLoadingWarehouses } = useQuery<WarehousesResponse>({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/warehouses");
      if (!response.ok) {
        throw new Error("Failed to fetch warehouses");
      }
      return response.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

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
      onClusterActionStart?.();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      onClusterActionComplete?.();
    },
    onError: (error: Error) => {
      console.error("Failed to start cluster:", error);
      onClusterActionComplete?.();
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
      onClusterActionStart?.();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      onClusterActionComplete?.();
    },
    onError: (error: Error) => {
      console.error("Failed to restart cluster:", error);
      onClusterActionComplete?.();
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
      onClusterActionStart?.();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clusters"] });
      onDetach?.();
      onClusterActionComplete?.();
    },
    onError: (error: Error) => {
      console.error("Failed to terminate cluster:", error);
      onClusterActionComplete?.();
    },
  });

  const clusters = clustersData?.clusters || [];
  const warehouses = warehousesData?.warehouses || [];
  const selectedCluster = clusters.find((c) => c.cluster_id === value);
  const otherClusters = clusters.filter((c) => c.cluster_id !== value);
  const isLoading = isLoadingClusters || isLoadingWarehouses;

  const getStateBadgeColor = (state: Cluster["state"] | Warehouse["state"]) => {
    switch (state) {
      case "RUNNING":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "TERMINATED":
      case "STOPPED":
      case "DELETED":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
      case "PENDING":
      case "RESTARTING":
      case "RESIZING":
      case "STARTING":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "TERMINATING":
      case "STOPPING":
      case "DELETING":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
      case "ERROR":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
    }
  };

  const getButtonColor = () => {
    if (!selectedCluster) return "text-muted-foreground";
    if (contextHealthy === undefined) return "text-yellow-600 dark:text-yellow-400";
    return contextHealthy
      ? "text-green-600 dark:text-green-400"
      : "text-yellow-600 dark:text-yellow-400";
  };

  const getButtonDotColor = () => {
    if (!selectedCluster) return "bg-gray-500";
    if (contextHealthy === undefined) return "bg-yellow-500";
    return contextHealthy ? "bg-green-500" : "bg-yellow-500";
  };

  const isTransitioning =
    selectedCluster?.state === "PENDING" ||
    selectedCluster?.state === "RESTARTING" ||
    selectedCluster?.state === "RESIZING" ||
    selectedCluster?.state === "TERMINATING";

  const isPending =
    startClusterMutation.isPending ||
    restartClusterMutation.isPending ||
    terminateClusterMutation.isPending;

  const handleDetach = () => {
    onDetach?.();
    setOpen(false);
  };

  const handleRestart = () => {
    if (selectedCluster) {
      restartClusterMutation.mutate(selectedCluster.cluster_id);
    }
    setOpen(false);
  };

  const handleStart = () => {
    if (selectedCluster) {
      startClusterMutation.mutate(selectedCluster.cluster_id);
    }
    setOpen(false);
  };

  const handleTerminate = () => {
    if (selectedCluster && confirm(`Are you sure you want to terminate "${selectedCluster.cluster_name}"?`)) {
      terminateClusterMutation.mutate(selectedCluster.cluster_id);
    }
    setOpen(false);
  };

  const handleSelectCluster = (clusterId: string) => {
    onValueChange(clusterId);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-7 px-2 text-xs gap-1.5 font-normal justify-start hover:bg-accent",
            getButtonColor()
          )}
          disabled={isPending}
        >
          {selectedCluster ? (
            <>
              {isPending || isTransitioning ? (
                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              ) : (
                <div className={cn("w-2 h-2 rounded-full shrink-0", getButtonDotColor())} />
              )}
              <Server className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[200px]">{selectedCluster.cluster_name}</span>
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            </>
          ) : (
            <>
              <span className="text-muted-foreground">
                {isLoading ? "Loading..." : "Select cluster..."}
              </span>
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[400px]">
        {/* Connected Cluster Section */}
        {selectedCluster && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Connected
            </DropdownMenuLabel>

            {/* Connected cluster with submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <div className={cn("w-2 h-2 rounded-full shrink-0", getButtonDotColor())} />
                <Server className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{selectedCluster.cluster_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedCluster.spark_version}
                  </div>
                </div>
                <span
                  className={cn(
                    "ml-auto px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                    getStateBadgeColor(selectedCluster.state)
                  )}
                >
                  {selectedCluster.state}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={handleDetach}>
                  <Unplug className="h-4 w-4 mr-2" />
                  Detach
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {selectedCluster.state === "TERMINATED" && (
                  <DropdownMenuItem onClick={handleStart} disabled={isPending}>
                    <Play className="h-4 w-4 mr-2" />
                    Start cluster
                    {startClusterMutation.isPending && (
                      <Loader2 className="h-3 w-3 ml-auto animate-spin" />
                    )}
                  </DropdownMenuItem>
                )}

                {selectedCluster.state === "RUNNING" && (
                  <>
                    <DropdownMenuItem onClick={handleRestart} disabled={isPending}>
                      <RotateCw className="h-4 w-4 mr-2" />
                      Restart
                      {restartClusterMutation.isPending && (
                        <Loader2 className="h-3 w-3 ml-auto animate-spin" />
                      )}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={handleTerminate}
                      disabled={isPending}
                      className="text-red-600 focus:text-red-700 focus:bg-red-100 dark:focus:bg-red-900/20"
                    >
                      <Power className="h-4 w-4 mr-2" />
                      Terminate
                      {terminateClusterMutation.isPending && (
                        <Loader2 className="h-3 w-3 ml-auto animate-spin" />
                      )}
                    </DropdownMenuItem>
                  </>
                )}

                {isTransitioning && (
                  <div className="px-2 py-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>{selectedCluster.state}...</span>
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
          </>
        )}

        {/* Clusters Section */}
        {otherClusters.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Clusters
            </DropdownMenuLabel>
            {otherClusters.map((cluster) => (
              <DropdownMenuItem
                key={cluster.cluster_id}
                onClick={() => handleSelectCluster(cluster.cluster_id)}
                className="gap-2"
              >
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  cluster.state === "RUNNING" ? "bg-green-500" : "bg-gray-500"
                )} />
                <Server className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{cluster.cluster_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {cluster.spark_version}
                  </div>
                </div>
                <span
                  className={cn(
                    "ml-auto px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                    getStateBadgeColor(cluster.state)
                  )}
                >
                  {cluster.state}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}

        {/* Serverless Section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Serverless
        </DropdownMenuLabel>

        <DropdownMenuItem disabled className="gap-2">
          <div className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
          <Server className="h-4 w-4 shrink-0" />
          <span>Serverless</span>
          <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
        </DropdownMenuItem>

        <DropdownMenuItem disabled className="gap-2">
          <div className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
          <Server className="h-4 w-4 shrink-0" />
          <span>Serverless GPU</span>
          <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">
            Beta
          </span>
          <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* SQL Warehouses Section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          SQL Warehouses
        </DropdownMenuLabel>

        {warehouses.length > 0 ? (
          warehouses.map((warehouse) => (
            <DropdownMenuItem
              key={warehouse.id}
              disabled
              className="gap-2"
            >
              <div className={cn(
                "w-2 h-2 rounded-full shrink-0",
                warehouse.state === "RUNNING" ? "bg-green-500" : "bg-gray-500"
              )} />
              <Database className="h-4 w-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{warehouse.name}</div>
                {warehouse.cluster_size && (
                  <div className="text-xs text-muted-foreground">
                    {warehouse.cluster_size}
                  </div>
                )}
              </div>
              <span
                className={cn(
                  "ml-auto px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                  getStateBadgeColor(warehouse.state)
                )}
              >
                {warehouse.state}
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled className="gap-2">
            <div className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
            <Database className="h-4 w-4 shrink-0" />
            <span className="text-muted-foreground">No warehouses available</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

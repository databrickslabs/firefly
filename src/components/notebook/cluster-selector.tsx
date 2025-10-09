"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

interface ClusterSelectorProps {
  value?: string;
  onValueChange: (clusterId: string) => void;
  refreshTrigger?: number;
  onClusterStateChange?: (state: Cluster["state"] | undefined) => void;
  contextHealthy?: boolean;
}

export function ClusterSelector({
  value,
  onValueChange,
  refreshTrigger,
  onClusterStateChange,
  contextHealthy,
}: ClusterSelectorProps) {
  const [open, setOpen] = React.useState(false);

  const { data: clustersData, isLoading, refetch } = useQuery<ClustersResponse>({
    queryKey: ["clusters"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/clusters/list");
      if (!response.ok) {
        throw new Error("Failed to fetch clusters");
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Refresh clusters whenever refreshTrigger changes
  React.useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      refetch();
    }
  }, [refreshTrigger, refetch]);

  const clusters = clustersData?.clusters || [];
  const selectedCluster = clusters.find((c) => c.cluster_id === value);

  // Notify parent of cluster state changes
  React.useEffect(() => {
    onClusterStateChange?.(selectedCluster?.state);
  }, [selectedCluster?.state, onClusterStateChange]);

  const getStateBadgeColor = (state: Cluster["state"]) => {
    switch (state) {
      case "RUNNING":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "TERMINATED":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
      case "PENDING":
      case "RESTARTING":
      case "RESIZING":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "TERMINATING":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
      case "ERROR":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
    }
  };

  // Button color based on context health
  const getButtonColor = () => {
    if (contextHealthy === undefined) return "text-yellow-600 dark:text-yellow-400";
    return contextHealthy
      ? "text-green-600 dark:text-green-400"
      : "text-yellow-600 dark:text-yellow-400";
  };

  const getButtonDotColor = () => {
    if (contextHealthy === undefined) return "bg-yellow-500";
    return contextHealthy ? "bg-green-500" : "bg-yellow-500";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-7 px-2 text-xs gap-1.5 font-normal justify-start hover:bg-accent",
            selectedCluster && getButtonColor()
          )}
        >
          {selectedCluster ? (
            <>
              <div className={cn("w-2 h-2 rounded-full shrink-0", getButtonDotColor())} />
              <Server className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[200px]">{selectedCluster.cluster_name}</span>
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            </>
          ) : (
            <span className="text-muted-foreground">
              {isLoading ? "Loading..." : "Select cluster..."}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Search clusters..." />
          <CommandList>
            <CommandEmpty>No cluster found.</CommandEmpty>
            <CommandGroup>
              {clusters.map((cluster) => (
                <CommandItem
                  key={cluster.cluster_id}
                  value={cluster.cluster_name}
                  onSelect={() => {
                    onValueChange(cluster.cluster_id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === cluster.cluster_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Server className="h-4 w-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{cluster.cluster_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {cluster.spark_version}
                        {cluster.num_workers !== undefined && ` • ${cluster.num_workers} worker${cluster.num_workers !== 1 ? 's' : ''}`}
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
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

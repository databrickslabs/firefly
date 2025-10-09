/**
 * TanStack Query hooks for managing Databricks execution context state
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { saveClusterContext } from "@/lib/cluster-storage";

export interface ContextStatusResponse {
  healthy: boolean;
  clusterState: string;
  clusterId: string;
  contextId: string;
  reason: string;
}

export interface CreateContextResponse {
  id: string;
}

/**
 * Hook to create a new execution context for a cluster
 */
export function useCreateContext() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clusterId,
      language,
    }: {
      clusterId: string;
      language: string;
    }) => {
      const response = await fetch("/api/databricks/contexts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_id: clusterId,
          language: language,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create execution context");
      }

      return response.json() as Promise<CreateContextResponse>;
    },
    onSuccess: (data, variables) => {
      // Save to localStorage
      saveClusterContext({
        clusterId: variables.clusterId,
        contextId: data.id,
        language: variables.language,
        timestamp: Date.now(),
      });

      // Invalidate context status to trigger a fresh check
      queryClient.invalidateQueries({
        queryKey: ["context-status", variables.clusterId, data.id],
      });
    },
  });
}

/**
 * Hook to poll context/kernel status with periodic health checks
 */
export function useContextStatus(
  clusterId: string | null,
  contextId: string | null,
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  return useQuery<ContextStatusResponse>({
    queryKey: ["context-status", clusterId, contextId],
    queryFn: async () => {
      if (!clusterId || !contextId) {
        throw new Error("Cluster ID and Context ID are required");
      }

      const response = await fetch(
        `/api/databricks/contexts/status-check?cluster_id=${clusterId}&context_id=${contextId}`
      );

      if (!response.ok) {
        throw new Error("Failed to check context status");
      }

      return response.json();
    },
    enabled: Boolean(clusterId && contextId && (options?.enabled ?? true)),
    refetchInterval: options?.refetchInterval ?? 5000, // Check every 5 seconds by default
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to destroy an execution context
 */
export function useDestroyContext() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clusterId,
      contextId,
    }: {
      clusterId: string;
      contextId: string;
    }) => {
      const response = await fetch("/api/databricks/contexts/destroy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_id: clusterId,
          context_id: contextId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to destroy execution context");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate context status queries
      queryClient.invalidateQueries({
        queryKey: ["context-status", variables.clusterId, variables.contextId],
      });
    },
  });
}

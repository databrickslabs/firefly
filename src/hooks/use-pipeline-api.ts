"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { generateSampleSQL, type SampleSQLResult } from "@/lib/pipeline-to-sql";
import type { PipelineNode, PipelineEdge } from "@/stores/pipeline-store";

// Types
export interface Pipeline {
  pipeline_id: string;
  name: string;
  state?: string;
  creator_user_name?: string;
  latest_updates?: Array<{
    update_id: string;
    state: string;
    creation_time: string;
  }>;
}

export interface PipelinesResponse {
  statuses: Pipeline[];
  next_page_token?: string;
}

export interface PipelineDetails extends Pipeline {
  spec?: {
    name: string;
    storage?: string;
    target?: string;
    continuous?: boolean;
    development?: boolean;
    clusters?: unknown[];
    libraries?: unknown[];
  };
}

export interface CreatePipelineRequest {
  name: string;
  storage?: string;
  target?: string;
  continuous?: boolean;
  development?: boolean;
  clusters?: Array<{
    label?: string;
    num_workers?: number;
    autoscale?: {
      min_workers: number;
      max_workers: number;
    };
  }>;
  libraries?: Array<{
    notebook?: { path: string };
    file?: { path: string };
  }>;
  channel?: "CURRENT" | "PREVIEW";
  photon?: boolean;
  serverless?: boolean;
}

export interface UpdatePipelineRequest {
  name?: string;
  storage?: string;
  target?: string;
  continuous?: boolean;
  development?: boolean;
  clusters?: unknown[];
  libraries?: unknown[];
}

// Query Keys
export const pipelineKeys = {
  all: ["pipelines"] as const,
  lists: () => [...pipelineKeys.all, "list"] as const,
  list: () => [...pipelineKeys.lists()] as const,
  details: () => [...pipelineKeys.all, "detail"] as const,
  detail: (id: string) => [...pipelineKeys.details(), id] as const,
  updates: (pipelineId: string) => [...pipelineKeys.all, "updates", pipelineId] as const,
  update: (pipelineId: string, updateId: string) =>
    [...pipelineKeys.updates(pipelineId), updateId] as const,
};

// Fetch functions
async function fetchPipelines(): Promise<PipelinesResponse> {
  const response = await fetch("/api/databricks/pipelines");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch pipelines");
  }
  return response.json();
}

async function fetchPipeline(pipelineId: string): Promise<PipelineDetails> {
  const response = await fetch(`/api/databricks/pipelines/${pipelineId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch pipeline");
  }
  return response.json();
}

async function createPipeline(data: CreatePipelineRequest): Promise<{ pipeline_id: string }> {
  const response = await fetch("/api/databricks/pipelines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create pipeline");
  }
  return response.json();
}

async function updatePipeline(
  pipelineId: string,
  data: UpdatePipelineRequest
): Promise<void> {
  const response = await fetch(`/api/databricks/pipelines/${pipelineId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update pipeline");
  }
}

async function deletePipeline(pipelineId: string): Promise<void> {
  const response = await fetch(`/api/databricks/pipelines/${pipelineId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete pipeline");
  }
}

async function startPipeline(
  pipelineId: string,
  fullRefresh?: boolean
): Promise<{ update_id: string }> {
  const response = await fetch(`/api/databricks/pipelines/${pipelineId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_refresh: fullRefresh }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to start pipeline");
  }
  return response.json();
}

async function stopPipeline(pipelineId: string): Promise<void> {
  const response = await fetch(`/api/databricks/pipelines/${pipelineId}/stop`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to stop pipeline");
  }
}

async function fetchPipelineUpdate(
  pipelineId: string,
  updateId: string
): Promise<{ update_id: string; state: string }> {
  const response = await fetch(
    `/api/databricks/pipelines/${pipelineId}/updates/${updateId}`
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch pipeline update");
  }
  return response.json();
}

// Hooks

/**
 * Hook to list all pipelines
 */
export function usePipelines() {
  return useQuery({
    queryKey: pipelineKeys.list(),
    queryFn: fetchPipelines,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/**
 * Hook to get details of a specific pipeline
 */
export function usePipeline(pipelineId: string | null) {
  return useQuery({
    queryKey: pipelineKeys.detail(pipelineId ?? ""),
    queryFn: () => fetchPipeline(pipelineId!),
    enabled: !!pipelineId,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/**
 * Hook to create a new pipeline
 */
export function useCreatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPipeline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
    },
  });
}

/**
 * Hook to update an existing pipeline
 */
export function useUpdatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pipelineId,
      data,
    }: {
      pipelineId: string;
      data: UpdatePipelineRequest;
    }) => updatePipeline(pipelineId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.detail(variables.pipelineId),
      });
    },
  });
}

/**
 * Hook to delete a pipeline
 */
export function useDeletePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePipeline,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
    },
  });
}

/**
 * Hook to start a pipeline
 */
export function useStartPipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pipelineId,
      fullRefresh,
    }: {
      pipelineId: string;
      fullRefresh?: boolean;
    }) => startPipeline(pipelineId, fullRefresh),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.detail(variables.pipelineId),
      });
    },
  });
}

/**
 * Hook to stop a pipeline
 */
export function useStopPipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: stopPipeline,
    onSuccess: (_, pipelineId) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(pipelineId) });
    },
  });
}

/**
 * Hook to fetch pipeline update status (for polling)
 */
export function usePipelineUpdate(
  pipelineId: string | null,
  updateId: string | null,
  options?: { refetchInterval?: number }
) {
  return useQuery({
    queryKey: pipelineKeys.update(pipelineId ?? "", updateId ?? ""),
    queryFn: () => fetchPipelineUpdate(pipelineId!, updateId!),
    enabled: !!pipelineId && !!updateId,
    refetchInterval: options?.refetchInterval,
  });
}

// ============================================================================
// Sample Query Execution
// ============================================================================

interface ExecuteStatementResponse {
  statement_id: string;
  status?: {
    state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED";
    error?: {
      message?: string;
    };
  };
  manifest?: {
    schema?: {
      columns: Array<{
        name: string;
        type_name: string;
        type_text: string;
        position: number;
      }>;
    };
    total_row_count?: number;
  };
  result?: {
    data_array?: unknown[][];
  };
}

interface StatusResponse {
  statement_id: string;
  status: {
    state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED";
    error?: {
      message?: string;
    };
  };
  manifest?: {
    schema: {
      columns: Array<{
        name: string;
        type_name: string;
        type_text: string;
        position: number;
      }>;
    };
    total_row_count?: number;
  };
  result?: {
    data_array?: unknown[][];
  };
}

export interface SampleResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface UseSampleNodeResult {
  /** Execute a sample query for a node */
  executeSample: (
    nodeId: string,
    nodeLabel: string,
    nodes: PipelineNode[],
    edges: PipelineEdge[],
    warehouseId: string
  ) => Promise<SampleResult>;
  /** Cancel the current sample query */
  cancelSample: () => void;
  /** Whether a sample is currently running */
  isLoading: boolean;
  /** Error from the last sample attempt */
  error: string | null;
  /** SQL generation result (for debugging) */
  sqlResult: SampleSQLResult | null;
}

/**
 * Hook for executing sample queries on pipeline nodes
 */
export function useSampleNode(): UseSampleNodeResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sqlResult, setSqlResult] = useState<SampleSQLResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const statementIdRef = useRef<string | null>(null);

  const cancelSample = useCallback(async () => {
    // Abort any pending fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Cancel the SQL statement if running
    if (statementIdRef.current) {
      try {
        await fetch(`/api/databricks/sql/cancel/${statementIdRef.current}`, {
          method: "POST",
        });
      } catch {
        // Ignore cancel errors
      }
      statementIdRef.current = null;
    }

    setIsLoading(false);
  }, []);

  const executeSample = useCallback(
    async (
      nodeId: string,
      nodeLabel: string,
      nodes: PipelineNode[],
      edges: PipelineEdge[],
      warehouseId: string
    ): Promise<SampleResult> => {
      // Cancel any existing sample
      await cancelSample();

      setIsLoading(true);
      setError(null);
      setSqlResult(null);

      try {
        // Generate SQL for sampling
        const sqlGenResult = generateSampleSQL(
          nodeId,
          nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data,
          })),
          edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
          10 // Limit to 10 rows
        );

        setSqlResult(sqlGenResult);

        if (!sqlGenResult.isValid) {
          const errorMsg = sqlGenResult.errors.join("; ");
          throw new Error(errorMsg || "Failed to generate sample SQL");
        }

        // Check for no warehouse
        if (!warehouseId) {
          throw new Error("No warehouse selected. Please select a warehouse in the SQL Editor first.");
        }

        // Create abort controller for this request
        abortControllerRef.current = new AbortController();

        // Execute the SQL statement
        const executeResponse = await fetch("/api/databricks/sql/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            warehouse_id: warehouseId,
            statement: sqlGenResult.sql,
            wait_timeout: "30s",
            on_wait_timeout: "CONTINUE",
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!executeResponse.ok) {
          const errorData = await executeResponse.json();
          throw new Error(errorData.error || "Failed to execute sample query");
        }

        const executeData: ExecuteStatementResponse = await executeResponse.json();
        statementIdRef.current = executeData.statement_id;

        // Check if we got immediate results
        if (
          executeData.status?.state === "SUCCEEDED" &&
          executeData.manifest?.schema &&
          executeData.result?.data_array
        ) {
          const columns = executeData.manifest.schema.columns.map((c) => c.name);
          const rows = executeData.result.data_array.map((row) => {
            const rowObj: Record<string, unknown> = {};
            columns.forEach((col, idx) => {
              rowObj[col] = row[idx];
            });
            return rowObj;
          });

          setIsLoading(false);
          statementIdRef.current = null;
          return { columns, rows, rowCount: rows.length };
        }

        // Need to poll for results
        const maxPolls = 60; // 60 seconds max
        let pollCount = 0;

        while (pollCount < maxPolls) {
          // Wait 1 second between polls
          await new Promise((resolve) => setTimeout(resolve, 1000));
          pollCount++;

          // Check if cancelled
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error("Sample query cancelled");
          }

          // Poll for status
          const statusResponse = await fetch(
            `/api/databricks/sql/status/${executeData.statement_id}`,
            { signal: abortControllerRef.current?.signal }
          );

          if (!statusResponse.ok) {
            const errorData = await statusResponse.json();
            throw new Error(errorData.error || "Failed to get query status");
          }

          const statusData: StatusResponse = await statusResponse.json();

          switch (statusData.status.state) {
            case "SUCCEEDED":
              if (statusData.manifest?.schema && statusData.result?.data_array) {
                const columns = statusData.manifest.schema.columns.map((c) => c.name);
                const rows = statusData.result.data_array.map((row) => {
                  const rowObj: Record<string, unknown> = {};
                  columns.forEach((col, idx) => {
                    rowObj[col] = row[idx];
                  });
                  return rowObj;
                });

                setIsLoading(false);
                statementIdRef.current = null;
                return { columns, rows, rowCount: rows.length };
              }
              throw new Error("Query succeeded but no results returned");

            case "FAILED":
              throw new Error(
                statusData.status.error?.message || "Sample query failed"
              );

            case "CANCELED":
              throw new Error("Sample query was cancelled");

            case "CLOSED":
              throw new Error("Sample query session closed");

            case "PENDING":
            case "RUNNING":
              // Continue polling
              break;
          }
        }

        throw new Error("Sample query timed out after 60 seconds");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error during sampling";
        setError(errorMessage);
        setIsLoading(false);
        statementIdRef.current = null;
        throw err;
      }
    },
    [cancelSample]
  );

  return {
    executeSample,
    cancelSample,
    isLoading,
    error,
    sqlResult,
  };
}

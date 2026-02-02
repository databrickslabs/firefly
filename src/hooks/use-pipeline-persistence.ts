"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PipelineNode, PipelineEdge, PipelineAccess } from "@/stores/pipeline-store";

interface PipelineData {
  id: string;
  name: string;
  description: string | null;
  pipelineJson: {
    nodes: PipelineNode[];
    edges: PipelineEdge[];
  };
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  creatorName: string;
  creatorEmail: string;
  access: PipelineAccess;
}

interface SavePipelineParams {
  pipelineId: string;
  name?: string;
  description?: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

interface CreatePipelineParams {
  name: string;
  description?: string;
  nodes?: PipelineNode[];
  edges?: PipelineEdge[];
}

export function usePipelinePersistence() {
  const queryClient = useQueryClient();

  // Save an existing pipeline
  const savePipelineMutation = useMutation({
    mutationFn: async ({ pipelineId, name, description, nodes, edges }: SavePipelineParams) => {
      const response = await fetch(`/api/pipelines/${pipelineId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          pipelineJson: { nodes, edges },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save pipeline");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      toast.success("Pipeline saved successfully");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline", variables.pipelineId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to save pipeline: ${error.message}`);
    },
  });

  // Create a new pipeline
  const createPipelineMutation = useMutation({
    mutationFn: async ({ name, description, nodes, edges }: CreatePipelineParams) => {
      const response = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          pipelineJson: { nodes: nodes || [], edges: edges || [] },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create pipeline");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Pipeline created successfully");
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create pipeline: ${error.message}`);
    },
  });

  return {
    savePipeline: savePipelineMutation.mutate,
    savePipelineAsync: savePipelineMutation.mutateAsync,
    isSaving: savePipelineMutation.isPending,
    createPipeline: createPipelineMutation.mutate,
    createPipelineAsync: createPipelineMutation.mutateAsync,
    isCreating: createPipelineMutation.isPending,
  };
}

// Standalone hook for loading a pipeline
export function usePipelineQuery(pipelineId: string | null) {
  return useQuery<{ pipeline: PipelineData }>({
    queryKey: ["pipeline", pipelineId],
    queryFn: async () => {
      if (!pipelineId) throw new Error("No pipeline ID");
      const response = await fetch(`/api/pipelines/${pipelineId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to load pipeline");
      }
      return response.json();
    },
    enabled: !!pipelineId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

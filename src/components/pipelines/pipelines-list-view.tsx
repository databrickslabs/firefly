"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PipelinesTable } from "./pipelines-table";
import { CreatePipelineDialog } from "./create-pipeline-dialog";
import { SharePipelineModal } from "./share-pipeline-modal";
import type { PipelineListItem } from "./types";

interface PipelinesListViewProps {
  basePath: string;
}

export function PipelinesListView({ basePath }: PipelinesListViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [selectedPipelineForShare, setSelectedPipelineForShare] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  const { data, isLoading, error, refetch } = useQuery<{ pipelines: PipelineListItem[] }>({
    queryKey: ["pipelines"],
    queryFn: async () => {
      const response = await fetch("/api/pipelines");
      if (!response.ok) {
        throw new Error("Failed to fetch pipelines");
      }
      return response.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const handleEdit = (pipelineId: string) => {
    // Invalidate cache to ensure fresh data is fetched
    queryClient.invalidateQueries({ queryKey: ["pipeline", pipelineId] });
    router.push(`${basePath}/pipeline-studio?id=${pipelineId}`);
  };

  const handleShare = (pipeline: PipelineListItem) => {
    setSelectedPipelineForShare({ id: pipeline.id, name: pipeline.name });
    setShareModalOpen(true);
  };

  const handleClone = async (pipelineId: string) => {
    try {
      const response = await fetch(`/api/pipelines/${pipelineId}/clone`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to clone pipeline");
      }
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    } catch (err) {
      console.error("Clone error:", err);
    }
  };

  const handleDelete = async (pipelineId: string) => {
    try {
      const response = await fetch(`/api/pipelines/${pipelineId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete pipeline");
      }
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleRename = async (pipelineId: string, newName: string) => {
    try {
      const response = await fetch(`/api/pipelines/${pipelineId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!response.ok) {
        throw new Error("Failed to rename pipeline");
      }
      // Invalidate both the list and the specific pipeline cache
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline", pipelineId] });
    } catch (err) {
      console.error("Rename error:", err);
    }
  };

  const handleCreate = (pipelineId: string) => {
    setCreateDialogOpen(false);
    // Invalidate cache to ensure fresh data is fetched
    queryClient.invalidateQueries({ queryKey: ["pipeline", pipelineId] });
    router.push(`${basePath}/pipeline-studio?id=${pipelineId}`);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-red-600 mb-4 text-sm">Failed to load pipelines</p>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <Spinner className="h-8 w-8 text-emerald-600" />
          <p className="text-sm text-muted-foreground">Loading pipelines...</p>
        </div>
      </div>
    );
  }

  const pipelines = data?.pipelines || [];

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Pipelines</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage and share your data pipelines
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Pipeline
        </Button>
      </div>

      {/* Content */}
      {pipelines.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <GitBranch className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Pipelines Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first pipeline to get started with data orchestration
          </p>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Pipeline
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <PipelinesTable
            pipelines={pipelines}
            onEdit={handleEdit}
            onShare={handleShare}
            onClone={handleClone}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        </div>
      )}

      {/* Dialogs */}
      <CreatePipelineDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreate={handleCreate}
      />

      {selectedPipelineForShare && (
        <SharePipelineModal
          open={shareModalOpen}
          onOpenChange={setShareModalOpen}
          pipelineId={selectedPipelineForShare.id}
          pipelineName={selectedPipelineForShare.name}
        />
      )}
    </div>
  );
}

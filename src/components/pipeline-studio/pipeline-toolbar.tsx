"use client";

import { useState, useRef, useEffect } from "react";
import {
  Play,
  FlaskConical,
  Save,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  AlertTriangle,
  XCircle,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Input } from "@/components/ui/input";
import { usePipelineStore, usePipelineMetadata, usePipelineNodes, usePipelineEdges, useSampleDataByNode, useNodeSampleDataActions } from "@/providers/pipeline-store-provider";
import { useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { CompactWarehouseSelector } from "./compact-warehouse-selector";
import { usePipelinePersistence } from "@/hooks/use-pipeline-persistence";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { toast } from "sonner";
import { generateSampleSQL } from "@/lib/pipeline-to-sql";
import { loadWarehouse } from "@/lib/warehouse-storage";

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  variant = "default",
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "h-8 w-8 p-0",
            variant === "destructive" && "hover:bg-red-100 hover:text-red-600"
          )}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function PipelineToolbar() {
  const { isDirty, pipelineId, pipelineName, isOwner, permissionLevel } = usePipelineMetadata();
  const { clearPipeline, addLog, setDirty, setLastSavedAt, setPipelineName, setPipeline } = usePipelineStore();
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();
  const sampleDataByNode = useSampleDataByNode();
  const { clearAllNodeSamples, setNodeSampleLoading, setNodeSampleResult, setNodeSampleError } = useNodeSampleDataActions();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(pipelineName);
  const [isSampling, setIsSampling] = useState(false);
  const [sampleProgress, setSampleProgress] = useState({ completed: 0, total: 0 });
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Persistence hook
  const { savePipelineAsync, isSaving, createPipelineAsync, isCreating } = usePipelinePersistence();

  // Sync editedName when pipelineName changes externally
  useEffect(() => {
    if (!isEditingName) {
      setEditedName(pipelineName);
    }
  }, [pipelineName, isEditingName]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Browser beforeunload handler
  useBeforeUnload(isDirty);

  // Check if user can edit
  const canEdit = isOwner || permissionLevel === 'CAN_EDIT';

  // Count nodes with sample data
  const sampledNodeCount = Object.keys(sampleDataByNode).length;

  const handleRun = () => {
    addLog("info", "Starting pipeline execution...");
    // TODO: Implement pipeline run
  };

  // Helper function to sample a single node - returns success/failure
  const sampleSingleNode = async (
    node: typeof nodes[0],
    warehouseId: string,
    onComplete: () => void
  ): Promise<{ success: boolean; nodeId: string }> => {
    const nodeId = node.id;
    const nodeLabel = node.data.label;

    // Generate SQL for this node
    const sqlResult = generateSampleSQL(
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
      10
    );

    // Check for validation errors
    if (!sqlResult.isValid) {
      const errorMsg = sqlResult.invalidNodes.length > 0
        ? sqlResult.invalidNodes.map(n => n.issues.join(", ")).join("; ")
        : sqlResult.errors.join("; ");
      setNodeSampleLoading(nodeId, nodeLabel);
      setNodeSampleError(nodeId, errorMsg);
      onComplete();
      return { success: false, nodeId };
    }

    // Start loading for this node
    setNodeSampleLoading(nodeId, nodeLabel);

    try {
      // Execute the SQL statement
      const executeResponse = await fetch("/api/databricks/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          statement: sqlResult.sql,
          wait_timeout: "30s",
          on_wait_timeout: "CONTINUE",
        }),
      });

      if (!executeResponse.ok) {
        const errorData = await executeResponse.json();
        throw new Error(errorData.error || "Failed to execute sample query");
      }

      const executeData = await executeResponse.json();
      const statementId = executeData.statement_id;

      // Check if we got immediate results
      if (
        executeData.status?.state === "SUCCEEDED" &&
        executeData.manifest?.schema &&
        executeData.result?.data_array
      ) {
        const columns = executeData.manifest.schema.columns.map((c: { name: string }) => c.name);
        const rows = executeData.result.data_array.map((row: unknown[]) => {
          const rowObj: Record<string, unknown> = {};
          columns.forEach((col: string, idx: number) => {
            rowObj[col] = row[idx];
          });
          return rowObj;
        });

        setNodeSampleResult(nodeId, columns, rows);
        onComplete();
        return { success: true, nodeId };
      }

      // Need to poll for results
      const maxPolls = 30;
      let pollCount = 0;

      while (pollCount < maxPolls) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        pollCount++;

        const statusResponse = await fetch(`/api/databricks/sql/status/${statementId}`);

        if (!statusResponse.ok) {
          const errorData = await statusResponse.json();
          throw new Error(errorData.error || "Failed to get query status");
        }

        const statusData = await statusResponse.json();

        switch (statusData.status.state) {
          case "SUCCEEDED":
            if (statusData.manifest?.schema && statusData.result?.data_array) {
              const columns = statusData.manifest.schema.columns.map((c: { name: string }) => c.name);
              const rows = statusData.result.data_array.map((row: unknown[]) => {
                const rowObj: Record<string, unknown> = {};
                columns.forEach((col: string, idx: number) => {
                  rowObj[col] = row[idx];
                });
                return rowObj;
              });

              setNodeSampleResult(nodeId, columns, rows);
              onComplete();
              return { success: true, nodeId };
            }
            break;

          case "FAILED":
            throw new Error(statusData.status.error?.message || "Sample query failed");

          case "CANCELED":
            throw new Error("Sample query was cancelled");

          case "CLOSED":
            throw new Error("Sample query session closed");

          case "PENDING":
          case "RUNNING":
            // Continue polling
            continue;
        }
      }

      throw new Error("Sample query timed out");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error during sampling";
      setNodeSampleError(nodeId, errorMessage);
      onComplete();
      return { success: false, nodeId };
    }
  };

  const handleSample = async () => {
    // Filter out destination nodes - we only sample source/transform/AI nodes
    const sampleableNodes = nodes.filter(n => n.data.category !== "destination");

    if (sampleableNodes.length === 0) {
      addLog("info", "No nodes to sample");
      return;
    }

    // Check for warehouse
    const warehouseData = loadWarehouse();
    if (!warehouseData?.warehouseId) {
      addLog("error", "No warehouse selected. Please select a warehouse first.");
      toast.error("No warehouse selected");
      return;
    }

    const total = sampleableNodes.length;
    setIsSampling(true);
    setSampleProgress({ completed: 0, total });
    addLog("info", `Sampling ${total} node${total !== 1 ? "s" : ""} in parallel...`);

    const startTime = Date.now();
    let completedCount = 0;

    // Create a callback to update progress
    const onNodeComplete = () => {
      completedCount++;
      setSampleProgress({ completed: completedCount, total });
    };

    // Sample all nodes in parallel
    const results = await Promise.allSettled(
      sampleableNodes.map(node =>
        sampleSingleNode(node, warehouseData.warehouseId, onNodeComplete)
      )
    );

    // Count successes and failures
    let successCount = 0;
    let errorCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    setIsSampling(false);
    setSampleProgress({ completed: 0, total: 0 });
    const duration = Date.now() - startTime;

    if (errorCount === 0) {
      addLog("success", `Sampled ${successCount} node${successCount !== 1 ? "s" : ""} in ${duration}ms`);
    } else if (successCount > 0) {
      addLog("warn", `Sampled ${successCount} node${successCount !== 1 ? "s" : ""}, ${errorCount} failed in ${duration}ms`);
    } else {
      addLog("error", `Failed to sample all ${errorCount} node${errorCount !== 1 ? "s" : ""}`);
    }
  };

  const handleClearAllSamples = () => {
    if (sampledNodeCount === 0) {
      addLog("info", "No sample data to clear");
      return;
    }
    clearAllNodeSamples();
    addLog("info", `Cleared sample data from ${sampledNodeCount} node${sampledNodeCount !== 1 ? "s" : ""}`);
  };

  const handleSave = async () => {
    if (!canEdit) {
      toast.error("You don't have permission to save this pipeline");
      return;
    }

    addLog("info", "Saving pipeline...");

    try {
      if (pipelineId) {
        // Update existing pipeline
        await savePipelineAsync({
          pipelineId,
          name: pipelineName,
          nodes,
          edges,
        });
        setDirty(false);
        setLastSavedAt(new Date());
        addLog("success", "Pipeline saved successfully");
      } else {
        // Create new pipeline
        const result = await createPipelineAsync({
          name: pipelineName || "Untitled Pipeline",
          nodes,
          edges,
        });
        // Update store with the new pipeline ID so subsequent saves work
        setPipeline(result.pipeline.id, result.pipeline.name, result.pipeline.description);
        setLastSavedAt(new Date());
        addLog("success", `Pipeline created: ${result.pipeline.name}`);
      }
    } catch (error) {
      addLog("error", `Failed to save pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleClearClick = () => {
    if (nodes.length === 0) {
      addLog("info", "Canvas is already empty");
      return;
    }
    setShowClearDialog(true);
  };

  const handleConfirmClear = () => {
    const nodeCount = nodes.length;
    clearPipeline();
    addLog("warn", `Cleared canvas: ${nodeCount} node${nodeCount !== 1 ? "s" : ""} deleted`);
    setShowClearDialog(false);
  };

  const handleZoomIn = () => {
    zoomIn();
  };

  const handleZoomOut = () => {
    zoomOut();
  };

  const handleFitView = () => {
    fitView({ padding: 0.2 });
  };

  const handleStartEditingName = () => {
    if (!canEdit) return;
    setEditedName(pipelineName);
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== pipelineName) {
      setPipelineName(trimmedName);
    } else {
      setEditedName(pipelineName);
    }
    setIsEditingName(false);
  };

  const handleCancelEditingName = () => {
    setEditedName(pipelineName);
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      handleCancelEditingName();
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-1 px-2 py-1.5 bg-white/95 backdrop-blur border border-slate-200 rounded-lg shadow-sm">
          {/* Pipeline Name */}
          {isEditingName ? (
            <Input
              ref={nameInputRef}
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={handleNameKeyDown}
              className="h-7 w-40 text-sm font-medium"
              placeholder="Pipeline name"
            />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleStartEditingName}
                  disabled={!canEdit}
                  className={cn(
                    "flex items-center gap-1 px-2 h-7 text-sm font-medium rounded hover:bg-slate-100 transition-colors max-w-[160px]",
                    !canEdit && "cursor-default opacity-70"
                  )}
                >
                  <span className="truncate">{pipelineName}</span>
                  {canEdit && <Pencil className="h-3 w-3 text-slate-400 flex-shrink-0" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{canEdit ? "Click to rename" : pipelineName}</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Warehouse Selector */}
          <CompactWarehouseSelector />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Run Controls */}
          <ToolbarButton
            icon={<Play className="h-4 w-4" />}
            label="Run Pipeline"
            onClick={handleRun}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSample}
                disabled={isSampling || nodes.filter(n => n.data.category !== "destination").length === 0}
                className={cn("h-8 p-0", isSampling ? "w-auto px-2 gap-1.5" : "w-8")}
              >
                {isSampling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-medium">
                      {sampleProgress.completed}/{sampleProgress.total}
                    </span>
                  </>
                ) : (
                  <FlaskConical className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {isSampling
                  ? `Sampling nodes in parallel...`
                  : "Sample All Nodes"}
              </p>
            </TooltipContent>
          </Tooltip>
          <ToolbarButton
            icon={<XCircle className="h-4 w-4" />}
            label={sampledNodeCount > 0 ? `Clear Samples (${sampledNodeCount})` : "Clear Samples"}
            onClick={handleClearAllSamples}
            disabled={sampledNodeCount === 0}
          />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Save */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
                disabled={!canEdit || isSaving || isCreating}
                className="h-8 px-2 relative"
              >
                {isSaving || isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isDirty && !isSaving && !isCreating && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 absolute top-0.5 right-0.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {isSaving || isCreating
                  ? "Saving..."
                  : !canEdit
                    ? "Read-only"
                    : isDirty
                      ? "Save Pipeline (unsaved changes)"
                      : "Save Pipeline"}
              </p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Zoom Controls */}
          <ToolbarButton
            icon={<ZoomIn className="h-4 w-4" />}
            label="Zoom In"
            onClick={handleZoomIn}
          />
          <ToolbarButton
            icon={<ZoomOut className="h-4 w-4" />}
            label="Zoom Out"
            onClick={handleZoomOut}
          />
          <ToolbarButton
            icon={<Maximize2 className="h-4 w-4" />}
            label="Fit View"
            onClick={handleFitView}
          />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Clear */}
          <ToolbarButton
            icon={<Trash2 className="h-4 w-4" />}
            label="Clear Canvas"
            onClick={handleClearClick}
            variant="destructive"
          />
        </div>
      </div>

      {/* Clear Canvas Confirmation Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Clear Canvas?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              <span className="font-semibold text-slate-700">
                {nodes.length} node{nodes.length !== 1 ? "s" : ""}
              </span>{" "}
              and all their connections from the canvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClear}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

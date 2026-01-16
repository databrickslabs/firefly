"use client";

import { useState } from "react";
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
import { usePipelineStore, usePipelineMetadata, usePipelineNodes, useSampleDataByNode, useNodeSampleDataActions } from "@/providers/pipeline-store-provider";
import { useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { CompactWarehouseSelector } from "./compact-warehouse-selector";

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
  const { isDirty } = usePipelineMetadata();
  const { clearPipeline, addLog } = usePipelineStore();
  const nodes = usePipelineNodes();
  const sampleDataByNode = useSampleDataByNode();
  const { clearAllNodeSamples } = useNodeSampleDataActions();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [showClearDialog, setShowClearDialog] = useState(false);

  // Count nodes with sample data
  const sampledNodeCount = Object.keys(sampleDataByNode).length;

  const handleRun = () => {
    addLog("info", "Starting pipeline execution...");
    // TODO: Implement pipeline run
  };

  const handleSample = () => {
    addLog("info", "Sampling data...");
    // TODO: Implement data sampling
  };

  const handleClearAllSamples = () => {
    if (sampledNodeCount === 0) {
      addLog("info", "No sample data to clear");
      return;
    }
    clearAllNodeSamples();
    addLog("info", `Cleared sample data from ${sampledNodeCount} node${sampledNodeCount !== 1 ? "s" : ""}`);
  };

  const handleSave = () => {
    addLog("info", "Saving pipeline...");
    // TODO: Implement save
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

  return (
    <TooltipProvider delayDuration={300}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-1 px-2 py-1.5 bg-white/95 backdrop-blur border border-slate-200 rounded-lg shadow-sm">
          {/* Warehouse Selector */}
          <CompactWarehouseSelector />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Run Controls */}
          <ToolbarButton
            icon={<Play className="h-4 w-4" />}
            label="Run Pipeline"
            onClick={handleRun}
          />
          <ToolbarButton
            icon={<FlaskConical className="h-4 w-4" />}
            label="Sample Data"
            onClick={handleSample}
          />
          <ToolbarButton
            icon={<XCircle className="h-4 w-4" />}
            label={sampledNodeCount > 0 ? `Clear Samples (${sampledNodeCount})` : "Clear Samples"}
            onClick={handleClearAllSamples}
            disabled={sampledNodeCount === 0}
          />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Save */}
          <ToolbarButton
            icon={<Save className="h-4 w-4" />}
            label={isDirty ? "Save Pipeline*" : "Save Pipeline"}
            onClick={handleSave}
          />

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

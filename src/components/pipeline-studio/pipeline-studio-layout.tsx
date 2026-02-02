"use client";

import { useEffect, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ReactFlowProvider } from "@xyflow/react";
import { PipelineCanvas } from "./pipeline-canvas";
import { PipelineNodePalette } from "./pipeline-node-palette";
import { PipelinePropertiesPanel } from "./pipeline-properties-panel";
import { PipelineConsole } from "./pipeline-console";
import { PipelineToolbar } from "./pipeline-toolbar";
import { DnDProvider } from "./dnd-context";
import { PipelineStoreProvider, useSelectedNodeIds, usePipelineStore } from "@/providers/pipeline-store-provider";
import { usePipelineQuery } from "@/hooks/use-pipeline-persistence";
import { Spinner } from "@/components/ui/spinner";

interface PipelineStudioLayoutProps {
  pipelineId?: string | null;
}

function HorizontalResizeHandle() {
  return (
    <PanelResizeHandle className="w-[3px] bg-slate-200 hover:bg-slate-300 data-[resize-handle-active]:bg-blue-500 transition-colors" />
  );
}

function VerticalResizeHandle() {
  return (
    <PanelResizeHandle className="h-[3px] bg-slate-200 hover:bg-slate-300 data-[resize-handle-active]:bg-blue-500 transition-colors" />
  );
}

function PipelineStudioContent({ pipelineId }: { pipelineId?: string | null }) {
  const selectedNodeIds = useSelectedNodeIds();
  const hasSelection = selectedNodeIds.length > 0;
  const store = usePipelineStore();
  const { loadPipelineData, clearPipeline, pipelineId: storePipelineId, isDirty } = store;
  const lastLoadedDataRef = useRef<{ id: string; updatedAt: string } | null>(null);

  // Load pipeline data if an ID is provided
  const { data, isLoading, error } = usePipelineQuery(pipelineId || null);

  // Load pipeline data into store when data is available
  useEffect(() => {
    if (pipelineId && data?.pipeline) {
      const pipeline = data.pipeline;
      const dataKey = { id: pipeline.id, updatedAt: pipeline.updatedAt };

      // Check if this is new data we haven't loaded yet
      const isNewData = !lastLoadedDataRef.current ||
        lastLoadedDataRef.current.id !== dataKey.id ||
        lastLoadedDataRef.current.updatedAt !== dataKey.updatedAt;

      // Load if: new data AND (not dirty OR different pipeline)
      const shouldLoad = isNewData && (!isDirty || storePipelineId !== pipeline.id);

      if (shouldLoad) {
        loadPipelineData({
          id: pipeline.id,
          name: pipeline.name,
          description: pipeline.description,
          nodes: pipeline.pipelineJson.nodes,
          edges: pipeline.pipelineJson.edges,
          access: pipeline.access,
        });
        lastLoadedDataRef.current = dataKey;
      }
    }
  }, [pipelineId, data, loadPipelineData, isDirty, storePipelineId]);

  // Reset ref when pipelineId changes
  useEffect(() => {
    return () => {
      lastLoadedDataRef.current = null;
    };
  }, [pipelineId]);

  // Clear store when creating a new pipeline (no ID)
  useEffect(() => {
    if (!pipelineId) {
      clearPipeline();
    }
  }, [pipelineId, clearPipeline]);

  if (pipelineId && isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-100">
        <div className="flex flex-col items-center gap-2">
          <Spinner className="h-8 w-8 text-emerald-600" />
          <p className="text-sm text-muted-foreground">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  if (pipelineId && error) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-100">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load pipeline</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-100">
      {/* Main content area */}
      <div className="flex-1 overflow-hidden p-2">
        <div className="h-full rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <PanelGroup direction="vertical" className="h-full">
            {/* Top Section: Palette + Canvas + Properties */}
            <Panel defaultSize={70} minSize={40}>
              <PanelGroup direction="horizontal" className="h-full">
                {/* Left Panel - Node Palette */}
                <Panel defaultSize={18} minSize={12} maxSize={30}>
                  <div className="h-full overflow-hidden">
                    <PipelineNodePalette />
                  </div>
                </Panel>

                <HorizontalResizeHandle />

                {/* Center Panel - Canvas with Toolbar */}
                <Panel defaultSize={hasSelection ? 57 : 82} minSize={30}>
                  <div className="relative h-full">
                    <PipelineToolbar />
                    <PipelineCanvas />
                  </div>
                </Panel>

                {/* Right Panel - Properties (only shown when node selected) */}
                {hasSelection && (
                  <>
                    <HorizontalResizeHandle />
                    <Panel defaultSize={25} minSize={18} maxSize={40}>
                      <div className="h-full overflow-hidden">
                        <PipelinePropertiesPanel />
                      </div>
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </Panel>

            <VerticalResizeHandle />

            {/* Bottom Section: Console (full width) */}
            <Panel defaultSize={30} minSize={15} maxSize={50}>
              <div className="h-full w-full overflow-hidden">
                <PipelineConsole />
              </div>
            </Panel>
          </PanelGroup>
        </div>
      </div>
    </div>
  );
}

export function PipelineStudioLayout({ pipelineId }: PipelineStudioLayoutProps) {
  return (
    <PipelineStoreProvider>
      <ReactFlowProvider>
        <DnDProvider>
          <PipelineStudioContent pipelineId={pipelineId} />
        </DnDProvider>
      </ReactFlowProvider>
    </PipelineStoreProvider>
  );
}

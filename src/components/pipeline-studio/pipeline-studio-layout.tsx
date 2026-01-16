"use client";

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ReactFlowProvider } from "@xyflow/react";
import { PipelineCanvas } from "./pipeline-canvas";
import { PipelineNodePalette } from "./pipeline-node-palette";
import { PipelinePropertiesPanel } from "./pipeline-properties-panel";
import { PipelineConsole } from "./pipeline-console";
import { PipelineToolbar } from "./pipeline-toolbar";
import { DnDProvider } from "./dnd-context";
import { PipelineStoreProvider, useSelectedNodeIds } from "@/providers/pipeline-store-provider";

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

function PipelineStudioContent() {
  const selectedNodeIds = useSelectedNodeIds();
  const hasSelection = selectedNodeIds.length > 0;

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

export function PipelineStudioLayout() {
  return (
    <PipelineStoreProvider>
      <ReactFlowProvider>
        <DnDProvider>
          <PipelineStudioContent />
        </DnDProvider>
      </ReactFlowProvider>
    </PipelineStoreProvider>
  );
}

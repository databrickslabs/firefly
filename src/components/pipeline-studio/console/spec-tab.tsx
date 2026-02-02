"use client";

import { useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { usePipelineNodes, usePipelineEdges } from "@/providers/pipeline-store-provider";

export function SpecTab() {
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();

  const spec = useMemo(() => {
    // Generate a simplified pipeline spec from nodes and edges
    const pipelineSpec = {
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: node.data.label,
        category: node.data.category,
        subtype: node.data.subtype,
        config: node.data.config,
        // Include column mapping if configured (not SELECT *)
        ...(node.data.columnMapping && node.data.columnMapping.length > 0
          ? { columnMapping: node.data.columnMapping }
          : {}),
        position: node.position,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    };

    return JSON.stringify(pipelineSpec, null, 2);
  }, [nodes, edges]);

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0 overflow-hidden">
        <ScrollArea className="h-full w-full" type="always">
          <pre className="p-4 font-mono text-xs text-slate-700 whitespace-pre">
            {nodes.length === 0 ? (
              <span className="text-slate-400">
                No nodes in the pipeline. Add nodes to see the spec.
              </span>
            ) : (
              spec
            )}
          </pre>
          <ScrollBar orientation="horizontal" />
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </div>
    </div>
  );
}

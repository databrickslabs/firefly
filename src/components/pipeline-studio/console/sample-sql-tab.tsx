"use client";

import { useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  usePipelineNodes,
  usePipelineEdges,
  useSelectedNodeIds,
} from "@/providers/pipeline-store-provider";
import { generateSampleSQL } from "@/lib/pipeline-to-sql";

export function SampleSqlTab() {
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();
  const selectedNodeIds = useSelectedNodeIds();

  const result = useMemo(() => {
    // Need at least one selected node
    if (selectedNodeIds.length === 0) {
      return null;
    }

    // Get the first selected node (primary selection)
    const selectedNodeId = selectedNodeIds[0];
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);

    if (!selectedNode) {
      return null;
    }

    // Generate sample SQL for the selected node
    return generateSampleSQL(selectedNodeId, nodes, edges, 10);
  }, [nodes, edges, selectedNodeIds]);

  // Find the selected node label for display
  const selectedNode = selectedNodeIds.length > 0
    ? nodes.find((n) => n.id === selectedNodeIds[0])
    : null;

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0 overflow-hidden">
        <ScrollArea className="h-full w-full" type="always">
          <pre className="p-4 font-mono text-xs text-slate-700 whitespace-pre">
            {result ? (
              <>
                <span className="text-slate-400 block mb-2">
                  -- Sample SQL for: {selectedNode?.data.label ?? "Unknown"}
                  {result.warnings.length > 0 && (
                    <>
                      {"\n"}-- Warnings:
                      {result.warnings.map((w, i) => (
                        <span key={i}>{"\n"}-- {w}</span>
                      ))}
                    </>
                  )}
                </span>
                {result.isValid ? (
                  result.sql
                ) : (
                  <>
                    <span className="text-red-500 block mb-2">
                      -- Errors:
                      {result.errors.map((e, i) => (
                        <span key={i}>{"\n"}-- {e}</span>
                      ))}
                    </span>
                    {result.invalidNodes.length > 0 && (
                      <span className="text-amber-600 block mb-2">
                        -- Missing required fields:
                        {result.invalidNodes.map((node, i) => (
                          <span key={i}>
                            {"\n"}-- {node.label}: {node.issues.join(", ")}
                          </span>
                        ))}
                      </span>
                    )}
                  </>
                )}
              </>
            ) : selectedNodeIds.length === 0 ? (
              <span className="text-slate-400">
                Select a node to see its sample SQL.
              </span>
            ) : (
              <span className="text-slate-400">
                No sample SQL generated for the selected node.
              </span>
            )}
          </pre>
          <ScrollBar orientation="horizontal" />
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </div>
    </div>
  );
}

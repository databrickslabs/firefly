"use client";

import { useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  usePipelineNodes,
  usePipelineEdges,
  useSelectedNodeIds,
} from "@/providers/pipeline-store-provider";
import { generateSQLPreview } from "@/lib/pipeline-to-sql";
import type { PipelineNode, PipelineEdge } from "@/lib/pipeline-to-sql";

/**
 * Get all upstream dependencies for a given node (recursively)
 */
function getUpstreamDependencies(
  nodeId: string,
  nodes: PipelineNode[],
  edges: PipelineEdge[]
): Set<string> {
  const dependencies = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  function traverse(id: string) {
    if (dependencies.has(id)) return;
    dependencies.add(id);

    // Find all edges where this node is the target (incoming edges)
    const incomingEdges = edges.filter((e) => e.target === id);
    for (const edge of incomingEdges) {
      if (nodeMap.has(edge.source)) {
        traverse(edge.source);
      }
    }
  }

  traverse(nodeId);
  return dependencies;
}

export function SelectedSqlTab() {
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();
  const selectedNodeIds = useSelectedNodeIds();

  const sql = useMemo(() => {
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

    // Get all upstream dependencies including the selected node
    const dependencyIds = getUpstreamDependencies(selectedNodeId, nodes, edges);

    // Filter nodes and edges to only include dependencies
    const filteredNodes = nodes.filter((n) => dependencyIds.has(n.id));
    const filteredEdges = edges.filter(
      (e) => dependencyIds.has(e.source) && dependencyIds.has(e.target)
    );

    if (filteredNodes.length === 0) {
      return null;
    }

    return generateSQLPreview(filteredNodes, filteredEdges);
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
            {sql ? (
              <>
                <span className="text-slate-400 block mb-2">
                  -- SQL for: {selectedNode?.data.label ?? "Unknown"} and its
                  dependencies
                </span>
                {sql}
              </>
            ) : selectedNodeIds.length === 0 ? (
              <span className="text-slate-400">
                Select a node to see its SQL and dependencies.
              </span>
            ) : (
              <span className="text-slate-400">
                No SQL generated for the selected node.
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

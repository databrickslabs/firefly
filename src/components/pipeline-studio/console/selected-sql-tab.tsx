"use client";

import { useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  usePipelineNodes,
  usePipelineEdges,
  useSelectedNodeIds,
  usePipelineMetadata,
} from "@/providers/pipeline-store-provider";
import { useActiveOrganizationId, useUserEmail } from "@/providers/user-store-provider";
import { generateSampleSQL, generateDestinationSQL, type FireflyMetadata } from "@/lib/pipeline-to-sql";

export function SelectedSqlTab() {
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();
  const selectedNodeIds = useSelectedNodeIds();
  const { pipelineId } = usePipelineMetadata();
  const orgId = useActiveOrganizationId();
  const userEmail = useUserEmail();

  // Firefly metadata for table properties
  const fireflyMetadata: FireflyMetadata = useMemo(() => ({
    pipelineId,
    orgId,
    userId: userEmail,
  }), [pipelineId, orgId, userEmail]);

  const sqlResult = useMemo(() => {
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

    // Check if selected node is a destination (MV or View)
    // If so, generate the full CREATE statement (stopping at upstream MVs/views)
    const isDestination = selectedNode.data.category === "destination";
    const isViewType = selectedNode.data.subtype === "materialized-view" ||
                       selectedNode.data.subtype === "view";

    if (isDestination && isViewType) {
      // For MV/View destinations, generate CREATE statement
      // This uses the same traversal logic as generateSampleSQL - stops at upstream MVs/views
      return generateDestinationSQL(selectedNodeId, nodes, edges, fireflyMetadata);
    }

    // For non-destination nodes, use generateSampleSQL with limit=0
    // This properly handles MV/views as terminal sources and generates SELECT queries
    return generateSampleSQL(selectedNodeId, nodes, edges, 0);
  }, [nodes, edges, selectedNodeIds, fireflyMetadata]);

  // Find the selected node label for display
  const selectedNode = selectedNodeIds.length > 0
    ? nodes.find((n) => n.id === selectedNodeIds[0])
    : null;

  // Build display content based on result
  const renderContent = () => {
    if (selectedNodeIds.length === 0) {
      return (
        <span className="text-slate-400">
          Select a node to see its SQL and dependencies.
        </span>
      );
    }

    if (!sqlResult) {
      return (
        <span className="text-slate-400">
          No SQL generated for the selected node.
        </span>
      );
    }

    if (!sqlResult.isValid) {
      return (
        <>
          <span className="text-red-500 block mb-2">
            -- Cannot generate SQL for: {selectedNode?.data.label ?? "Unknown"}
          </span>
          {sqlResult.errors.map((error, i) => (
            <span key={i} className="text-red-400 block">-- Error: {error}</span>
          ))}
          {sqlResult.invalidNodes.length > 0 && (
            <>
              <span className="text-red-400 block mt-2">-- Nodes with missing fields:</span>
              {sqlResult.invalidNodes.map((node, i) => (
                <span key={i} className="text-red-400 block">
                  --   {node.label}: {node.issues.join(", ")}
                </span>
              ))}
            </>
          )}
        </>
      );
    }

    return (
      <>
        <span className="text-slate-400 block mb-2">
          -- SQL for: {selectedNode?.data.label ?? "Unknown"} and its dependencies
        </span>
        {sqlResult.warnings.length > 0 && (
          <>
            {sqlResult.warnings.map((warning, i) => (
              <span key={i} className="text-amber-500 block">-- Warning: {warning}</span>
            ))}
            <span className="block mb-2" />
          </>
        )}
        {sqlResult.sql}
      </>
    );
  };

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0 overflow-hidden">
        <ScrollArea className="h-full w-full" type="always">
          <pre className="p-4 font-mono text-xs text-slate-700 whitespace-pre">
            {renderContent()}
          </pre>
          <ScrollBar orientation="horizontal" />
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </div>
    </div>
  );
}

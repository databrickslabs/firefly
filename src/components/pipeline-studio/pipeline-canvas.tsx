"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  type Connection,
  type OnSelectionChangeParams,
  type DefaultEdgeOptions,
  BackgroundVariant,
  SelectionMode,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./pipeline-canvas.css";

import { nodeTypes, getNodeType, getDefaultLabel } from "./nodes";
import { useDnD } from "./dnd-context";
import { usePipelineStore } from "@/providers/pipeline-store-provider";
import { useReactFlow } from "@xyflow/react";
import { nanoid } from "nanoid";
import type { PipelineNode, PipelineNodeData, NodeCategory } from "@/stores/pipeline-store";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

export function PipelineCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const { dragData, clearDragData } = useDnD();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    addNode,
    selectNode,
    selectNodes,
    selectedNodeIds,
    deleteNodes,
    copySelectedNodes,
    pasteNodes,
    setEdges,
    addLog,
  } = usePipelineStore();

  // Default edge options for better clickability and styling
  const defaultEdgeOptions: DefaultEdgeOptions = {
    style: { strokeWidth: 2, stroke: "#94a3b8" },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: "#94a3b8",
    },
    interactionWidth: 20, // Makes edges easier to click
  };


  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(addEdge(connection, edges));
      addLog("info", `Connected ${connection.source} → ${connection.target}`);
    },
    [edges, setEdges, addLog]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!dragData) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeId = nanoid();
      const nodeType = getNodeType(dragData.category, dragData.subtype);

      const newNode: PipelineNode = {
        id: nodeId,
        type: nodeType,
        position,
        data: {
          label: getDefaultLabel(dragData.category, dragData.subtype),
          category: dragData.category,
          subtype: dragData.subtype,
          config: {},
        } as PipelineNodeData,
      };

      addNode(newNode);
      selectNode(nodeId);
      addLog(
        "info",
        `Added ${dragData.category} node: ${newNode.data.label}`
      );
      clearDragData();
    },
    [screenToFlowPosition, dragData, addNode, selectNode, addLog, clearDragData]
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: PipelineNode) => {
      // If shift is held, toggle selection (add/remove from selection)
      if (event.shiftKey) {
        const isSelected = selectedNodeIds.includes(node.id);
        if (isSelected) {
          selectNodes(selectedNodeIds.filter((id) => id !== node.id));
        } else {
          selectNodes([...selectedNodeIds, node.id]);
        }
      } else {
        // Normal click - select only this node
        selectNode(node.id);
      }
    },
    [selectNode, selectNodes, selectedNodeIds]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Handle selection changes from React Flow (box selection, etc.)
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      const selectedIds = selectedNodes.map((n) => n.id);
      selectNodes(selectedIds);
    },
    [selectNodes]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      // Don't trigger shortcuts if user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Copy: Ctrl/Cmd + C
      if (modifierKey && event.key === "c") {
        if (selectedNodeIds.length > 0) {
          copySelectedNodes();
          addLog("info", `Copied ${selectedNodeIds.length} node(s)`);
        }
        return;
      }

      // Paste: Ctrl/Cmd + V
      if (modifierKey && event.key === "v") {
        pasteNodes();
        addLog("info", "Pasted nodes");
        return;
      }

      // Delete: Delete or Backspace
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedNodeIds.length > 0) {
          event.preventDefault();
          setShowDeleteDialog(true);
        }
        return;
      }

      // Select all: Ctrl/Cmd + A
      if (modifierKey && event.key === "a") {
        event.preventDefault();
        selectNodes(nodes.map((n) => n.id));
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedNodeIds,
    copySelectedNodes,
    pasteNodes,
    addLog,
    nodes,
    selectNodes,
  ]);

  // Handle delete confirmation
  const handleConfirmDelete = useCallback(() => {
    const count = selectedNodeIds.length;
    const nodeLabels = nodes
      .filter((n) => selectedNodeIds.includes(n.id))
      .map((n) => n.data.label);
    deleteNodes(selectedNodeIds);
    addLog("warn", `Deleted ${count} node(s): ${nodeLabels.join(", ")}`);
    setShowDeleteDialog(false);
  }, [selectedNodeIds, nodes, deleteNodes, addLog]);

  // MiniMap node color based on category
  const getNodeColor = (node: PipelineNode) => {
    const category = node.data?.category as NodeCategory | undefined;
    const colors: Record<NodeCategory, string> = {
      source: "#3b82f6",
      transform: "#a855f7",
      ai: "#f59e0b",
      destination: "#22c55e",
    };
    return category ? colors[category] : "#64748b";
  };

  // Get selected node labels for delete dialog
  const selectedNodeLabels = nodes
    .filter((n) => selectedNodeIds.includes(n.id))
    .map((n) => n.data.label);

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
        panOnDrag={[1, 2]} // Pan with middle or right mouse button
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        className="bg-slate-50"
      >
        <Controls position="bottom-left" />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <MiniMap
          nodeColor={getNodeColor}
          position="bottom-right"
          className="!bg-white !border-slate-200"
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        nodeCount={selectedNodeIds.length}
        nodeLabels={selectedNodeLabels}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

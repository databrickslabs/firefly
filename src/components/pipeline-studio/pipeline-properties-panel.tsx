"use client";

import { useCallback, useState } from "react";
import { Trash2, Copy, Layers, Settings, Columns } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useSelectedNode,
  useSelectedNodeIds,
  useSelectedNodes,
  usePipelineStore,
} from "@/providers/pipeline-store-provider";
import {
  NoSelectionPanel,
  SourceProperties,
  TransformProperties,
  JoinProperties,
  FilterProperties,
  AIProperties,
  DestinationProperties,
  ColumnMappingProperties,
} from "./properties";
import { getNodeIcon } from "./nodes";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import type { PipelineNodeData } from "@/stores/pipeline-store";

export function PipelinePropertiesPanel() {
  const selectedNode = useSelectedNode();
  const selectedNodeIds = useSelectedNodeIds();
  const selectedNodes = useSelectedNodes();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { updateNodeData, deleteNode, deleteNodes, copySelectedNodes, addLog } =
    usePipelineStore();

  const handleUpdateConfig = useCallback(
    (updates: Partial<PipelineNodeData["config"]>) => {
      if (!selectedNode) return;
      updateNodeData(selectedNode.id, {
        config: { ...selectedNode.data.config, ...updates },
      });
    },
    [selectedNode, updateNodeData]
  );

  const handleUpdateNodeData = useCallback(
    (updates: Partial<PipelineNodeData>) => {
      if (!selectedNode) return;
      updateNodeData(selectedNode.id, updates);
    },
    [selectedNode, updateNodeData]
  );

  const handleUpdateLabel = useCallback(
    (label: string) => {
      if (!selectedNode) return;
      updateNodeData(selectedNode.id, { label });
    },
    [selectedNode, updateNodeData]
  );

  const handleDelete = useCallback(() => {
    if (!selectedNode) return;
    deleteNode(selectedNode.id);
    addLog("warn", `Deleted node: ${selectedNode.data.label}`);
  }, [selectedNode, deleteNode, addLog]);

  const handleDeleteMultiple = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    const labels = selectedNodes.map((n) => n.data.label);
    deleteNodes(selectedNodeIds);
    addLog("warn", `Deleted ${selectedNodeIds.length} nodes: ${labels.join(", ")}`);
    setShowDeleteDialog(false);
  }, [selectedNodeIds, selectedNodes, deleteNodes, addLog]);

  const handleCopySelected = useCallback(() => {
    copySelectedNodes();
    addLog("info", `Copied ${selectedNodeIds.length} node(s)`);
  }, [copySelectedNodes, selectedNodeIds, addLog]);

  const renderPropertiesForm = () => {
    if (!selectedNode) return null;
    const { data } = selectedNode;
    const category = data.category;
    const subtype = data.subtype;

    switch (category) {
      case "source":
        return <SourceProperties data={data} onUpdate={handleUpdateConfig} />;
      case "transform":
        if (subtype === "join") {
          return <JoinProperties data={data} nodeId={selectedNode.id} onUpdate={handleUpdateConfig} />;
        }
        if (subtype === "filter") {
          return <FilterProperties data={data} onUpdate={handleUpdateConfig} />;
        }
        return <TransformProperties data={data} onUpdate={handleUpdateConfig} />;
      case "ai":
        return <AIProperties data={data} onUpdate={handleUpdateConfig} />;
      case "destination":
        return <DestinationProperties data={data} onUpdate={handleUpdateConfig} />;
      default:
        return null;
    }
  };

  // Get icon if single node is selected
  const Icon = selectedNode
    ? getNodeIcon(selectedNode.data.category, selectedNode.data.subtype)
    : null;

  // Check if multiple nodes are selected
  const isMultiSelect = selectedNodeIds.length > 1;

  // Render multi-selection panel
  const renderMultiSelectPanel = () => (
    <>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0 p-2 rounded-md bg-slate-100">
            <Layers className="h-5 w-5 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-slate-900">
              {selectedNodeIds.length} nodes selected
            </h3>
            <p className="text-xs text-slate-500">
              Multiple selection mode
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {/* Selected nodes list */}
            <div className="space-y-2">
              <Label>Selected Nodes</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {selectedNodes.map((node) => {
                  const NodeIcon = getNodeIcon(node.data.category, node.data.subtype);
                  return (
                    <div
                      key={node.id}
                      className="flex items-center gap-2 p-2 rounded-md bg-slate-50 text-sm"
                    >
                      <NodeIcon className="h-4 w-4 text-slate-500" />
                      <span className="truncate">{node.data.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Bulk actions */}
            <div className="space-y-2">
              <Label>Bulk Actions</Label>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleCopySelected}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy {selectedNodeIds.length} Nodes
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
                  onClick={handleDeleteMultiple}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete {selectedNodeIds.length} Nodes
                </Button>
              </div>
            </div>

            <Separator />

            {/* Keyboard shortcuts hint */}
            <div className="text-xs text-slate-400 space-y-1">
              <p><kbd className="px-1 py-0.5 bg-slate-100 rounded text-[10px]">Ctrl/Cmd + C</kbd> to copy</p>
              <p><kbd className="px-1 py-0.5 bg-slate-100 rounded text-[10px]">Ctrl/Cmd + V</kbd> to paste</p>
              <p><kbd className="px-1 py-0.5 bg-slate-100 rounded text-[10px]">Delete</kbd> to delete</p>
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  );

  // Check if node supports column mapping (all node types except we show different UI for sources)
  const supportsColumnMapping = selectedNode !== null;

  // Render single node panel
  const renderSingleNodePanel = () => (
    <>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0 p-2 rounded-md bg-slate-100">
            {Icon && <Icon className="h-5 w-5 text-slate-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-slate-900 truncate">
              {selectedNode!.data.label}
            </h3>
            <p className="text-xs text-slate-500 capitalize">
              {selectedNode!.data.category} · {selectedNode!.data.subtype.replace("-", " ")}
            </p>
          </div>
        </div>
      </div>

      {/* Tabbed Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        <Tabs defaultValue="settings" className="flex-1 flex flex-col min-h-0">
          <div className="flex-shrink-0 px-4 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="settings" className="flex-1 gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </TabsTrigger>
              {supportsColumnMapping && (
                <TabsTrigger value="columns" className="flex-1 gap-1.5">
                  <Columns className="h-3.5 w-3.5" />
                  Columns
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="settings" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                {/* Node Name */}
                <div className="space-y-2">
                  <Label htmlFor="nodeName">Node Name</Label>
                  <Input
                    id="nodeName"
                    value={selectedNode!.data.label}
                    onChange={(e) => handleUpdateLabel(e.target.value)}
                    placeholder="Enter node name"
                  />
                </div>

                <Separator />

                {/* Category-specific properties */}
                {renderPropertiesForm()}

                <Separator />

                {/* Delete Button */}
                <Button
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Node
                </Button>
              </div>
            </ScrollArea>
          </TabsContent>

          {supportsColumnMapping && (
            <TabsContent value="columns" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <ColumnMappingProperties
                    data={selectedNode!.data}
                    nodeId={selectedNode!.id}
                    onUpdate={handleUpdateNodeData}
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );

  // Determine what to render
  const renderContent = () => {
    // If no nodes selected, show no selection panel
    if (selectedNodeIds.length === 0 || (!isMultiSelect && !selectedNode)) {
      return <NoSelectionPanel />;
    }

    // If multiple nodes selected, show multi-select panel
    if (isMultiSelect) {
      return renderMultiSelectPanel();
    }

    // Single node selected
    return renderSingleNodePanel();
  };

  // Always render the same container structure for consistent reconciliation
  return (
    <div className="h-full flex flex-col border-l border-slate-200 bg-white overflow-hidden">
      {renderContent()}

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        nodeCount={selectedNodeIds.length}
        nodeLabels={selectedNodes.map((n) => n.data.label)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

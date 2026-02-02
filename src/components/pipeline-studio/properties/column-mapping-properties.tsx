"use client";

import { useMemo, useCallback, useState } from "react";
import { ArrowRight, Check, X, Play } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  usePipelineNodes,
  usePipelineEdges,
  useSampleDataByNode,
} from "@/providers/pipeline-store-provider";
import type { ColumnMappingConfig, PipelineNode, PipelineNodeData } from "@/stores/pipeline-store";

interface ColumnRowProps {
  column: ColumnMappingConfig;
  onToggle: (name: string, selected: boolean) => void;
  onAliasChange: (name: string, alias: string) => void;
}

function ColumnRow({ column, onToggle, onAliasChange }: ColumnRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [aliasValue, setAliasValue] = useState(column.alias || "");

  const handleSaveAlias = () => {
    onAliasChange(column.name, aliasValue.trim());
    setIsEditing(false);
  };

  const handleCancelAlias = () => {
    setAliasValue(column.alias || "");
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-slate-50 group">
      <Checkbox
        id={`col-${column.name}`}
        checked={column.selected}
        onCheckedChange={(checked) => onToggle(column.name, checked === true)}
      />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {column.side && (
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${
              column.side === "a"
                ? "bg-blue-50 text-blue-600 border-blue-200"
                : "bg-purple-50 text-purple-600 border-purple-200"
            }`}
          >
            {column.side.toUpperCase()}
          </Badge>
        )}
        <span
          className={`text-sm font-mono truncate ${!column.selected ? "text-slate-400 line-through" : "text-slate-700"}`}
        >
          {column.name}
        </span>
        {column.alias && !isEditing && (
          <>
            <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
            <span className="text-sm font-mono text-blue-600 truncate">
              {column.alias}
            </span>
          </>
        )}
      </div>
      {isEditing ? (
        <div className="flex items-center gap-1">
          <Input
            value={aliasValue}
            onChange={(e) => setAliasValue(e.target.value)}
            placeholder="Alias"
            className="h-6 w-24 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveAlias();
              if (e.key === "Escape") handleCancelAlias();
            }}
          />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleSaveAlias}>
            <Check className="h-3 w-3 text-green-600" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCancelAlias}>
            <X className="h-3 w-3 text-slate-400" />
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => setIsEditing(true)}
          disabled={!column.selected}
        >
          {column.alias ? "Edit" : "Alias"}
        </Button>
      )}
    </div>
  );
}

interface ColumnMappingPropertiesProps {
  data: PipelineNodeData;
  nodeId: string;
  onUpdate: (updates: Partial<PipelineNodeData>) => void;
}

export function ColumnMappingProperties({ data, nodeId, onUpdate }: ColumnMappingPropertiesProps) {
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();
  const sampleDataByNode = useSampleDataByNode();

  const isJoinNode = data.subtype === "join";
  const isSourceNode = data.category === "source";

  // For join nodes, find the input nodes
  const joinInputs = useMemo(() => {
    if (!isJoinNode) return null;

    // Find edges going into this node
    const inputEdges = edges.filter((e) => e.target === nodeId);

    // Find edges by handle (input-a and input-b)
    const inputAEdge = inputEdges.find((e) => e.targetHandle === "input-a");
    const inputBEdge = inputEdges.find((e) => e.targetHandle === "input-b");

    const inputANode = inputAEdge
      ? nodes.find((n) => n.id === inputAEdge.source) ?? null
      : null;
    const inputBNode = inputBEdge
      ? nodes.find((n) => n.id === inputBEdge.source) ?? null
      : null;

    return {
      inputANode,
      inputBNode,
    };
  }, [isJoinNode, nodeId, edges, nodes]);

  // For non-join, non-source nodes, find the upstream node
  const upstreamNode = useMemo(() => {
    if (isJoinNode || isSourceNode) return null;
    const incomingEdge = edges.find((e) => e.target === nodeId);
    if (!incomingEdge) return null;
    return nodes.find((n) => n.id === incomingEdge.source) ?? null;
  }, [isJoinNode, isSourceNode, nodeId, edges, nodes]);

  // Helper to get columns from a node
  const getNodeColumns = useCallback((node: PipelineNode | null): string[] => {
    if (!node) return [];

    // First, check if the node has column mapping output (use that as columns)
    if (node.data.columnMapping && node.data.columnMapping.length > 0) {
      // Use the output columns (selected with aliases applied)
      return node.data.columnMapping
        .filter((c) => c.selected)
        .map((c) => c.alias || c.name);
    }

    // Try to get columns from sample data
    const nodeSample = sampleDataByNode[node.id];
    if (nodeSample?.columns && nodeSample.columns.length > 0) {
      return nodeSample.columns;
    }

    // For source tables, try to get from config.columns
    const config = node.data.config as { columns?: { name: string }[] };
    if (config.columns && config.columns.length > 0) {
      return config.columns.map((c) => c.name);
    }

    return [];
  }, [sampleDataByNode]);

  // Get columns for source nodes directly from sample data or config
  const getSourceColumns = useCallback((): string[] => {
    // First check sample data for this node
    const nodeSample = sampleDataByNode[nodeId];
    if (nodeSample?.columns && nodeSample.columns.length > 0) {
      return nodeSample.columns;
    }

    // For source tables, try to get from config.columns
    const config = data.config as { columns?: { name: string }[] };
    if (config.columns && config.columns.length > 0) {
      return config.columns.map((c) => c.name);
    }

    return [];
  }, [sampleDataByNode, nodeId, data.config]);

  // Get available columns based on node type
  const availableColumns = useMemo((): ColumnMappingConfig[] => {
    // For source nodes, get columns from this node's sample data or config
    if (isSourceNode) {
      const columns = getSourceColumns();
      return columns.map((name) => ({
        name,
        selected: true,
        alias: undefined,
      }));
    }

    // For join nodes, combine columns from both inputs
    if (isJoinNode && joinInputs) {
      const { inputANode, inputBNode } = joinInputs;

      const columnsA = getNodeColumns(inputANode);
      const columnsB = getNodeColumns(inputBNode);

      const result: ColumnMappingConfig[] = [];

      // Add columns from side A with prefix
      columnsA.forEach((col) => {
        result.push({
          name: `a.${col}`,
          selected: true,
          alias: undefined,
          side: "a",
        });
      });

      // Add columns from side B with prefix
      columnsB.forEach((col) => {
        result.push({
          name: `b.${col}`,
          selected: true,
          alias: undefined,
          side: "b",
        });
      });

      return result;
    }

    // For regular nodes, get columns from upstream
    const columns = getNodeColumns(upstreamNode);
    return columns.map((name) => ({
      name,
      selected: true,
      alias: undefined,
    }));
  }, [isSourceNode, isJoinNode, joinInputs, upstreamNode, getNodeColumns, getSourceColumns]);

  // Get current column mapping (from node data or default to available)
  const currentMapping = useMemo((): ColumnMappingConfig[] => {
    if (data.columnMapping && data.columnMapping.length > 0) {
      // Merge with available columns to preserve side info
      return data.columnMapping.map((col) => {
        const available = availableColumns.find((a) => a.name === col.name);
        return {
          ...col,
          side: available?.side,
        };
      });
    }
    return availableColumns;
  }, [data.columnMapping, availableColumns]);

  // Check if using SELECT * (all columns selected, no aliases)
  const isSelectAll = useMemo(() => {
    if (currentMapping.length === 0) return true;
    return currentMapping.every((c) => c.selected && !c.alias);
  }, [currentMapping]);

  // Update column mapping
  const updateColumnMapping = useCallback(
    (newColumns: ColumnMappingConfig[]) => {
      // If all columns are selected with no aliases, clear the mapping (use *)
      const allSelected = newColumns.every((c) => c.selected && !c.alias);
      onUpdate({
        columnMapping: allSelected ? undefined : newColumns.map(({ name, selected, alias }) => ({
          name,
          selected,
          alias,
        })),
      });
    },
    [onUpdate]
  );

  // Toggle column selection
  const handleToggleColumn = useCallback(
    (name: string, selected: boolean) => {
      const newColumns = currentMapping.map((c) =>
        c.name === name ? { ...c, selected } : c
      );
      updateColumnMapping(newColumns);
    },
    [currentMapping, updateColumnMapping]
  );

  // Update column alias
  const handleAliasChange = useCallback(
    (name: string, alias: string) => {
      const newColumns = currentMapping.map((c) =>
        c.name === name ? { ...c, alias: alias || undefined } : c
      );
      updateColumnMapping(newColumns);
    },
    [currentMapping, updateColumnMapping]
  );

  // Select all columns
  const handleSelectAll = useCallback(() => {
    const newColumns = currentMapping.map((c) => ({ ...c, selected: true }));
    updateColumnMapping(newColumns);
  }, [currentMapping, updateColumnMapping]);

  // Deselect all columns
  const handleDeselectAll = useCallback(() => {
    const newColumns = currentMapping.map((c) => ({ ...c, selected: false }));
    updateColumnMapping(newColumns);
  }, [currentMapping, updateColumnMapping]);

  // Clear all aliases
  const handleClearAliases = useCallback(() => {
    const newColumns = currentMapping.map((c) => ({ ...c, alias: undefined }));
    updateColumnMapping(newColumns);
  }, [currentMapping, updateColumnMapping]);

  // Calculate selected count
  const selectedCount = currentMapping.filter((c) => c.selected).length;
  const hasAliases = currentMapping.some((c) => c.alias);

  // For joins, count columns per side
  const sideACols = currentMapping.filter((c) => c.side === "a");
  const sideBCols = currentMapping.filter((c) => c.side === "b");

  // Determine which nodes need sampling
  const needsSampling: string[] = [];
  if (isSourceNode) {
    // Source nodes need to sample themselves
    if (availableColumns.length === 0) {
      needsSampling.push(data.label);
    }
  } else if (isJoinNode && joinInputs) {
    if (joinInputs.inputANode && getNodeColumns(joinInputs.inputANode).length === 0) {
      needsSampling.push(joinInputs.inputANode.data.label);
    }
    if (joinInputs.inputBNode && getNodeColumns(joinInputs.inputBNode).length === 0) {
      needsSampling.push(joinInputs.inputBNode.data.label);
    }
  } else if (availableColumns.length === 0 && upstreamNode) {
    needsSampling.push(upstreamNode.data.label);
  }

  // Check if node has upstream connection (only for non-source, non-join nodes)
  if (!isSourceNode && !isJoinNode && !upstreamNode) {
    return (
      <div className="text-center py-6 text-sm text-slate-500">
        <p className="font-medium">No input connection</p>
        <p className="text-xs mt-1">
          Connect an upstream node to configure column mapping.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Output Columns</Label>
        <div className="flex items-center gap-1">
          {isSelectAll ? (
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              SELECT *
            </span>
          ) : (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              {selectedCount}/{currentMapping.length} columns
            </span>
          )}
        </div>
      </div>

      {/* Show join side info if applicable */}
      {isJoinNode && sideACols.length > 0 && sideBCols.length > 0 && (
        <div className="flex gap-2 text-xs">
          <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded">
            Side A: {sideACols.filter((c) => c.selected).length}/{sideACols.length}
          </span>
          <span className="px-2 py-1 bg-purple-50 text-purple-600 rounded">
            Side B: {sideBCols.filter((c) => c.selected).length}/{sideBCols.length}
          </span>
        </div>
      )}

      {needsSampling.length > 0 ? (
        <div className="text-center py-6 text-sm text-slate-500 border rounded-lg bg-slate-50">
          <Play className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          <p className="font-medium">No columns available</p>
          <p className="text-xs mt-1 px-4">
            Run <span className="font-medium">Sample</span> on{" "}
            {needsSampling.length === 1 ? (
              <span className="font-mono text-blue-600">{needsSampling[0]}</span>
            ) : (
              <>
                <span className="font-mono text-blue-600">{needsSampling[0]}</span>
                {" and "}
                <span className="font-mono text-purple-600">{needsSampling[1]}</span>
              </>
            )}
            {" "}to discover columns.
          </p>
        </div>
      ) : (
        <>
          {/* Quick actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs flex-1"
              onClick={handleSelectAll}
              disabled={selectedCount === currentMapping.length}
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs flex-1"
              onClick={handleDeselectAll}
              disabled={selectedCount === 0}
            >
              Clear
            </Button>
            {hasAliases && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleClearAliases}
              >
                Clear Aliases
              </Button>
            )}
          </div>

          {/* Column list */}
          <div className="border rounded-md max-h-64 overflow-y-auto">
            {currentMapping.map((column) => (
              <ColumnRow
                key={column.name}
                column={column}
                onToggle={handleToggleColumn}
                onAliasChange={handleAliasChange}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

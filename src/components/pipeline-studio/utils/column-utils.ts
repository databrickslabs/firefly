/**
 * Utilities for working with column metadata in the pipeline
 */

import type { Column } from "@/hooks/use-unity-catalog";

export interface PipelineNode {
  id: string;
  data: {
    label: string;
    category: string;
    subtype: string;
    config: Record<string, unknown>;
  };
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface ColumnInfo {
  name: string;
  type: string;
  sourceNodeId: string;
  sourceNodeLabel: string;
}

/**
 * Get columns from a node's config if available
 */
function getNodeColumns(node: PipelineNode): Column[] | undefined {
  const config = node.data.config;
  if (config && Array.isArray(config.columns)) {
    return config.columns as Column[];
  }
  return undefined;
}

/**
 * Get columns available at a specific node by traversing upstream
 * Returns columns with source information
 */
export function getUpstreamColumns(
  nodeId: string,
  nodes: PipelineNode[],
  edges: PipelineEdge[]
): ColumnInfo[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const columns: ColumnInfo[] = [];
  const visited = new Set<string>();

  function traverse(currentNodeId: string) {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    const node = nodeMap.get(currentNodeId);
    if (!node) return;

    // Check if this node has columns defined
    const nodeColumns = getNodeColumns(node);
    if (nodeColumns) {
      // Add columns from this node
      for (const col of nodeColumns) {
        columns.push({
          name: col.name,
          type: col.type_text || col.type_name || "unknown",
          sourceNodeId: node.id,
          sourceNodeLabel: node.data.label,
        });
      }
      // Don't traverse further - we found a source of columns
      return;
    }

    // No columns here, traverse upstream
    const incomingEdges = edges.filter((e) => e.target === currentNodeId);
    for (const edge of incomingEdges) {
      traverse(edge.source);
    }
  }

  traverse(nodeId);
  return columns;
}

/**
 * Get columns from the immediate upstream nodes of a given node
 * Returns a map of handle -> columns for join nodes
 */
export function getInputColumnsForNode(
  nodeId: string,
  nodes: PipelineNode[],
  edges: PipelineEdge[]
): { left: ColumnInfo[]; right: ColumnInfo[] } {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const incomingEdges = edges.filter((e) => e.target === nodeId);

  const result: { left: ColumnInfo[]; right: ColumnInfo[] } = {
    left: [],
    right: [],
  };

  for (const edge of incomingEdges) {
    const handle = edge.targetHandle;
    const columns = getUpstreamColumns(edge.source, nodes, edges);

    if (handle === "input-a" || (!handle && result.left.length === 0)) {
      result.left = columns;
    } else if (handle === "input-b" || result.right.length === 0) {
      result.right = columns;
    }
  }

  return result;
}

/**
 * Format column options for dropdown display
 */
export function formatColumnOptions(
  columns: ColumnInfo[],
  prefix?: string
): { value: string; label: string; description?: string }[] {
  return columns.map((col) => ({
    value: prefix ? `${prefix}.${col.name}` : col.name,
    label: prefix ? `${prefix}.${col.name}` : col.name,
    description: `${col.type} (${col.sourceNodeLabel})`,
  }));
}

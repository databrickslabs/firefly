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
    columnMapping?: { name: string; selected: boolean; alias?: string }[];
  };
}

export interface SampleDataByNode {
  [nodeId: string]: {
    columns?: string[];
    data?: unknown[];
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
 * Get columns from a node using multiple sources:
 * 1. Sample data (for nodes that have been sampled - most accurate)
 * 2. Aggregate node output (group by columns + aggregate aliases)
 * 3. Projection node output (selected columns + derived columns)
 * 4. Config columns (for source nodes with Unity Catalog columns)
 *
 * Note: We intentionally do NOT use columnMapping here because it stores
 * INPUT column names (e.g., "a.column" for joins) rather than OUTPUT column names.
 * Sample data represents the actual output columns after execution.
 */
function getNodeColumnsFromAllSources(
  node: PipelineNode,
  sampleDataByNode?: SampleDataByNode
): { name: string; type: string }[] | undefined {
  // 1. Check sample data first - this is the most accurate representation
  // of actual output columns after the node executes
  if (sampleDataByNode) {
    const nodeSample = sampleDataByNode[node.id];
    if (nodeSample?.columns && nodeSample.columns.length > 0) {
      return nodeSample.columns.map((name) => ({
        name,
        type: "unknown",
      }));
    }
  }

  // 2. Check aggregate node output (group by + aggregate aliases)
  if (node.data.subtype === "aggregate") {
    const config = node.data.config as {
      groupByColumns?: string[];
      aggregates?: { alias: string }[];
    };
    const outputColumns: { name: string; type: string }[] = [];

    if (config.groupByColumns) {
      config.groupByColumns.forEach((col) => {
        outputColumns.push({ name: col, type: "unknown" });
      });
    }

    if (config.aggregates) {
      config.aggregates.forEach((agg) => {
        if (agg.alias) {
          outputColumns.push({ name: agg.alias, type: "unknown" });
        }
      });
    }

    if (outputColumns.length > 0) {
      return outputColumns;
    }
  }

  // 3. Check projection node output (selected columns + derived columns)
  if (node.data.subtype === "projection") {
    const config = node.data.config as {
      columns?: string[];
      derivedColumns?: { expression: string; alias: string }[];
    };
    const outputColumns: { name: string; type: string }[] = [];

    if (config.columns) {
      config.columns.forEach((col) => {
        outputColumns.push({ name: col, type: "unknown" });
      });
    }

    if (config.derivedColumns) {
      config.derivedColumns.forEach((dc) => {
        const name = dc.alias || dc.expression;
        if (name) {
          outputColumns.push({ name, type: "unknown" });
        }
      });
    }

    if (outputColumns.length > 0) {
      return outputColumns;
    }
  }

  // 4. Check config.columns (for source nodes)
  const config = node.data.config;
  if (config && Array.isArray(config.columns)) {
    const cols = config.columns as Column[];
    return cols.map((col) => ({
      name: col.name,
      type: col.type_text || col.type_name || "unknown",
    }));
  }

  return undefined;
}

/**
 * Get columns available at a specific node by traversing upstream
 * Returns columns with source information (deduplicated by column name)
 * @param sampleDataByNode - Optional sample data map for checking sampled columns
 */
export function getUpstreamColumns(
  nodeId: string,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  sampleDataByNode?: SampleDataByNode
): ColumnInfo[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const columns: ColumnInfo[] = [];
  const visited = new Set<string>();
  const seenColumnNames = new Set<string>();

  function traverse(currentNodeId: string) {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    const node = nodeMap.get(currentNodeId);
    if (!node) return;

    // Check if this node has columns defined (from any source)
    const nodeColumns = getNodeColumnsFromAllSources(node, sampleDataByNode);
    if (nodeColumns && nodeColumns.length > 0) {
      // Add columns from this node (deduplicated)
      for (const col of nodeColumns) {
        if (!seenColumnNames.has(col.name)) {
          seenColumnNames.add(col.name);
          columns.push({
            name: col.name,
            type: col.type,
            sourceNodeId: node.id,
            sourceNodeLabel: node.data.label,
          });
        }
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

  // Start from upstream nodes, not from the current node itself
  // This prevents a node from seeing its own output columns
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  for (const edge of incomingEdges) {
    traverse(edge.source);
  }

  return columns;
}

/**
 * Get columns from the immediate upstream nodes of a given node
 * Returns a map of handle -> columns for join nodes
 */
export function getInputColumnsForNode(
  nodeId: string,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  sampleDataByNode?: SampleDataByNode
): { left: ColumnInfo[]; right: ColumnInfo[] } {
  const incomingEdges = edges.filter((e) => e.target === nodeId);

  const result: { left: ColumnInfo[]; right: ColumnInfo[] } = {
    left: [],
    right: [],
  };

  for (const edge of incomingEdges) {
    const handle = edge.targetHandle;
    const columns = getUpstreamColumns(edge.source, nodes, edges, sampleDataByNode);

    if (handle === "input-a" || (!handle && result.left.length === 0)) {
      result.left = columns;
    } else if (handle === "input-b" || result.right.length === 0) {
      result.right = columns;
    }
  }

  return result;
}

/**
 * Truncate a type string to a short form (e.g., "string" -> "str", "integer" -> "int")
 */
function truncateType(type: string): string {
  const typeMap: Record<string, string> = {
    "string": "str",
    "integer": "int",
    "boolean": "bool",
    "double": "dbl",
    "float": "flt",
    "decimal": "dec",
    "timestamp": "ts",
    "date": "date",
    "binary": "bin",
    "array": "arr",
    "struct": "struct",
    "map": "map",
  };

  const lowerType = type.toLowerCase();
  // Check for exact match first
  if (typeMap[lowerType]) {
    return typeMap[lowerType];
  }
  // Check for partial match (e.g., "decimal(10,2)" -> "dec")
  for (const [key, abbrev] of Object.entries(typeMap)) {
    if (lowerType.startsWith(key)) {
      return abbrev;
    }
  }
  // Fallback: take first 4 chars
  return type.slice(0, 4).toLowerCase();
}

/**
 * Format column options for dropdown display
 * Deduplicates by column name to prevent duplicate entries
 */
export function formatColumnOptions(
  columns: ColumnInfo[],
  prefix?: string
): { value: string; label: string; description?: string }[] {
  const seen = new Set<string>();
  const result: { value: string; label: string; description?: string }[] = [];

  for (const col of columns) {
    const value = prefix ? `${prefix}.${col.name}` : col.name;
    if (!seen.has(value)) {
      seen.add(value);
      result.push({
        value,
        label: value,
        description: truncateType(col.type),
      });
    }
  }

  return result;
}

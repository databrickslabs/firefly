// Source nodes
import { TableSourceNode } from "./source-nodes/table-source-node";
import { VolumeSourceNode } from "./source-nodes/volume-source-node";
import { StreamSourceNode } from "./source-nodes/stream-source-node";

// Transform nodes
import { SqlTransformNode } from "./transform-nodes/sql-transform-node";
import { PythonTransformNode } from "./transform-nodes/python-transform-node";
import { JoinNode } from "./transform-nodes/join-node";
import { FilterNode } from "./transform-nodes/filter-node";

// AI nodes
import { InferenceNode } from "./ai-nodes/inference-node";
import { AiParseNode } from "./ai-nodes/ai-parse-node";

// Destination nodes
import { MaterializedViewNode } from "./destination-nodes/materialized-view-node";
import { ViewNode } from "./destination-nodes/view-node";
import { StreamingTableNode } from "./destination-nodes/streaming-table-node";

import type { NodeCategory, NodeSubtype } from "@/stores/pipeline-store";
import {
  Table2,
  FolderOpen,
  Radio,
  Code,
  FileCode2,
  GitMerge,
  Filter,
  Brain,
  ScanText,
  Database,
  ArrowUpToLine,
  Layers,
  Eye,
  type LucideIcon,
} from "lucide-react";

/**
 * Registry of all custom node types for React Flow
 */
export const nodeTypes = {
  // Sources
  "source-table": TableSourceNode,
  "source-volume": VolumeSourceNode,
  "source-stream": StreamSourceNode,
  // Transforms
  "transform-sql": SqlTransformNode,
  "transform-python": PythonTransformNode,
  "transform-join": JoinNode,
  "transform-filter": FilterNode,
  // AI/ML
  "ai-inference": InferenceNode,
  "ai-ai-parse": AiParseNode,
  // Destinations
  "destination-materialized-view": MaterializedViewNode,
  "destination-view": ViewNode,
  "destination-streaming": StreamingTableNode,
};

export type PipelineNodeType = keyof typeof nodeTypes;

/**
 * Get the node type key for React Flow based on category and subtype
 */
export function getNodeType(category: NodeCategory, subtype: NodeSubtype): PipelineNodeType {
  return `${category}-${subtype}` as PipelineNodeType;
}

/**
 * Node definitions for the palette
 */
export interface NodeDefinition {
  category: NodeCategory;
  subtype: NodeSubtype;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const nodeDefinitions: NodeDefinition[] = [
  // Sources
  {
    category: "source",
    subtype: "table",
    label: "Unity Catalog Table",
    icon: Table2,
    description: "Read data from a Unity Catalog table",
  },
  {
    category: "source",
    subtype: "volume",
    label: "Volume Files",
    icon: FolderOpen,
    description: "Read files from a Unity Catalog volume",
  },
  {
    category: "source",
    subtype: "stream",
    label: "Streaming Source",
    icon: Radio,
    description: "Read from Kafka or other streaming sources",
  },
  // Transforms
  {
    category: "transform",
    subtype: "sql",
    label: "SQL Transform",
    icon: Code,
    description: "Transform data using SQL expressions",
  },
  {
    category: "transform",
    subtype: "python",
    label: "Python Transform",
    icon: FileCode2,
    description: "Transform data using PySpark code",
  },
  {
    category: "transform",
    subtype: "join",
    label: "Join",
    icon: GitMerge,
    description: "Join two data sources together",
  },
  {
    category: "transform",
    subtype: "filter",
    label: "Filter",
    icon: Filter,
    description: "Filter rows based on conditions",
  },
  // AI/ML
  {
    category: "ai",
    subtype: "inference",
    label: "Model Inference",
    icon: Brain,
    description: "Run ML model inference on data",
  },
  {
    category: "ai",
    subtype: "ai-parse",
    label: "AI Parse Document",
    icon: ScanText,
    description: "Parse documents using AI",
  },
  // Destinations
  {
    category: "destination",
    subtype: "materialized-view",
    label: "Materialized View",
    icon: Layers,
    description: "Create a materialized view that can be used as input",
  },
  {
    category: "destination",
    subtype: "view",
    label: "View",
    icon: Eye,
    description: "Create a view that can be used as input",
  },
  {
    category: "destination",
    subtype: "streaming",
    label: "Streaming Table",
    icon: ArrowUpToLine,
    description: "Write to a streaming table",
  },
];

/**
 * Get node definitions grouped by category
 */
export function getNodeDefinitionsByCategory(): Record<NodeCategory, NodeDefinition[]> {
  return nodeDefinitions.reduce(
    (acc, def) => {
      if (!acc[def.category]) {
        acc[def.category] = [];
      }
      acc[def.category].push(def);
      return acc;
    },
    {} as Record<NodeCategory, NodeDefinition[]>
  );
}

/**
 * Get the default label for a new node
 */
export function getDefaultLabel(category: NodeCategory, subtype: NodeSubtype): string {
  const def = nodeDefinitions.find(
    (d) => d.category === category && d.subtype === subtype
  );
  return def?.label ?? `${category} ${subtype}`;
}

/**
 * Get the icon for a node type
 */
export function getNodeIcon(category: NodeCategory, subtype: NodeSubtype): LucideIcon {
  const def = nodeDefinitions.find(
    (d) => d.category === category && d.subtype === subtype
  );
  return def?.icon ?? Database;
}

// Re-export validation utilities
export {
  validateNode,
  getRequiredFields,
  isFieldRequired,
  getFieldLabel,
  type FieldRequirement,
  type NodeValidationResult,
  type FieldValidationResult,
} from "./node-validation";

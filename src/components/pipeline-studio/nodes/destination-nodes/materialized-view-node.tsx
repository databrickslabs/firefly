"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../base-node";
import type { PipelineNode } from "@/stores/pipeline-store";

function MaterializedViewNodeComponent(props: NodeProps<PipelineNode>) {
  // Materialized views have both input and output - they can feed into other transformations
  return <BaseNode {...props} showInput={true} showOutput={true} />;
}

export const MaterializedViewNode = memo(MaterializedViewNodeComponent);

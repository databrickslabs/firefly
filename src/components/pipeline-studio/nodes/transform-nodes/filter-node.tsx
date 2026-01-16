"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../base-node";
import type { PipelineNode } from "@/stores/pipeline-store";

function FilterNodeComponent(props: NodeProps<PipelineNode>) {
  return <BaseNode {...props} showInput={true} showOutput={true} />;
}

export const FilterNode = memo(FilterNodeComponent);

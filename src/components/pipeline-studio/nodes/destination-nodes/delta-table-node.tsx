"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../base-node";
import type { PipelineNode } from "@/stores/pipeline-store";

function DeltaTableNodeComponent(props: NodeProps<PipelineNode>) {
  return <BaseNode {...props} showInput={true} showOutput={false} />;
}

export const DeltaTableNode = memo(DeltaTableNodeComponent);

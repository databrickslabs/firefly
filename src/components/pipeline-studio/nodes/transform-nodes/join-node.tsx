"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../base-node";
import type { PipelineNode } from "@/stores/pipeline-store";

function JoinNodeComponent(props: NodeProps<PipelineNode>) {
  // Join has 2 inputs
  return <BaseNode {...props} showInput={true} showOutput={true} inputCount={2} />;
}

export const JoinNode = memo(JoinNodeComponent);

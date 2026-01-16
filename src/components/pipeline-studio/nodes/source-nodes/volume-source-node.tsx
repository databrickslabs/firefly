"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../base-node";
import type { PipelineNode } from "@/stores/pipeline-store";

function VolumeSourceNodeComponent(props: NodeProps<PipelineNode>) {
  return <BaseNode {...props} showInput={false} showOutput={true} />;
}

export const VolumeSourceNode = memo(VolumeSourceNodeComponent);

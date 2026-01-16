"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../base-node";
import type { PipelineNode } from "@/stores/pipeline-store";

function TableSourceNodeComponent(props: NodeProps<PipelineNode>) {
  return <BaseNode {...props} showInput={false} showOutput={true} />;
}

export const TableSourceNode = memo(TableSourceNodeComponent);

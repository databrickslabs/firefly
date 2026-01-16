"use client";

import { useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { usePipelineNodes, usePipelineEdges } from "@/providers/pipeline-store-provider";
import { generateSQLPreview } from "@/lib/pipeline-to-sql";

export function PipelineSqlTab() {
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();

  const sql = useMemo(() => {
    if (nodes.length === 0) {
      return null;
    }
    return generateSQLPreview(nodes, edges);
  }, [nodes, edges]);

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0 overflow-hidden">
        <ScrollArea className="h-full w-full" type="always">
          <pre className="p-4 font-mono text-xs text-slate-700 whitespace-pre">
            {sql ? (
              sql
            ) : (
              <span className="text-slate-400">
                No nodes in the pipeline. Add nodes to see the generated SQL.
              </span>
            )}
          </pre>
          <ScrollBar orientation="horizontal" />
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </div>
    </div>
  );
}

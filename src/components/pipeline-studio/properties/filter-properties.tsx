"use client";

import { Input } from "@/components/ui/input";
import { RequiredLabel } from "./required-label";
import type { PipelineNodeData } from "@/stores/pipeline-store";

interface FilterPropertiesProps {
  data: PipelineNodeData;
  onUpdate: (updates: Partial<PipelineNodeData["config"]>) => void;
}

export function FilterProperties({ data, onUpdate }: FilterPropertiesProps) {
  const config = data.config as {
    condition?: string;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <RequiredLabel htmlFor="condition" required>Filter Condition</RequiredLabel>
        <Input
          id="condition"
          placeholder="e.g., amount > 100 AND status = 'active'"
          value={config.condition || ""}
          onChange={(e) => onUpdate({ condition: e.target.value })}
          className="font-mono"
        />
        <p className="text-xs text-slate-500">
          SQL-style boolean expression to filter rows. Only rows where this condition is true will pass through.
        </p>
      </div>
    </div>
  );
}

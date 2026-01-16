"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RequiredLabel } from "./required-label";
import type { PipelineNodeData, TransformSubtype } from "@/stores/pipeline-store";

interface TransformPropertiesProps {
  data: PipelineNodeData;
  onUpdate: (updates: Partial<PipelineNodeData["config"]>) => void;
}

export function TransformProperties({ data, onUpdate }: TransformPropertiesProps) {
  const config = data.config as {
    sql?: string;
    python?: string;
    condition?: string;
  };

  const subtype = data.subtype as TransformSubtype;

  if (subtype === "sql") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <RequiredLabel htmlFor="sql" required>SQL Expression</RequiredLabel>
          <Textarea
            id="sql"
            placeholder="SELECT * FROM source_table WHERE ..."
            value={config.sql || ""}
            onChange={(e) => onUpdate({ sql: e.target.value })}
            className="font-mono text-sm min-h-[200px]"
          />
          <p className="text-xs text-slate-500">
            Use SQL to transform the incoming data. Reference upstream tables by their node names.
          </p>
        </div>
      </div>
    );
  }

  if (subtype === "python") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <RequiredLabel htmlFor="python" required>Python / PySpark Code</RequiredLabel>
          <Textarea
            id="python"
            placeholder="def transform(df):\n    return df.filter(...)"
            value={config.python || ""}
            onChange={(e) => onUpdate({ python: e.target.value })}
            className="font-mono text-sm min-h-[200px]"
          />
          <p className="text-xs text-slate-500">
            Write PySpark code to transform the DataFrame. The input is available as `df`.
          </p>
        </div>
      </div>
    );
  }

  if (subtype === "filter") {
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
            SQL-style condition to filter rows.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

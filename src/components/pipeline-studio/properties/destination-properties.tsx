"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequiredLabel } from "./required-label";
import type { PipelineNodeData, DestinationSubtype } from "@/stores/pipeline-store";

interface DestinationPropertiesProps {
  data: PipelineNodeData;
  onUpdate: (updates: Partial<PipelineNodeData["config"]>) => void;
}

export function DestinationProperties({ data, onUpdate }: DestinationPropertiesProps) {
  const config = data.config as {
    catalog?: string;
    schema?: string;
    table?: string;
    writeMode?: string;
  };

  const subtype = data.subtype as DestinationSubtype;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <RequiredLabel htmlFor="catalog" required>Catalog</RequiredLabel>
        <Input
          id="catalog"
          placeholder="e.g., main"
          value={config.catalog || ""}
          onChange={(e) => onUpdate({ catalog: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <RequiredLabel htmlFor="schema" required>Schema</RequiredLabel>
        <Input
          id="schema"
          placeholder="e.g., default"
          value={config.schema || ""}
          onChange={(e) => onUpdate({ schema: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <RequiredLabel htmlFor="table" required>Table Name</RequiredLabel>
        <Input
          id="table"
          placeholder="e.g., output_table"
          value={config.table || ""}
          onChange={(e) => onUpdate({ table: e.target.value })}
        />
      </div>
      {subtype === "delta" && (
        <div className="space-y-2">
          <Label htmlFor="writeMode">Write Mode</Label>
          <Select
            value={config.writeMode || "append"}
            onValueChange={(value) => onUpdate({ writeMode: value })}
          >
            <SelectTrigger id="writeMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="append">Append</SelectItem>
              <SelectItem value="overwrite">Overwrite</SelectItem>
              <SelectItem value="merge">Merge (Upsert)</SelectItem>
              <SelectItem value="scd2">SCD Type 2</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

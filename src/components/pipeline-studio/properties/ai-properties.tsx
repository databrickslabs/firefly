"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequiredLabel } from "./required-label";
import type { PipelineNodeData, AISubtype } from "@/stores/pipeline-store";

interface AIPropertiesProps {
  data: PipelineNodeData;
  onUpdate: (updates: Partial<PipelineNodeData["config"]>) => void;
}

export function AIProperties({ data, onUpdate }: AIPropertiesProps) {
  const config = data.config as {
    modelEndpoint?: string;
    inputColumn?: string;
    outputColumn?: string;
    parseType?: string;
  };

  const subtype = data.subtype as AISubtype;

  if (subtype === "inference") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <RequiredLabel htmlFor="modelEndpoint" required>Model Endpoint</RequiredLabel>
          <Input
            id="modelEndpoint"
            placeholder="e.g., my-model-endpoint"
            value={config.modelEndpoint || ""}
            onChange={(e) => onUpdate({ modelEndpoint: e.target.value })}
          />
          <p className="text-xs text-slate-500">
            The name of the ML serving endpoint to use for inference
          </p>
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="inputColumn" required>Input Column</RequiredLabel>
          <Input
            id="inputColumn"
            placeholder="e.g., text"
            value={config.inputColumn || ""}
            onChange={(e) => onUpdate({ inputColumn: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="outputColumn" required>Output Column</RequiredLabel>
          <Input
            id="outputColumn"
            placeholder="e.g., prediction"
            value={config.outputColumn || ""}
            onChange={(e) => onUpdate({ outputColumn: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (subtype === "ai-parse") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <RequiredLabel htmlFor="parseType" required>Parse Type</RequiredLabel>
          <Select
            value={config.parseType || "text"}
            onValueChange={(value) => onUpdate({ parseType: value })}
          >
            <SelectTrigger id="parseType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text Extraction</SelectItem>
              <SelectItem value="table">Table Extraction</SelectItem>
              <SelectItem value="form">Form Extraction</SelectItem>
              <SelectItem value="entity">Entity Extraction</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="inputColumn" required>Input Column</RequiredLabel>
          <Input
            id="inputColumn"
            placeholder="e.g., document_path"
            value={config.inputColumn || ""}
            onChange={(e) => onUpdate({ inputColumn: e.target.value })}
          />
          <p className="text-xs text-slate-500">
            Column containing file paths or binary content
          </p>
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="outputColumn" required>Output Column</RequiredLabel>
          <Input
            id="outputColumn"
            placeholder="e.g., parsed_content"
            value={config.outputColumn || ""}
            onChange={(e) => onUpdate({ outputColumn: e.target.value })}
          />
        </div>
      </div>
    );
  }

  return null;
}

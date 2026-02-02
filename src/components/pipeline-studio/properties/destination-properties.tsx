"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { RequiredLabel } from "./required-label";
import { useCatalogs, useSchemas } from "@/hooks/use-unity-catalog";
import type { PipelineNodeData, DestinationSubtype } from "@/stores/pipeline-store";

// Schedule types for materialized views
export type ScheduleType = "none" | "trigger" | "scheduled";
export type ScheduleUnit = "HOURS" | "DAYS" | "WEEKS";
export type TriggerUnit = "MINUTES" | "HOURS";

interface DestinationPropertiesProps {
  data: PipelineNodeData;
  onUpdate: (updates: Partial<PipelineNodeData["config"]>) => void;
}

export function DestinationProperties({ data, onUpdate }: DestinationPropertiesProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const config = data.config as {
    catalog?: string;
    schema?: string;
    table?: string;
    enableDeletionVectors?: boolean;
    enableRowTracking?: boolean;
    enableChangeDataFeed?: boolean;
    // Schedule configuration
    scheduleType?: ScheduleType;
    scheduleInterval?: number;
    scheduleUnit?: ScheduleUnit;
    triggerMinInterval?: number;
    triggerMinIntervalUnit?: TriggerUnit;
    // TBLPROPERTIES
    pipelinesChannel?: "CURRENT" | "PREVIEW";
    customProperties?: string;
  };

  const subtype = data.subtype as DestinationSubtype;

  // Fetch Unity Catalog data for materialized-view
  const { data: catalogs, isLoading: catalogsLoading } = useCatalogs();
  const { data: schemas, isLoading: schemasLoading } = useSchemas(config.catalog);

  // Convert to SearchableSelect options
  const catalogOptions = useMemo(
    () =>
      (catalogs ?? []).map((c) => ({
        value: c.name,
        label: c.name,
        description: c.comment,
      })),
    [catalogs]
  );

  const schemaOptions = useMemo(
    () =>
      (schemas ?? []).map((s) => ({
        value: s.name,
        label: s.name,
        description: s.comment,
      })),
    [schemas]
  );

  // Handle catalog change - clear schema and table
  const handleCatalogChange = (value: string) => {
    onUpdate({ catalog: value, schema: undefined, table: undefined });
  };

  // Handle schema change - clear table
  const handleSchemaChange = (value: string) => {
    onUpdate({ schema: value, table: undefined });
  };

  // Determine the label for the name field based on subtype
  const nameLabel = subtype === "streaming" ? "Table Name" : "View Name";
  const namePlaceholder = subtype === "streaming" ? "e.g., output_table" : "e.g., my_view";

  // Materialized View gets searchable selectors for catalog/schema
  if (subtype === "materialized-view") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <RequiredLabel htmlFor="catalog" required>Catalog</RequiredLabel>
          <SearchableSelect
            options={catalogOptions}
            value={config.catalog}
            onValueChange={handleCatalogChange}
            placeholder="Select catalog..."
            searchPlaceholder="Search catalogs..."
            emptyMessage="No catalogs found."
            isLoading={catalogsLoading}
          />
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="schema" required>Schema</RequiredLabel>
          <SearchableSelect
            options={schemaOptions}
            value={config.schema}
            onValueChange={handleSchemaChange}
            placeholder="Select schema..."
            searchPlaceholder="Search schemas..."
            emptyMessage={config.catalog ? "No schemas found." : "Select a catalog first."}
            isLoading={schemasLoading}
            disabled={!config.catalog}
          />
        </div>
        <div className="space-y-2">
          <RequiredLabel htmlFor="table" required>{nameLabel}</RequiredLabel>
          <Input
            id="table"
            placeholder={namePlaceholder}
            value={config.table || ""}
            onChange={(e) => onUpdate({ table: e.target.value })}
          />
        </div>

        {/* Refresh Schedule */}
        <div className="space-y-3 pt-2 border-t border-slate-200">
          <Label className="text-sm font-medium">Refresh Schedule</Label>
          <Select
            value={config.scheduleType || "none"}
            onValueChange={(value: ScheduleType) => {
              onUpdate({
                scheduleType: value,
                // Reset schedule-specific fields when changing type
                scheduleInterval: value === "scheduled" ? 1 : undefined,
                scheduleUnit: value === "scheduled" ? "DAYS" : undefined,
                triggerMinInterval: undefined,
                triggerMinIntervalUnit: undefined,
              });
            }}
          >
            <SelectTrigger id="scheduleType">
              <SelectValue placeholder="Select refresh schedule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Manual Refresh Only</SelectItem>
              <SelectItem value="trigger">Trigger on Update</SelectItem>
              <SelectItem value="scheduled">Scheduled Interval</SelectItem>
            </SelectContent>
          </Select>

          {/* Trigger on Update Options */}
          {config.scheduleType === "trigger" && (
            <div className="space-y-2 pl-2 border-l-2 border-slate-200">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="triggerMinIntervalEnabled"
                  checked={config.triggerMinInterval !== undefined}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onUpdate({ triggerMinInterval: 5, triggerMinIntervalUnit: "MINUTES" });
                    } else {
                      onUpdate({ triggerMinInterval: undefined, triggerMinIntervalUnit: undefined });
                    }
                  }}
                />
                <Label htmlFor="triggerMinIntervalEnabled" className="text-sm font-normal cursor-pointer">
                  Minimum interval between refreshes
                </Label>
              </div>
              {config.triggerMinInterval !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">At most every</span>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    value={config.triggerMinInterval}
                    onChange={(e) => onUpdate({ triggerMinInterval: parseInt(e.target.value) || 1 })}
                  />
                  <Select
                    value={config.triggerMinIntervalUnit || "MINUTES"}
                    onValueChange={(value: TriggerUnit) => onUpdate({ triggerMinIntervalUnit: value })}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MINUTES">Minutes</SelectItem>
                      <SelectItem value="HOURS">Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Scheduled Interval Options */}
          {config.scheduleType === "scheduled" && (
            <div className="space-y-2 pl-2 border-l-2 border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Refresh every</span>
                <Input
                  type="number"
                  min={1}
                  max={config.scheduleUnit === "HOURS" ? 72 : config.scheduleUnit === "DAYS" ? 31 : 8}
                  className="w-20"
                  value={config.scheduleInterval || 1}
                  onChange={(e) => onUpdate({ scheduleInterval: parseInt(e.target.value) || 1 })}
                />
                <Select
                  value={config.scheduleUnit || "DAYS"}
                  onValueChange={(value: ScheduleUnit) => {
                    // Reset interval if it exceeds max for new unit
                    const maxValues: Record<ScheduleUnit, number> = { HOURS: 72, DAYS: 31, WEEKS: 8 };
                    const currentInterval = config.scheduleInterval || 1;
                    const newInterval = currentInterval > maxValues[value] ? maxValues[value] : currentInterval;
                    onUpdate({ scheduleUnit: value, scheduleInterval: newInterval });
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOURS">Hours</SelectItem>
                    <SelectItem value="DAYS">Days</SelectItem>
                    <SelectItem value="WEEKS">Weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-500">
                {config.scheduleUnit === "HOURS" && "1-72 hours"}
                {config.scheduleUnit === "DAYS" && "1-31 days"}
                {config.scheduleUnit === "WEEKS" && "1-8 weeks"}
              </p>
            </div>
          )}
        </div>

        {/* Advanced features for Materialized View */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors py-1">
            {advancedOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Advanced
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-4">
            {/* Delta Table Properties */}
            <div className="space-y-3">
              <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Table Properties</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="enableDeletionVectors"
                  checked={config.enableDeletionVectors !== false}
                  onCheckedChange={(checked) =>
                    onUpdate({ enableDeletionVectors: checked === true })
                  }
                />
                <Label
                  htmlFor="enableDeletionVectors"
                  className="text-sm font-normal cursor-pointer"
                >
                  Enable Deletion Vectors
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="enableRowTracking"
                  checked={config.enableRowTracking !== false}
                  onCheckedChange={(checked) =>
                    onUpdate({ enableRowTracking: checked === true })
                  }
                />
                <Label
                  htmlFor="enableRowTracking"
                  className="text-sm font-normal cursor-pointer"
                >
                  Enable Row Tracking
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="enableChangeDataFeed"
                  checked={config.enableChangeDataFeed !== false}
                  onCheckedChange={(checked) =>
                    onUpdate({ enableChangeDataFeed: checked === true })
                  }
                />
                <Label
                  htmlFor="enableChangeDataFeed"
                  className="text-sm font-normal cursor-pointer"
                >
                  Enable Change Data Feed
                </Label>
              </div>
            </div>

            {/* Pipeline Properties */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pipeline Properties</Label>
              <div className="space-y-2">
                <Label htmlFor="pipelinesChannel" className="text-sm">Runtime Channel</Label>
                <Select
                  value={config.pipelinesChannel || "CURRENT"}
                  onValueChange={(value: "CURRENT" | "PREVIEW") => onUpdate({ pipelinesChannel: value })}
                >
                  <SelectTrigger id="pipelinesChannel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CURRENT">Current (Stable)</SelectItem>
                    <SelectItem value="PREVIEW">Preview</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  Lakeflow Spark Declarative Pipelines runtime channel
                </p>
              </div>
            </div>

            {/* Custom TBLPROPERTIES */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <Label htmlFor="customProperties" className="text-sm">Custom Properties</Label>
              <Input
                id="customProperties"
                placeholder="e.g., 'key1' = 'value1', 'key2' = 'value2'"
                value={config.customProperties || ""}
                onChange={(e) => onUpdate({ customProperties: e.target.value })}
              />
              <p className="text-xs text-slate-500">
                Additional TBLPROPERTIES (comma-separated key-value pairs)
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  // View and Streaming Table use simple text inputs
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
        <RequiredLabel htmlFor="table" required>{nameLabel}</RequiredLabel>
        <Input
          id="table"
          placeholder={namePlaceholder}
          value={config.table || ""}
          onChange={(e) => onUpdate({ table: e.target.value })}
        />
      </div>
    </div>
  );
}

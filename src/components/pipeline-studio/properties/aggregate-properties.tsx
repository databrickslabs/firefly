"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Trash2, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { RequiredLabel } from "./required-label";
import type { PipelineNodeData } from "@/stores/pipeline-store";
import { usePipelineNodes, usePipelineEdges, useSampleDataByNode } from "@/providers/pipeline-store-provider";
import { getUpstreamColumns, formatColumnOptions } from "../utils/column-utils";

// Aggregate function types
type AggregateFunction =
  | "sum"
  | "avg"
  | "count"
  | "count_distinct"
  | "min"
  | "max"
  | "first"
  | "last"
  | "collect_list"
  | "collect_set"
  | "stddev"
  | "variance";

const aggregateFunctions: { value: AggregateFunction; label: string; description: string }[] = [
  { value: "sum", label: "SUM", description: "Sum of values" },
  { value: "avg", label: "AVG", description: "Average of values" },
  { value: "count", label: "COUNT", description: "Count of rows" },
  { value: "count_distinct", label: "COUNT DISTINCT", description: "Count of unique values" },
  { value: "min", label: "MIN", description: "Minimum value" },
  { value: "max", label: "MAX", description: "Maximum value" },
  { value: "first", label: "FIRST", description: "First value" },
  { value: "last", label: "LAST", description: "Last value" },
  { value: "collect_list", label: "COLLECT_LIST", description: "Collect values into array" },
  { value: "collect_set", label: "COLLECT_SET", description: "Collect unique values into array" },
  { value: "stddev", label: "STDDEV", description: "Standard deviation" },
  { value: "variance", label: "VARIANCE", description: "Variance" },
];

interface AggregateColumn {
  id: string;
  column: string;
  function: AggregateFunction;
  alias: string;
}

interface AggregateConfig {
  groupByColumns?: string[];
  aggregates?: AggregateColumn[];
}

interface AggregatePropertiesProps {
  data: PipelineNodeData;
  nodeId: string;
  onUpdate: (updates: Partial<PipelineNodeData["config"]>) => void;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function createDefaultAggregate(): AggregateColumn {
  return {
    id: generateId(),
    column: "",
    function: "count",
    alias: "",
  };
}

interface AggregateRowProps {
  aggregate: AggregateColumn;
  onUpdate: (updates: Partial<AggregateColumn>) => void;
  onDelete: () => void;
  canDelete: boolean;
  columnOptions: { value: string; label: string; description?: string }[];
}

function AggregateRow({
  aggregate,
  onUpdate,
  onDelete,
  canDelete,
  columnOptions,
}: AggregateRowProps) {
  return (
    <div className="p-2 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2 w-full min-w-0">
      <div className="flex items-start gap-2 w-full min-w-0">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Function selection */}
          <div className="space-y-1 w-full min-w-0">
            <label className="text-xs font-medium text-slate-600">Function</label>
            <Select
              value={aggregate.function}
              onValueChange={(value: AggregateFunction) => onUpdate({ function: value })}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aggregateFunctions.map((fn) => (
                  <SelectItem key={fn.value} value={fn.value}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{fn.label}</span>
                      <span className="text-xs text-slate-400">{fn.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Column selection */}
          <div className="space-y-1 w-full min-w-0">
            <label className="text-xs font-medium text-slate-600">Column</label>
            <AutocompleteInput
              options={columnOptions}
              value={aggregate.column}
              onChange={(value) => onUpdate({ column: value })}
              placeholder={aggregate.function === "count" ? "* (optional for COUNT)" : "Select column"}
              emptyMessage="Type a column name"
            />
          </div>

          {/* Alias - required */}
          <div className="space-y-1 w-full min-w-0">
            <label className="text-xs font-medium text-purple-600">
              Alias <span className="text-red-500">*</span>
            </label>
            <Input
              value={aggregate.alias}
              onChange={(e) => onUpdate({ alias: e.target.value })}
              placeholder="e.g., total_amount"
              className="font-mono h-9 w-full"
            />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-400 hover:text-red-600 mt-5"
          onClick={onDelete}
          disabled={!canDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AggregateProperties({ data, nodeId, onUpdate }: AggregatePropertiesProps) {
  const config = data.config as AggregateConfig;
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();
  const sampleDataByNode = useSampleDataByNode();
  const [groupBySearch, setGroupBySearch] = useState("");

  // Get columns from upstream node (including sample data)
  const upstreamColumns = useMemo(() => {
    return getUpstreamColumns(nodeId, nodes, edges, sampleDataByNode);
  }, [nodeId, nodes, edges, sampleDataByNode]);

  // Format column options for dropdowns - sorted alphabetically
  const columnOptions = useMemo(() => {
    const options = formatColumnOptions(upstreamColumns);
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [upstreamColumns]);

  // Group by columns (ensure uniqueness)
  const groupByColumns = useMemo(() => {
    const cols = config.groupByColumns || [];
    // Remove duplicates
    return [...new Set(cols)];
  }, [config.groupByColumns]);

  // Note: We intentionally do NOT auto-clean invalid columns here.
  // During "Sample All", columns temporarily become empty which would
  // incorrectly remove user selections. Users can manually remove
  // invalid selections if needed.

  // Filtered column options for search - explicitly compute on each search change
  const filteredColumnOptions = useMemo(() => {
    const searchTerm = groupBySearch.trim().toLowerCase();
    if (searchTerm === "") {
      return columnOptions;
    }
    return columnOptions.filter((col) => {
      const valueLower = (col.value || "").toLowerCase();
      const labelLower = (col.label || "").toLowerCase();
      const descLower = (col.description || "").toLowerCase();
      return (
        valueLower.includes(searchTerm) ||
        labelLower.includes(searchTerm) ||
        descLower.includes(searchTerm)
      );
    });
  }, [columnOptions, groupBySearch]);

  // Aggregates - memoized to prevent dependency issues
  const aggregates: AggregateColumn[] = useMemo(() => {
    return config.aggregates?.length ? config.aggregates : [createDefaultAggregate()];
  }, [config.aggregates]);

  // Add group by column
  const handleAddGroupBy = useCallback(
    (columnName: string) => {
      if (!groupByColumns.includes(columnName)) {
        onUpdate({ groupByColumns: [...groupByColumns, columnName] });
      }
    },
    [groupByColumns, onUpdate]
  );

  // Remove group by column
  const handleRemoveGroupBy = useCallback(
    (columnName: string) => {
      onUpdate({ groupByColumns: groupByColumns.filter((c) => c !== columnName) });
    },
    [groupByColumns, onUpdate]
  );

  // Toggle group by column
  const handleToggleGroupBy = useCallback(
    (columnName: string, checked: boolean) => {
      if (checked) {
        handleAddGroupBy(columnName);
      } else {
        handleRemoveGroupBy(columnName);
      }
    },
    [handleAddGroupBy, handleRemoveGroupBy]
  );

  // Clear all group by columns
  const handleClearGroupBy = useCallback(() => {
    onUpdate({ groupByColumns: [] });
  }, [onUpdate]);

  // Update aggregate
  const handleUpdateAggregate = useCallback(
    (id: string, updates: Partial<AggregateColumn>) => {
      const newAggregates = aggregates.map((agg) =>
        agg.id === id ? { ...agg, ...updates } : agg
      );
      onUpdate({ aggregates: newAggregates });
    },
    [aggregates, onUpdate]
  );

  // Add aggregate
  const handleAddAggregate = useCallback(() => {
    onUpdate({ aggregates: [...aggregates, createDefaultAggregate()] });
  }, [aggregates, onUpdate]);

  // Delete aggregate
  const handleDeleteAggregate = useCallback(
    (id: string) => {
      onUpdate({ aggregates: aggregates.filter((agg) => agg.id !== id) });
    },
    [aggregates, onUpdate]
  );

  return (
    <div className="space-y-3 w-full min-w-0">
      {/* Group By Columns */}
      <div className="space-y-1.5 w-full min-w-0">
        <div className="flex items-center justify-between">
          <RequiredLabel htmlFor="groupBy" required={false}>Group By Columns</RequiredLabel>
          {groupByColumns.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
              onClick={handleClearGroupBy}
            >
              Clear all
            </Button>
          )}
        </div>

        {/* Selected group by columns as removable chips */}
        {groupByColumns.length > 0 && (
          <div className="flex flex-wrap gap-1 p-1.5 bg-blue-50 rounded-md border border-blue-200 max-h-20 overflow-y-auto">
            {groupByColumns.map((col) => (
              <Badge
                key={col}
                variant="secondary"
                className="font-mono text-xs bg-white border border-blue-200 pr-0.5 flex items-center gap-0.5 h-6 max-w-full"
              >
                <span className="truncate max-w-[120px]">{col}</span>
                <button
                  onClick={() => handleRemoveGroupBy(col)}
                  className="ml-0.5 rounded-full hover:bg-slate-200 p-0.5"
                  aria-label={`Remove ${col}`}
                >
                  <X className="h-3 w-3 text-slate-500 hover:text-red-500" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {columnOptions.length > 0 ? (
          <>
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search columns..."
                value={groupBySearch}
                onChange={(e) => {
                  e.stopPropagation();
                  setGroupBySearch(e.target.value);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="pl-8 h-8 text-sm"
              />
              {groupBySearch && (
                <button
                  type="button"
                  onClick={() => setGroupBySearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Column list */}
            <div className="border rounded-md max-h-32 overflow-y-auto">
              {filteredColumnOptions.length > 0 ? (
                filteredColumnOptions.map((col) => (
                  <div
                    key={col.value}
                    className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50"
                  >
                    <Checkbox
                      id={`groupby-${col.value}`}
                      checked={groupByColumns.includes(col.value)}
                      onCheckedChange={(checked) =>
                        handleToggleGroupBy(col.value, checked === true)
                      }
                    />
                    <label
                      htmlFor={`groupby-${col.value}`}
                      className="flex-1 text-sm font-mono cursor-pointer"
                    >
                      {col.label}
                    </label>
                    {col.description && (
                      <span className="text-xs text-slate-400">{col.description}</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-3 px-2 text-sm text-slate-500 text-center">
                  No columns match &quot;{groupBySearch}&quot;
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-4 text-sm text-slate-500 border rounded-lg bg-slate-50">
            <p>No columns available</p>
            <p className="text-xs mt-1">Connect an upstream node and run Sample to discover columns.</p>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Columns to group by. Leave empty for overall aggregation.
        </p>
      </div>

      {/* Aggregate Functions */}
      <div className="space-y-1.5 w-full min-w-0">
        <div className="flex items-center justify-between w-full min-w-0">
          <RequiredLabel htmlFor="aggregates" required>Aggregate Functions</RequiredLabel>
          <span className="text-xs text-slate-500">
            {aggregates.length} function{aggregates.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-1.5 w-full min-w-0">
          {aggregates.map((agg) => (
            <AggregateRow
              key={agg.id}
              aggregate={agg}
              onUpdate={(updates) => handleUpdateAggregate(agg.id, updates)}
              onDelete={() => handleDeleteAggregate(agg.id)}
              canDelete={aggregates.length > 1}
              columnOptions={columnOptions}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleAddAggregate}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Aggregate
        </Button>
      </div>

      {/* Help text */}
      <div className="p-2 bg-slate-50 rounded-md border border-slate-200">
        <p className="text-xs text-slate-600 leading-snug">
          <strong>Aggregate</strong> computes summary statistics over groups of rows.
          <br />
          <strong>Group By:</strong> Columns to partition data &bull; <strong>Aggregates:</strong> Functions (SUM, AVG, COUNT)
          <br />
          <em>Example:</em> Group by <code className="bg-slate-200 px-0.5 rounded text-[10px]">region</code>,
          <code className="bg-slate-200 px-0.5 rounded text-[10px]">SUM(sales)</code> as <code className="bg-slate-200 px-0.5 rounded text-[10px]">total_sales</code>
        </p>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useCallback } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { RequiredLabel } from "./required-label";
import type { PipelineNodeData } from "@/stores/pipeline-store";
import { usePipelineNodes, usePipelineEdges, useSampleDataByNode } from "@/providers/pipeline-store-provider";
import { getUpstreamColumns, formatColumnOptions } from "../utils/column-utils";

// Check if an expression requires an alias (contains special characters)
function requiresAlias(expression: string): boolean {
  // Standard column name: only letters, numbers, and underscores, starting with letter or underscore
  const standardColumnPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  return !standardColumnPattern.test(expression);
}

// Derived column definition
interface DerivedColumn {
  id: string;
  expression: string;
  alias: string;
}

interface ProjectionConfig {
  columns?: string[];
  derivedColumns?: DerivedColumn[];
}

interface ProjectionPropertiesProps {
  data: PipelineNodeData;
  nodeId: string;
  onUpdate: (updates: Partial<PipelineNodeData["config"]>) => void;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function createDefaultDerivedColumn(): DerivedColumn {
  return {
    id: generateId(),
    expression: "",
    alias: "",
  };
}

interface DerivedColumnRowProps {
  column: DerivedColumn;
  onUpdate: (updates: Partial<DerivedColumn>) => void;
  onDelete: () => void;
  canDelete: boolean;
  columnOptions: { value: string; label: string; description?: string }[];
  allOutputNames: string[];
}

function DerivedColumnRow({
  column,
  onUpdate,
  onDelete,
  canDelete,
  columnOptions,
  allOutputNames,
}: DerivedColumnRowProps) {
  const needsAlias = requiresAlias(column.expression);
  const outputName = column.alias || column.expression;

  // Check for duplicate names (excluding this column's own alias)
  const isDuplicate = allOutputNames.filter((n) => n === outputName).length > 1;
  const aliasRequired = needsAlias || isDuplicate;
  const hasError = aliasRequired && !column.alias.trim();

  return (
    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3 w-full min-w-0">
      <div className="flex items-start gap-2 w-full min-w-0">
        <div className="flex-1 min-w-0 space-y-3">
          {/* Expression */}
          <div className="space-y-1 w-full min-w-0">
            <label className="text-xs font-medium text-slate-600">Expression</label>
            <AutocompleteInput
              options={columnOptions}
              value={column.expression}
              onChange={(value) => onUpdate({ expression: value })}
              placeholder="e.g., price * quantity or UPPER(name)"
              emptyMessage="Type a column name or expression"
            />
          </div>

          {/* Alias */}
          <div className="space-y-1 w-full min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <label className={`text-xs font-medium ${aliasRequired ? "text-purple-600" : "text-slate-600"}`}>
                Alias {aliasRequired && <span className="text-red-500">*</span>}
              </label>
              {needsAlias && column.expression && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  Expression requires alias
                </span>
              )}
              {isDuplicate && !needsAlias && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  Duplicate name
                </span>
              )}
            </div>
            <Input
              value={column.alias}
              onChange={(e) => onUpdate({ alias: e.target.value })}
              placeholder={needsAlias ? "Required (e.g., total_price)" : "Optional alias"}
              className={`font-mono h-9 w-full ${hasError ? "border-red-300 focus-visible:ring-red-500" : ""}`}
            />
            {hasError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Alias is required for this expression
              </p>
            )}
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

export function ProjectionProperties({ data, nodeId, onUpdate }: ProjectionPropertiesProps) {
  const config = data.config as ProjectionConfig;
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();
  const sampleDataByNode = useSampleDataByNode();

  // Get columns from upstream node (including sample data)
  const upstreamColumns = useMemo(() => {
    return getUpstreamColumns(nodeId, nodes, edges, sampleDataByNode);
  }, [nodeId, nodes, edges, sampleDataByNode]);

  // Format column options for display - sorted alphabetically
  const columnOptions = useMemo(() => {
    const options = formatColumnOptions(upstreamColumns);
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [upstreamColumns]);

  // Selected columns - memoized to prevent dependency issues
  const selectedColumns = useMemo(() => config.columns || [], [config.columns]);

  // Derived columns - memoized to prevent dependency issues
  const derivedColumns = useMemo(() => config.derivedColumns || [], [config.derivedColumns]);

  // Note: We intentionally do NOT auto-clean invalid columns here.
  // During "Sample All", columns temporarily become empty which would
  // incorrectly remove user selections. Users can manually remove
  // invalid selections if needed.

  // Calculate all output names for duplicate detection
  const allOutputNames = useMemo(() => {
    const names: string[] = [...selectedColumns];
    derivedColumns.forEach((dc) => {
      names.push(dc.alias || dc.expression);
    });
    return names;
  }, [selectedColumns, derivedColumns]);

  // Toggle column selection
  const handleToggleColumn = useCallback(
    (columnName: string, checked: boolean) => {
      const newColumns = checked
        ? [...selectedColumns, columnName]
        : selectedColumns.filter((c) => c !== columnName);
      onUpdate({ columns: newColumns });
    },
    [selectedColumns, onUpdate]
  );

  // Select all columns
  const handleSelectAll = useCallback(() => {
    onUpdate({ columns: columnOptions.map((c) => c.value) });
  }, [columnOptions, onUpdate]);

  // Clear all columns
  const handleClearAll = useCallback(() => {
    onUpdate({ columns: [] });
  }, [onUpdate]);

  // Add derived column
  const handleAddDerivedColumn = useCallback(() => {
    onUpdate({ derivedColumns: [...derivedColumns, createDefaultDerivedColumn()] });
  }, [derivedColumns, onUpdate]);

  // Update derived column
  const handleUpdateDerivedColumn = useCallback(
    (id: string, updates: Partial<DerivedColumn>) => {
      const newDerived = derivedColumns.map((dc) =>
        dc.id === id ? { ...dc, ...updates } : dc
      );
      onUpdate({ derivedColumns: newDerived });
    },
    [derivedColumns, onUpdate]
  );

  // Delete derived column
  const handleDeleteDerivedColumn = useCallback(
    (id: string) => {
      onUpdate({ derivedColumns: derivedColumns.filter((dc) => dc.id !== id) });
    },
    [derivedColumns, onUpdate]
  );

  // Check if all columns are selected
  const allSelected = selectedColumns.length === columnOptions.length && columnOptions.length > 0;

  // Count valid derived columns
  const validDerivedCount = derivedColumns.filter((dc) => {
    if (!dc.expression.trim()) return false;
    if (requiresAlias(dc.expression) && !dc.alias.trim()) return false;
    return true;
  }).length;

  // Total output columns
  const totalOutputColumns = selectedColumns.length + validDerivedCount;

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Column Selection */}
      <div className="space-y-2 w-full min-w-0">
        <div className="flex items-center justify-between w-full min-w-0">
          <RequiredLabel htmlFor="columns" required={derivedColumns.length === 0}>
            Select Columns
          </RequiredLabel>
          {columnOptions.length > 0 && (
            <span className="text-xs text-slate-500">
              {selectedColumns.length}/{columnOptions.length} selected
            </span>
          )}
        </div>

        {columnOptions.length > 0 ? (
          <>
            {/* Quick actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex-1"
                onClick={handleSelectAll}
                disabled={allSelected}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex-1"
                onClick={handleClearAll}
                disabled={selectedColumns.length === 0}
              >
                Clear All
              </Button>
            </div>

            {/* Column list */}
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {columnOptions.map((col) => (
                <div
                  key={col.value}
                  className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50"
                >
                  <Checkbox
                    id={`col-${col.value}`}
                    checked={selectedColumns.includes(col.value)}
                    onCheckedChange={(checked) =>
                      handleToggleColumn(col.value, checked === true)
                    }
                  />
                  <label
                    htmlFor={`col-${col.value}`}
                    className="flex-1 text-sm font-mono cursor-pointer"
                  >
                    {col.label}
                  </label>
                  {col.description && (
                    <span className="text-xs text-slate-400">{col.description}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-4 text-sm text-slate-500 border rounded-lg bg-slate-50">
            <p className="font-medium">No columns available</p>
            <p className="text-xs mt-1">
              Connect an upstream node and run <span className="font-medium">Sample</span> to discover columns.
            </p>
          </div>
        )}
      </div>

      {/* Derived Columns */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Derived Columns</Label>
          <span className="text-xs text-slate-500">
            {derivedColumns.length} expression{derivedColumns.length !== 1 ? "s" : ""}
          </span>
        </div>

        {derivedColumns.length > 0 && (
          <div className="space-y-2">
            {derivedColumns.map((dc) => (
              <DerivedColumnRow
                key={dc.id}
                column={dc}
                onUpdate={(updates) => handleUpdateDerivedColumn(dc.id, updates)}
                onDelete={() => handleDeleteDerivedColumn(dc.id)}
                canDelete={true}
                columnOptions={columnOptions}
                allOutputNames={allOutputNames}
              />
            ))}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleAddDerivedColumn}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Derived Column
        </Button>
      </div>

      {/* Output summary */}
      {totalOutputColumns > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">
            Output columns ({totalOutputColumns}):
          </Label>
          <div className="flex flex-wrap gap-1">
            {selectedColumns.map((col) => (
              <Badge key={col} variant="secondary" className="font-mono text-xs">
                {col}
              </Badge>
            ))}
            {derivedColumns
              .filter((dc) => dc.expression.trim())
              .map((dc) => {
                const name = dc.alias || dc.expression;
                const isValid = !requiresAlias(dc.expression) || dc.alias.trim();
                return (
                  <Badge
                    key={dc.id}
                    variant="secondary"
                    className={`font-mono text-xs ${!isValid ? "bg-red-100 text-red-700" : "bg-purple-100 text-purple-700"}`}
                  >
                    {name}
                    {dc.alias && dc.expression !== dc.alias && (
                      <span className="text-purple-400 ml-1">(derived)</span>
                    )}
                  </Badge>
                );
              })}
          </div>
        </div>
      )}

      {/* Validation message */}
      {totalOutputColumns === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
          At least one column (selected or derived) is required.
        </p>
      )}

      {/* Help text */}
      <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
        <p className="text-xs text-slate-600 leading-relaxed">
          <strong>Projection</strong> selects and derives columns from the input data.
          <br /><br />
          <strong>Select Columns:</strong> Choose existing columns to include
          <br />
          <strong>Derived Columns:</strong> Create new columns using expressions
          <br /><br />
          <em>Examples of derived expressions:</em>
          <br />
          <code className="bg-slate-200 px-1 rounded">price * quantity</code> → requires alias
          <br />
          <code className="bg-slate-200 px-1 rounded">UPPER(name)</code> → requires alias
          <br />
          <code className="bg-slate-200 px-1 rounded">CONCAT(first, last)</code> → requires alias
          <br /><br />
          <em>Note:</em> Aliases are required when expressions contain special characters like <code className="bg-slate-200 px-1 rounded">( ) + - * /</code> etc.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useMemo } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { cn } from "@/lib/utils";
import type { PipelineNodeData } from "@/stores/pipeline-store";
import { usePipelineNodes, usePipelineEdges, useSampleDataByNode } from "@/providers/pipeline-store-provider";
import { getInputColumnsForNode, formatColumnOptions } from "../utils/column-utils";

// Condition types
type ConditionType = "equality" | "range" | "comparison";
type ComparisonOperator = "=" | "!=" | ">" | ">=" | "<" | "<=";

interface JoinCondition {
  id: string;
  type: ConditionType;
  leftColumn: string;
  rightColumn: string;
  // For range conditions
  rightColumnEnd?: string;
  // For comparison conditions
  operator?: ComparisonOperator;
}

interface ConditionGroup {
  id: string;
  conditions: JoinCondition[];
}

interface JoinConfig {
  joinType?: string;
  conditionGroups?: ConditionGroup[];
  // Legacy support
  leftKey?: string;
  rightKey?: string;
}

interface JoinPropertiesProps {
  data: PipelineNodeData;
  nodeId: string;
  onUpdate: (updates: Partial<PipelineNodeData["config"]>) => void;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function createDefaultCondition(): JoinCondition {
  return {
    id: generateId(),
    type: "equality",
    leftColumn: "",
    rightColumn: "",
  };
}

function createDefaultGroup(): ConditionGroup {
  return {
    id: generateId(),
    conditions: [createDefaultCondition()],
  };
}

interface ConditionRowProps {
  condition: JoinCondition;
  onUpdate: (updates: Partial<JoinCondition>) => void;
  onDelete: () => void;
  canDelete: boolean;
  showAndLabel: boolean;
  leftColumnOptions: { value: string; label: string; description?: string }[];
  rightColumnOptions: { value: string; label: string; description?: string }[];
}

function ConditionRow({
  condition,
  onUpdate,
  onDelete,
  canDelete,
  showAndLabel,
  leftColumnOptions,
  rightColumnOptions,
}: ConditionRowProps) {
  return (
    <div className="space-y-2">
      {showAndLabel && (
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-slate-200" />
          <Badge variant="secondary" className="text-xs font-normal">
            AND
          </Badge>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
      )}
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 pt-6 text-slate-400 cursor-move">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-3">
          {/* Left Column */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-blue-600">Left Column (Input A)</label>
            <AutocompleteInput
              options={leftColumnOptions}
              value={condition.leftColumn}
              onChange={(value) => onUpdate({ leftColumn: value })}
              placeholder="e.g., customer_id or avg(amount)"
              emptyMessage="Type a column name or expression"
            />
          </div>

          {/* Condition Type */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Condition:</span>
            <Select
              value={condition.type}
              onValueChange={(value: ConditionType) => onUpdate({ type: value })}
            >
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equality">Equals (=)</SelectItem>
                <SelectItem value="comparison">Compare</SelectItem>
                <SelectItem value="range">Range</SelectItem>
              </SelectContent>
            </Select>
            {condition.type === "comparison" && (
              <Select
                value={condition.operator || "="}
                onValueChange={(value: ComparisonOperator) =>
                  onUpdate({ operator: value })
                }
              >
                <SelectTrigger className="w-[70px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="=">=</SelectItem>
                  <SelectItem value="!=">!=</SelectItem>
                  <SelectItem value=">">&gt;</SelectItem>
                  <SelectItem value=">=">&gt;=</SelectItem>
                  <SelectItem value="<">&lt;</SelectItem>
                  <SelectItem value="<=">&lt;=</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-green-600">Right Column (Input B)</label>
            <AutocompleteInput
              options={rightColumnOptions}
              value={condition.rightColumn}
              onChange={(value) => onUpdate({ rightColumn: value })}
              placeholder="e.g., id or date_part('year', date)"
              emptyMessage="Type a column name or expression"
            />
          </div>

          {/* Range End Column */}
          {condition.type === "range" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-green-600">Right Column End (for BETWEEN)</label>
              <AutocompleteInput
                options={rightColumnOptions}
                value={condition.rightColumnEnd || ""}
                onChange={(value) => onUpdate({ rightColumnEnd: value })}
                placeholder="e.g., end_date"
                emptyMessage="Type a column name or expression"
              />
            </div>
          )}
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

interface ConditionGroupCardProps {
  group: ConditionGroup;
  groupIndex: number;
  onUpdateCondition: (conditionId: string, updates: Partial<JoinCondition>) => void;
  onDeleteCondition: (conditionId: string) => void;
  onAddCondition: () => void;
  onDeleteGroup: () => void;
  canDeleteGroup: boolean;
  showOrLabel: boolean;
  leftColumnOptions: { value: string; label: string; description?: string }[];
  rightColumnOptions: { value: string; label: string; description?: string }[];
}

function ConditionGroupCard({
  group,
  onUpdateCondition,
  onDeleteCondition,
  onAddCondition,
  onDeleteGroup,
  canDeleteGroup,
  showOrLabel,
  leftColumnOptions,
  rightColumnOptions,
}: ConditionGroupCardProps) {
  const canDeleteCondition = group.conditions.length > 1;

  return (
    <div className="space-y-2">
      {showOrLabel && (
        <div className="flex items-center gap-2 py-2">
          <div className="flex-1 h-px bg-amber-300" />
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs font-medium">
            OR
          </Badge>
          <div className="flex-1 h-px bg-amber-300" />
        </div>
      )}
      <div
        className={cn(
          "p-3 rounded-lg border bg-slate-50/50",
          showOrLabel ? "border-amber-200" : "border-slate-200"
        )}
      >
        <div className="space-y-2">
          {group.conditions.map((condition, condIndex) => (
            <ConditionRow
              key={condition.id}
              condition={condition}
              onUpdate={(updates) => onUpdateCondition(condition.id, updates)}
              onDelete={() => onDeleteCondition(condition.id)}
              canDelete={canDeleteCondition}
              showAndLabel={condIndex > 0}
              leftColumnOptions={leftColumnOptions}
              rightColumnOptions={rightColumnOptions}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-slate-600"
            onClick={onAddCondition}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add AND condition
          </Button>
          {canDeleteGroup && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onDeleteGroup}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Remove group
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function JoinProperties({ data, nodeId, onUpdate }: JoinPropertiesProps) {
  const config = data.config as JoinConfig;
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();
  const sampleDataByNode = useSampleDataByNode();

  // Get columns from upstream inputs (including sample data)
  const inputColumns = useMemo(() => {
    return getInputColumnsForNode(nodeId, nodes, edges, sampleDataByNode);
  }, [nodeId, nodes, edges, sampleDataByNode]);

  // Format column options for dropdowns
  const leftColumnOptions = useMemo(() => {
    return formatColumnOptions(inputColumns.left);
  }, [inputColumns.left]);

  const rightColumnOptions = useMemo(() => {
    return formatColumnOptions(inputColumns.right);
  }, [inputColumns.right]);

  // Initialize condition groups from config or create default
  const conditionGroups: ConditionGroup[] = config.conditionGroups?.length
    ? config.conditionGroups
    : [createDefaultGroup()];

  const updateGroups = useCallback(
    (newGroups: ConditionGroup[]) => {
      onUpdate({ conditionGroups: newGroups });
    },
    [onUpdate]
  );

  const handleUpdateCondition = useCallback(
    (groupId: string, conditionId: string, updates: Partial<JoinCondition>) => {
      const newGroups = conditionGroups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          conditions: group.conditions.map((cond) =>
            cond.id === conditionId ? { ...cond, ...updates } : cond
          ),
        };
      });
      updateGroups(newGroups);
    },
    [conditionGroups, updateGroups]
  );

  const handleDeleteCondition = useCallback(
    (groupId: string, conditionId: string) => {
      const newGroups = conditionGroups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          conditions: group.conditions.filter((cond) => cond.id !== conditionId),
        };
      });
      updateGroups(newGroups);
    },
    [conditionGroups, updateGroups]
  );

  const handleAddCondition = useCallback(
    (groupId: string) => {
      const newGroups = conditionGroups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          conditions: [...group.conditions, createDefaultCondition()],
        };
      });
      updateGroups(newGroups);
    },
    [conditionGroups, updateGroups]
  );

  const handleAddGroup = useCallback(() => {
    updateGroups([...conditionGroups, createDefaultGroup()]);
  }, [conditionGroups, updateGroups]);

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      updateGroups(conditionGroups.filter((group) => group.id !== groupId));
    },
    [conditionGroups, updateGroups]
  );

  return (
    <div className="space-y-4">
      {/* Join Type */}
      <div className="space-y-2">
        <Label htmlFor="joinType">Join Type</Label>
        <Select
          value={config.joinType || "inner"}
          onValueChange={(value) => onUpdate({ joinType: value })}
        >
          <SelectTrigger id="joinType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inner">Inner Join</SelectItem>
            <SelectItem value="left">Left Join</SelectItem>
            <SelectItem value="right">Right Join</SelectItem>
            <SelectItem value="full">Full Outer Join</SelectItem>
            <SelectItem value="cross">Cross Join</SelectItem>
            <SelectItem value="left_semi">Left Semi Join</SelectItem>
            <SelectItem value="left_anti">Left Anti Join</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Join Conditions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Join Conditions</Label>
          <span className="text-xs text-slate-500">
            Groups connected by OR
          </span>
        </div>

        <div className="space-y-2">
          {conditionGroups.map((group, groupIndex) => (
            <ConditionGroupCard
              key={group.id}
              group={group}
              groupIndex={groupIndex}
              onUpdateCondition={(conditionId, updates) =>
                handleUpdateCondition(group.id, conditionId, updates)
              }
              onDeleteCondition={(conditionId) =>
                handleDeleteCondition(group.id, conditionId)
              }
              onAddCondition={() => handleAddCondition(group.id)}
              onDeleteGroup={() => handleDeleteGroup(group.id)}
              canDeleteGroup={conditionGroups.length > 1}
              showOrLabel={groupIndex > 0}
              leftColumnOptions={leftColumnOptions}
              rightColumnOptions={rightColumnOptions}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={handleAddGroup}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add OR condition group
        </Button>
      </div>

      {/* Column info */}
      {(leftColumnOptions.length > 0 || rightColumnOptions.length > 0) && (
        <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
          <p className="text-xs text-blue-700 font-medium mb-1">Detected Columns</p>
          <p className="text-xs text-blue-600">
            <span className="font-medium">Input A:</span>{" "}
            {leftColumnOptions.length > 0
              ? `${leftColumnOptions.length} columns`
              : "No columns (connect a source)"}
            <br />
            <span className="font-medium">Input B:</span>{" "}
            {rightColumnOptions.length > 0
              ? `${rightColumnOptions.length} columns`
              : "No columns (connect a source)"}
          </p>
        </div>
      )}

      {/* Help text */}
      <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
        <p className="text-xs text-slate-600 leading-relaxed">
          <strong>Equality:</strong> Match rows where columns are equal
          <br />
          <strong>Compare:</strong> Match using operators like &gt;, &lt;, etc.
          <br />
          <strong>Range:</strong> Match where left column is between two right columns
          <br />
          <br />
          <em>Tip:</em> Select a table in source nodes to auto-populate column dropdowns.
        </p>
      </div>
    </div>
  );
}

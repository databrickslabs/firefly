"use client";

import { memo, useMemo, useCallback } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Database, Table2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineNode, NodeCategory } from "@/stores/pipeline-store";
import { getNodeIcon } from "./index";
import { validateNode } from "./node-validation";
import {
  usePipelineConsoleActions,
  useNodeSampleData,
  useNodeSampleDataActions,
  usePipelineNodes,
  usePipelineEdges,
} from "@/providers/pipeline-store-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateSampleSQL } from "@/lib/pipeline-to-sql";
import { loadWarehouse } from "@/lib/warehouse-storage";

const categoryStyles: Record<NodeCategory, string> = {
  source: "border-blue-500 bg-blue-50",
  transform: "border-purple-500 bg-purple-50",
  ai: "border-amber-500 bg-amber-50",
  destination: "border-green-500 bg-green-50",
};

const categoryIconBg: Record<NodeCategory, string> = {
  source: "bg-blue-100 text-blue-700",
  transform: "bg-purple-100 text-purple-700",
  ai: "bg-amber-100 text-amber-700",
  destination: "bg-green-100 text-green-700",
};

/**
 * Get display path for nodes that have catalog/schema/table config
 * Returns null if no path parts are filled
 */
function getNodeDisplayPath(data: PipelineNode["data"]): string | null {
  const config = data.config as Record<string, string | undefined>;
  const { category, subtype } = data;

  // Source table: catalog.schema.table
  if (category === "source" && subtype === "table") {
    const parts = [config.catalog, config.schema, config.table].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(".");
    }
  }

  // Source volume: catalog.schema.volume
  if (category === "source" && subtype === "volume") {
    const parts = [config.catalog, config.schema, config.volume].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(".");
    }
  }

  // Destination delta/streaming: catalog.schema.table
  if (category === "destination" && (subtype === "delta" || subtype === "streaming")) {
    const parts = [config.catalog, config.schema, config.table].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(".");
    }
  }

  return null;
}

/**
 * Truncate path with ellipsis in the middle to preserve beginning and end
 */
function truncatePath(path: string, maxLength: number = 24): string {
  if (path.length <= maxLength) return path;

  // Show beginning and end with ellipsis in middle
  const halfLength = Math.floor((maxLength - 3) / 2);
  return path.substring(0, halfLength) + "..." + path.substring(path.length - halfLength);
}

interface BaseNodeProps extends NodeProps<PipelineNode> {
  showInput?: boolean;
  showOutput?: boolean;
  inputCount?: number;
}

function BaseNodeComponent({
  id,
  data,
  selected,
  showInput = true,
  showOutput = true,
  inputCount = 1,
}: BaseNodeProps) {
  const category = data.category;
  const Icon = getNodeIcon(data.category, data.subtype);
  const { addLog, addApiCall } = usePipelineConsoleActions();
  const nodeSampleData = useNodeSampleData(id);
  const { setNodeSampleLoading, setNodeSampleResult, setNodeSampleError } = useNodeSampleDataActions();
  const nodes = usePipelineNodes();
  const edges = usePipelineEdges();

  // Validate node configuration
  const validation = useMemo(() => validateNode(data), [data]);

  // Get display path for nodes with catalog/schema/table config
  const displayPath = useMemo(() => getNodeDisplayPath(data), [data]);

  // Check sample data state
  const hasSampleData = nodeSampleData && !nodeSampleData.isLoading && !nodeSampleData.error && nodeSampleData.rows.length > 0;
  const isLoadingSample = nodeSampleData?.isLoading;
  const hasSampleError = nodeSampleData?.error;

  // Handle sample action - runs sampling query and shows results in console
  const handleSample = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      // Get warehouse ID from storage
      const warehouseData = loadWarehouse();
      if (!warehouseData?.warehouseId) {
        addLog("error", "No warehouse selected. Please select a warehouse in the SQL Editor first.");
        setNodeSampleError(id, "No warehouse selected");
        setNodeSampleLoading(id, data.label);
        setTimeout(() => setNodeSampleError(id, "No warehouse selected. Please select a warehouse in the SQL Editor first."), 0);
        return;
      }

      // Generate SQL for sampling
      const sqlResult = generateSampleSQL(
        id,
        nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
        edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        })),
        10
      );

      // Check for validation errors
      if (!sqlResult.isValid) {
        const errorMsg = sqlResult.invalidNodes.length > 0
          ? `Cannot sample: ${sqlResult.invalidNodes.map(n => `"${n.label}" (${n.issues.join(", ")})`).join("; ")}`
          : sqlResult.errors.join("; ");
        addLog("error", errorMsg);
        setNodeSampleLoading(id, data.label);
        setTimeout(() => setNodeSampleError(id, errorMsg), 0);
        return;
      }

      addLog("info", `Sampling data up to node: ${data.label}`);
      if (sqlResult.warnings.length > 0) {
        sqlResult.warnings.forEach(w => addLog("warn", w));
      }

      // Start loading
      setNodeSampleLoading(id, data.label);

      const startTime = Date.now();

      try {
        // Execute the SQL statement
        const executeResponse = await fetch("/api/databricks/sql/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            warehouse_id: warehouseData.warehouseId,
            statement: sqlResult.sql,
            wait_timeout: "30s",
            on_wait_timeout: "CONTINUE",
          }),
        });

        if (!executeResponse.ok) {
          const errorData = await executeResponse.json();
          throw new Error(errorData.error || "Failed to execute sample query");
        }

        const executeData = await executeResponse.json();
        const statementId = executeData.statement_id;

        addApiCall({
          method: "POST",
          endpoint: "/api/2.0/sql/statements",
          status: executeResponse.status,
          duration: Date.now() - startTime,
          request: { statement: sqlResult.sql.substring(0, 500) + "..." },
          response: { statement_id: statementId, state: executeData.status?.state },
        });

        // Check if we got immediate results
        if (
          executeData.status?.state === "SUCCEEDED" &&
          executeData.manifest?.schema &&
          executeData.result?.data_array
        ) {
          const columns = executeData.manifest.schema.columns.map((c: { name: string }) => c.name);
          const rows = executeData.result.data_array.map((row: unknown[]) => {
            const rowObj: Record<string, unknown> = {};
            columns.forEach((col: string, idx: number) => {
              rowObj[col] = row[idx];
            });
            return rowObj;
          });

          setNodeSampleResult(id, columns, rows);
          addLog("success", `Sampled ${rows.length} rows from ${data.label} in ${Date.now() - startTime}ms`);
          return;
        }

        // Need to poll for results
        const maxPolls = 60;
        let pollCount = 0;

        while (pollCount < maxPolls) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          pollCount++;

          const statusResponse = await fetch(`/api/databricks/sql/status/${statementId}`);

          if (!statusResponse.ok) {
            const errorData = await statusResponse.json();
            throw new Error(errorData.error || "Failed to get query status");
          }

          const statusData = await statusResponse.json();

          switch (statusData.status.state) {
            case "SUCCEEDED":
              if (statusData.manifest?.schema && statusData.result?.data_array) {
                const columns = statusData.manifest.schema.columns.map((c: { name: string }) => c.name);
                const rows = statusData.result.data_array.map((row: unknown[]) => {
                  const rowObj: Record<string, unknown> = {};
                  columns.forEach((col: string, idx: number) => {
                    rowObj[col] = row[idx];
                  });
                  return rowObj;
                });

                setNodeSampleResult(id, columns, rows);
                addLog("success", `Sampled ${rows.length} rows from ${data.label} in ${Date.now() - startTime}ms`);
                return;
              }
              throw new Error("Query succeeded but no results returned");

            case "FAILED":
              throw new Error(statusData.status.error?.message || "Sample query failed");

            case "CANCELED":
              throw new Error("Sample query was cancelled");

            case "CLOSED":
              throw new Error("Sample query session closed");

            case "PENDING":
            case "RUNNING":
              // Continue polling
              break;
          }
        }

        throw new Error("Sample query timed out after 60 seconds");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error during sampling";
        setNodeSampleError(id, errorMessage);
        addLog("error", `Sample failed: ${errorMessage}`);
      }
    },
    [addLog, addApiCall, data.label, id, nodes, edges, setNodeSampleLoading, setNodeSampleResult, setNodeSampleError]
  );

  return (
    <>
      {/* Floating toolbar - appears above node when selected */}
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        offset={8}
        className="flex items-center bg-white rounded-lg shadow-lg border border-slate-200 px-1"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50 gap-1.5"
              onClick={handleSample}
            >
              <Database className="h-3.5 w-3.5" />
              Sample
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Sample data up to this node
          </TooltipContent>
        </Tooltip>
      </NodeToolbar>

      <div
        className={cn(
          "px-3 py-2 rounded-lg border-2 min-w-[160px] shadow-sm transition-all relative",
          categoryStyles[category],
          selected && "ring-2 ring-blue-500 ring-offset-2",
          !validation.isValid && "border-amber-500"
        )}
      >
      {/* Warning badge for missing required fields */}
      {!validation.isValid && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-sm cursor-help">
              <AlertTriangle className="h-3 w-3 text-white" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px]">
            <p className="font-medium text-xs mb-1">Missing required fields:</p>
            <ul className="text-xs space-y-0.5">
              {validation.missingFields.map((field) => (
                <li key={field.path} className="text-amber-200">
                  • {field.label}
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Input handles */}
      {showInput && (
        <>
          {inputCount === 1 ? (
            <Handle
              type="target"
              position={Position.Left}
              className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
            />
          ) : (
            <>
              <Handle
                type="target"
                position={Position.Left}
                id="input-a"
                style={{ top: "30%" }}
                className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
              />
              <Handle
                type="target"
                position={Position.Left}
                id="input-b"
                style={{ top: "70%" }}
                className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
              />
            </>
          )}
        </>
      )}

      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-8 h-8 rounded-md flex items-center justify-center",
            categoryIconBg[category]
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-slate-900 truncate">
            {data.label}
          </div>
          <div className="text-xs text-slate-500 capitalize">
            {data.subtype.replace("-", " ")}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {id}
          </div>
          {displayPath && (
            <div
              className="text-[10px] text-slate-400 font-mono truncate mt-0.5"
              title={displayPath}
            >
              {truncatePath(displayPath)}
            </div>
          )}
        </div>
      </div>

      {/* Sample data indicator at bottom */}
      {(isLoadingSample || hasSampleData || hasSampleError) && (
        <div className="mt-2 pt-2 border-t border-slate-200/70">
          {isLoadingSample && (
            <div className="flex items-center gap-1.5 text-xs text-blue-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Sampling...</span>
            </div>
          )}
          {hasSampleData && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 cursor-pointer hover:text-emerald-700">
                  <Table2 className="h-3 w-3" />
                  <span>{nodeSampleData?.rowCount} rows sampled</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Click &ldquo;Data&rdquo; tab in console to view sample
              </TooltipContent>
            </Tooltip>
          )}
          {hasSampleError && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-red-500 cursor-help">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Sample failed</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                {hasSampleError}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

        {/* Output handle */}
        {showOutput && (
          <Handle
            type="source"
            position={Position.Right}
            className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
          />
        )}
      </div>
    </>
  );
}

export const BaseNode = memo(BaseNodeComponent);

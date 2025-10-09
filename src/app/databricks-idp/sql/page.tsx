"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { CatalogTreeView } from "@/components/unity-catalog/catalog-tree-view";
import { WarehouseSelector } from "@/components/sql-editor/warehouse-selector";
import { SQLEditorPanel } from "@/components/sql-editor/sql-editor-panel";
import { QueryResultsTable } from "@/components/sql-editor/query-results-table";
import { Button } from "@/components/ui/button";
import { Play, Square, Loader2, AlertCircle, CheckCircle2, StopCircle, PlayCircle, PanelLeftClose, PanelLeft } from "lucide-react";

interface ExecuteResponse {
  statement_id: string;
  status?: {
    state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED";
  };
  manifest?: {
    schema?: {
      columns: Array<{
        name: string;
        type_name: string;
        type_text: string;
        position: number;
      }>;
    };
    total_row_count?: number;
  };
  result?: {
    data_array?: unknown[][];
  };
}

interface StatusResponse {
  statement_id: string;
  status: {
    state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED";
    error?: {
      message?: string;
    };
  };
  manifest?: {
    schema: {
      columns: Array<{
        name: string;
        type_name: string;
        type_text: string;
        position: number;
      }>;
    };
    total_row_count?: number;
  };
  result?: {
    data_array?: unknown[][];
  };
}

export default function SQLPage() {
  const [warehouseId, setWarehouseId] = React.useState<string>("");
  const [warehouseState, setWarehouseState] = React.useState<"RUNNING" | "STOPPED" | "STARTING" | "STOPPING" | "DELETED" | undefined>();
  const [sqlQuery, setSqlQuery] = React.useState<string>("");
  const [statementId, setStatementId] = React.useState<string | null>(null);
  const [isPolling, setIsPolling] = React.useState(false);
  const [executionStartTime, setExecutionStartTime] = React.useState<number | null>(null);
  const [executionTime, setExecutionTime] = React.useState<number | null>(null);
  const [warehouseRefreshTrigger, setWarehouseRefreshTrigger] = React.useState<number>(0);
  const [isCatalogVisible, setIsCatalogVisible] = React.useState(true);
  const [queryResults, setQueryResults] = React.useState<{
    columns: Array<{
      name: string;
      type_name: string;
      type_text: string;
      position: number;
    }>;
    data: unknown[][];
    rowCount: number;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Execute SQL mutation
  const executeMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await fetch("/api/databricks/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          statement: query,
          wait_timeout: "10s",
          on_wait_timeout: "CONTINUE",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to execute query");
      }

      return response.json() as Promise<ExecuteResponse>;
    },
    onSuccess: (data) => {
      setStatementId(data.statement_id);
      setExecutionStartTime(Date.now());
      setError(null);

      // Trigger warehouse refresh when query is executed (warehouse may start)
      setWarehouseRefreshTrigger(Date.now());

      // Check if query completed immediately
      if (data.status?.state === "SUCCEEDED" && data.result?.data_array) {
        handleSuccessfulQuery(data);
      } else {
        // Start polling for results
        setIsPolling(true);
      }
    },
    onError: (err: Error) => {
      setError(err.message);
      setIsPolling(false);
      setExecutionTime(executionStartTime ? Date.now() - executionStartTime : null);
    },
  });

  // Poll for statement status
  const { data: statusData } = useQuery<StatusResponse>({
    queryKey: ["sql-status", statementId],
    queryFn: async () => {
      if (!statementId) throw new Error("No statement ID");

      const response = await fetch(`/api/databricks/sql/status/${statementId}`);
      if (!response.ok) {
        throw new Error("Failed to get status");
      }
      return response.json();
    },
    enabled: isPolling && !!statementId,
    refetchInterval: 1000, // Poll every second
    refetchOnWindowFocus: false,
  });

  const handleSuccessfulQuery = React.useCallback((data: ExecuteResponse | StatusResponse) => {
    if (data.manifest?.schema?.columns && data.result?.data_array) {
      setQueryResults({
        columns: data.manifest.schema.columns,
        data: data.result.data_array,
        rowCount: data.manifest.total_row_count || data.result.data_array.length,
      });
      setExecutionTime(executionStartTime ? Date.now() - executionStartTime : null);
    }
  }, [executionStartTime]);

  // Handle status updates
  React.useEffect(() => {
    if (!statusData || !isPolling) return;

    const state = statusData.status.state;

    if (state === "SUCCEEDED") {
      handleSuccessfulQuery(statusData);
      setIsPolling(false);
    } else if (state === "FAILED") {
      setError(statusData.status.error?.message || "Query failed");
      setIsPolling(false);
      setExecutionTime(executionStartTime ? Date.now() - executionStartTime : null);
    } else if (state === "CANCELED") {
      setError("Query was canceled");
      setIsPolling(false);
      setExecutionTime(executionStartTime ? Date.now() - executionStartTime : null);
    }
  }, [statusData, isPolling, executionStartTime, handleSuccessfulQuery]);

  const handleRunQuery = () => {
    if (!warehouseId) {
      setError("Please select a warehouse");
      return;
    }
    if (!sqlQuery.trim()) {
      setError("Please enter a SQL query");
      return;
    }

    setQueryResults(null);
    setError(null);
    setExecutionTime(null);
    executeMutation.mutate(sqlQuery);
  };

  const handleCancelQuery = async () => {
    if (!statementId) return;

    try {
      await fetch(`/api/databricks/sql/cancel/${statementId}`, {
        method: "POST",
      });
      setIsPolling(false);
      setError("Query canceled");
    } catch (err) {
      console.error("Failed to cancel query:", err);
    }
  };

  // Stop warehouse mutation
  const stopWarehouseMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/databricks/warehouses/${id}/stop`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to stop warehouse");
      }

      return response.json();
    },
    onSuccess: () => {
      // Refresh warehouse list to show new state
      setWarehouseRefreshTrigger(Date.now());
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  // Start warehouse mutation
  const startWarehouseMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/databricks/warehouses/${id}/start`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start warehouse");
      }

      return response.json();
    },
    onSuccess: () => {
      // Refresh warehouse list to show new state
      setWarehouseRefreshTrigger(Date.now());
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleStopWarehouse = () => {
    if (!warehouseId) return;
    stopWarehouseMutation.mutate(warehouseId);
  };

  const handleStartWarehouse = () => {
    if (!warehouseId) return;
    startWarehouseMutation.mutate(warehouseId);
  };

  const isExecuting = executeMutation.isPending || isPolling;

  return (
    <div className="h-full flex flex-col">
      {/* Main Layout with Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Panel - Catalog Tree (Collapsible) */}
          {isCatalogVisible && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={40}>
                <div className="h-full flex flex-col border-r">
                  <div className="p-4 border-b">
                    <h2 className="font-semibold text-sm">Catalog Explorer</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Browse tables and schemas
                    </p>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <CatalogTreeView showColumns={false} />
                  </div>
                </div>
              </Panel>
              <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />
            </>
          )}

          {/* Right Panel - Editor and Results */}
          <Panel>
            <PanelGroup direction="vertical">
              {/* Top Section - Toolbar and Editor */}
              <Panel defaultSize={45} minSize={20} maxSize={80}>
                <div className="h-full flex flex-col">
                  {/* Toolbar */}
                  <div className="p-4 border-b flex items-center gap-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsCatalogVisible(!isCatalogVisible)}
                      className="gap-2"
                      title={isCatalogVisible ? "Hide Catalog" : "Show Catalog"}
                    >
                      {isCatalogVisible ? (
                        <PanelLeftClose className="h-4 w-4" />
                      ) : (
                        <PanelLeft className="h-4 w-4" />
                      )}
                    </Button>
                    <WarehouseSelector
                      value={warehouseId}
                      onValueChange={setWarehouseId}
                      refreshTrigger={warehouseRefreshTrigger}
                      onWarehouseStateChange={setWarehouseState}
                    />
                    {warehouseState === "STOPPED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleStartWarehouse}
                        disabled={!warehouseId || startWarehouseMutation.isPending}
                        className="gap-2"
                      >
                        {startWarehouseMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                        Start
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleStopWarehouse}
                        disabled={!warehouseId || warehouseState === "STOPPING" || warehouseState === "STARTING" || stopWarehouseMutation.isPending}
                        className="gap-2"
                      >
                        {stopWarehouseMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <StopCircle className="h-4 w-4" />
                        )}
                        Stop
                      </Button>
                    )}
                    <div className="flex gap-2 ml-auto">
                      {isExecuting ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleCancelQuery}
                          className="gap-2"
                        >
                          <Square className="h-4 w-4" />
                          Cancel
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleRunQuery}
                          disabled={!warehouseId || !sqlQuery.trim()}
                          className="gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Run Query
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* SQL Editor */}
                  <div className="flex-1 min-h-0">
                    <SQLEditorPanel
                      value={sqlQuery}
                      onChange={setSqlQuery}
                      onRun={handleRunQuery}
                      readOnly={isExecuting}
                    />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors" />

              {/* Bottom Section - Status and Results */}
              <Panel defaultSize={55} minSize={20}>
                <div className="h-full flex flex-col">
                  {/* Status Bar */}
                  <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-4">
                    {isExecuting && (
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className="text-blue-600 dark:text-blue-400">
                          Executing query...
                        </span>
                      </div>
                    )}
                    {!isExecuting && queryResults && (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-green-600 dark:text-green-400">
                          Query succeeded
                        </span>
                      </div>
                    )}
                    {!isExecuting && error && (
                      <div className="flex items-center gap-2 text-sm">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-red-600 dark:text-red-400">{error}</span>
                      </div>
                    )}
                  </div>

                  {/* Results Panel */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {queryResults ? (
                      <QueryResultsTable
                        columns={queryResults.columns}
                        data={queryResults.data}
                        rowCount={queryResults.rowCount}
                        executionTime={executionTime || undefined}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center text-muted-foreground">
                          <p className="text-sm">No results yet</p>
                          <p className="text-xs mt-1">
                            Select a warehouse and run a query to see results
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

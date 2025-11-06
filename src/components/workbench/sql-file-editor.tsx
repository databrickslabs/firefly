"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { MonacoMultiFileEditor } from "@/components/sql-editor/monaco-multi-file-editor";
import { WarehouseSelector } from "@/components/sql-editor/warehouse-selector";
import { QueryResultsTable } from "@/components/sql-editor/query-results-table";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Play, Square, AlertCircle, CheckCircle2, Save } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { OpenFile } from "@/lib/workspace-file-manager";
import { loadWarehouse, saveWarehouse } from "@/lib/warehouse-storage";

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

interface SqlFileEditorProps {
  file: OpenFile;
  onContentChange: (content: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

export function SqlFileEditor({
  file,
  onContentChange,
  onSave,
  isSaving,
}: SqlFileEditorProps) {
  const [warehouseId, setWarehouseId] = React.useState<string>("");
  const [warehouseState, setWarehouseState] = React.useState<
    "RUNNING" | "STOPPED" | "STARTING" | "STOPPING" | "DELETED" | undefined
  >();
  const [statementId, setStatementId] = React.useState<string | null>(null);
  const [isPolling, setIsPolling] = React.useState(false);
  const [executionStartTime, setExecutionStartTime] = React.useState<number | null>(null);
  const [executionTime, setExecutionTime] = React.useState<number | null>(null);
  const [warehouseRefreshTrigger, setWarehouseRefreshTrigger] = React.useState<number>(0);
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

  // Load persisted warehouse selection on mount
  React.useEffect(() => {
    const stored = loadWarehouse();
    if (stored) {
      setWarehouseId(stored.warehouseId);
    }
  }, []);

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

  const handleSuccessfulQuery = React.useCallback(
    (data: ExecuteResponse | StatusResponse) => {
      if (data.manifest?.schema?.columns && data.result?.data_array) {
        setQueryResults({
          columns: data.manifest.schema.columns,
          data: data.result.data_array,
          rowCount: data.manifest.total_row_count || data.result.data_array.length,
        });
        setIsPolling(false);
        setExecutionTime(executionStartTime ? Date.now() - executionStartTime : null);
        setError(null);
      }
    },
    [executionStartTime]
  );

  // Handle status updates
  React.useEffect(() => {
    if (!statusData || !isPolling) return;

    if (statusData.status.state === "SUCCEEDED") {
      handleSuccessfulQuery(statusData);
    } else if (statusData.status.state === "FAILED") {
      setError(statusData.status.error?.message || "Query failed");
      setIsPolling(false);
      setExecutionTime(executionStartTime ? Date.now() - executionStartTime : null);
    } else if (statusData.status.state === "CANCELED") {
      setError("Query was canceled");
      setIsPolling(false);
      setExecutionTime(executionStartTime ? Date.now() - executionStartTime : null);
    }
  }, [statusData, isPolling, executionStartTime, handleSuccessfulQuery]);

  // Cancel query mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!statementId) throw new Error("No statement ID");

      const response = await fetch(`/api/databricks/sql/cancel/${statementId}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to cancel query");
      }

      return response.json();
    },
    onSuccess: () => {
      setIsPolling(false);
      setError("Query was canceled");
      setExecutionTime(executionStartTime ? Date.now() - executionStartTime : null);
    },
    onError: (err: Error) => {
      setError(`Failed to cancel query: ${err.message}`);
    },
  });

  const handleRunQuery = () => {
    if (!warehouseId) {
      setError("Please select a warehouse");
      return;
    }

    if (!file.content.trim()) {
      setError("Please enter a SQL query");
      return;
    }

    setQueryResults(null);
    setError(null);
    setExecutionTime(null);
    executeMutation.mutate(file.content);
  };

  const handleCancelQuery = () => {
    cancelMutation.mutate();
  };

  const handleWarehouseSelect = (id: string) => {
    setWarehouseId(id);
    saveWarehouse({ warehouseId: id, timestamp: Date.now() });
  };

  const isRunning = executeMutation.isPending || isPolling;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-background">
        <WarehouseSelector
          value={warehouseId}
          onValueChange={handleWarehouseSelect}
          onWarehouseStateChange={setWarehouseState}
          refreshTrigger={warehouseRefreshTrigger}
        />
        <div className="flex-1" />
        <Button onClick={onSave} variant="outline" size="sm" disabled={isSaving || !file.isDirty}>
          {isSaving ? (
            <>
              <Spinner className="h-4 w-4 mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save
              <Kbd className="ml-2">⌘S</Kbd>
            </>
          )}
        </Button>
        {isRunning ? (
          <Button
            onClick={handleCancelQuery}
            variant="destructive"
            size="sm"
            disabled={cancelMutation.isPending}
          >
            <Square className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        ) : (
          <Button onClick={handleRunQuery} variant="default" size="sm" disabled={!warehouseId}>
            <Play className="h-4 w-4 mr-2" />
            Run
            <Kbd className="ml-2">⌘↵</Kbd>
          </Button>
        )}
      </div>

      {/* Editor and Results */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="vertical">
          {/* Editor Panel */}
          <Panel defaultSize={50} minSize={20}>
            <MonacoMultiFileEditor
              openFiles={[file]}
              activeFilePath={file.path}
              onContentChange={(path, content) => {
                if (path === file.path) {
                  onContentChange(content);
                }
              }}
              onSave={() => {
                if (file.path) {
                  onSave();
                }
              }}
              onRun={handleRunQuery}
            />
          </Panel>

          <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors" />

          {/* Results Panel */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col bg-muted/30">
              {/* Status Bar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-background text-sm">
                {isRunning ? (
                  <>
                    <Spinner className="h-4 w-4 text-blue-600" />
                    <span className="text-muted-foreground">Running query...</span>
                  </>
                ) : error ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span className="text-red-600">{error}</span>
                  </>
                ) : queryResults ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-muted-foreground">
                      Query completed in {executionTime ? (executionTime / 1000).toFixed(2) : "0"}s
                      {" · "}
                      {queryResults.rowCount.toLocaleString()}{" "}
                      {queryResults.rowCount === 1 ? "row" : "rows"}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Ready to run query</span>
                )}
              </div>

              {/* Results Table */}
              <div className="flex-1 overflow-auto">
                {queryResults && (
                  <QueryResultsTable
                    columns={queryResults.columns}
                    data={queryResults.data}
                    rowCount={queryResults.rowCount}
                  />
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

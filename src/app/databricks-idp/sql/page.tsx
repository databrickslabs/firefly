"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FileTree } from "@/components/sql-editor/file-tree";
import { EditorTabs } from "@/components/sql-editor/editor-tabs";
import { MonacoMultiFileEditor } from "@/components/sql-editor/monaco-multi-file-editor";
import { WarehouseSelector } from "@/components/sql-editor/warehouse-selector";
import { QueryResultsTable } from "@/components/sql-editor/query-results-table";
import { CollapsibleSidebar } from "@/components/sql-editor/collapsible-sidebar";
import { CatalogTreeView } from "@/components/unity-catalog/catalog-tree-view";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Play, Square, Loader2, AlertCircle, CheckCircle2, StopCircle, PlayCircle, Save } from "lucide-react";
import type { OpenFile } from "@/lib/workspace-file-manager";

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
  const queryClient = useQueryClient();
  const sidebarPanelRef = React.useRef<React.ElementRef<typeof Panel>>(null);
  const [warehouseId, setWarehouseId] = React.useState<string>("");
  const [warehouseState, setWarehouseState] = React.useState<"RUNNING" | "STOPPED" | "STARTING" | "STOPPING" | "DELETED" | undefined>();
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

  // File management state
  const [openFiles, setOpenFiles] = React.useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = React.useState<string | null>(null);
  const [fileToClose, setFileToClose] = React.useState<string | null>(null);

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

  // Save file mutation
  const saveFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const response = await fetch("/api/databricks/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          content,
          format: "AUTO",
          isNotebook: false, // Save as file, not notebook
          overwrite: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save file");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Mark file as not dirty
      setOpenFiles((files) =>
        files.map((f) =>
          f.path === variables.path ? { ...f, isDirty: false } : f
        )
      );
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
    },
    onError: (err: Error) => {
      setError(`Failed to save file: ${err.message}`);
    },
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

  const handleFileSelect = async (filePath: string) => {
    // Check if file is already open
    const existingFile = openFiles.find((f) => f.path === filePath);
    if (existingFile) {
      setActiveFilePath(filePath);
      return;
    }

    // Fetch file content
    try {
      const response = await fetch(
        `/api/databricks/workspace/export?path=${encodeURIComponent(filePath)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch file");
      }

      const data = await response.json();
      const newFile: OpenFile = {
        path: filePath,
        name: filePath.split("/").pop() || "",
        content: data.content || "",
        isDirty: false,
        language: "sql",
      };

      setOpenFiles((files) => [...files, newFile]);
      setActiveFilePath(filePath);
    } catch (err) {
      setError(`Failed to open file: ${err}`);
    }
  };

  const handleTabClose = (filePath: string) => {
    const file = openFiles.find((f) => f.path === filePath);
    if (file?.isDirty) {
      // Show alert dialog for unsaved changes
      setFileToClose(filePath);
      return;
    }

    // Close immediately if no unsaved changes
    closeFile(filePath);
  };

  const closeFile = (filePath: string) => {
    setOpenFiles((files) => files.filter((f) => f.path !== filePath));

    if (activeFilePath === filePath) {
      const remainingFiles = openFiles.filter((f) => f.path !== filePath);
      setActiveFilePath(remainingFiles.length > 0 ? remainingFiles[0].path : null);
    }
  };

  const handleConfirmClose = () => {
    if (fileToClose) {
      closeFile(fileToClose);
      setFileToClose(null);
    }
  };

  const handleCancelClose = () => {
    setFileToClose(null);
  };

  const handleContentChange = (path: string, content: string) => {
    setOpenFiles((files) =>
      files.map((f) => {
        if (f.path === path) {
          return { ...f, content, isDirty: true };
        }
        return f;
      })
    );
  };

  const handleSave = (path: string) => {
    const file = openFiles.find((f) => f.path === path);
    if (!file) return;

    saveFileMutation.mutate({
      path: file.path,
      content: file.content,
    });
  };

  const handleRunQuery = () => {
    if (!warehouseId) {
      setError("Please select a warehouse");
      return;
    }

    const activeFile = openFiles.find((f) => f.path === activeFilePath);
    if (!activeFile || !activeFile.content.trim()) {
      setError("Please enter a SQL query");
      return;
    }

    setQueryResults(null);
    setError(null);
    setExecutionTime(null);
    executeMutation.mutate(activeFile.content);
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
  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const hasUnsavedChanges = openFiles.some((f) => f.isDirty);

  const fileToCloseData = openFiles.find((f) => f.path === fileToClose);

  return (
    <div className="h-full flex flex-col">
      {/* Unsaved Changes Alert Dialog */}
      <AlertDialog open={!!fileToClose} onOpenChange={(open) => !open && handleCancelClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              {fileToCloseData?.name} has unsaved changes. Are you sure you want to close it? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelClose}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose}>Close anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main Layout with Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Panel - Collapsible Sidebar */}
          <Panel
            ref={sidebarPanelRef}
            defaultSize={20}
            minSize={15}
            maxSize={40}
            collapsible={true}
            collapsedSize={5}
          >
            <CollapsibleSidebar
              panelRef={sidebarPanelRef}
              filesContent={
                <FileTree
                  onFileSelect={handleFileSelect}
                  selectedFilePath={activeFilePath}
                />
              }
              catalogContent={
                <CatalogTreeView
                  showColumns={true}
                  onItemSelect={(item) => {
                    // Handle catalog item selection if needed
                    console.log("Selected catalog item:", item);
                  }}
                />
              }
            />
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />

          {/* Right Panel - Editor and Results */}
          <Panel>
            <PanelGroup direction="vertical">
              {/* Top Section - Toolbar, Tabs, and Editor */}
              <Panel defaultSize={50} minSize={20} maxSize={80}>
                <div className="h-full flex flex-col">
                  {/* Toolbar */}
                  <div className="px-4 py-2 border-b flex items-center gap-4">
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
                        disabled={
                          !warehouseId ||
                          warehouseState === "STOPPING" ||
                          warehouseState === "STARTING" ||
                          stopWarehouseMutation.isPending
                        }
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => activeFilePath && handleSave(activeFilePath)}
                        disabled={!activeFile?.isDirty || saveFileMutation.isPending}
                        className="gap-2"
                      >
                        {saveFileMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save
                        {hasUnsavedChanges && (
                          <Kbd className="ml-1">⌘S</Kbd>
                        )}
                      </Button>
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
                          disabled={!warehouseId || !activeFile?.content.trim()}
                          className="gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Run Query
                          <Kbd className="ml-1">⌘↵</Kbd>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Editor Tabs */}
                  <EditorTabs
                    openFiles={openFiles}
                    activeFilePath={activeFilePath}
                    onTabClick={setActiveFilePath}
                    onTabClose={handleTabClose}
                  />

                  {/* Monaco Editor */}
                  <div className="flex-1 min-h-0">
                    <MonacoMultiFileEditor
                      openFiles={openFiles}
                      activeFilePath={activeFilePath}
                      onContentChange={handleContentChange}
                      onSave={handleSave}
                      onRun={handleRunQuery}
                      readOnly={isExecuting}
                    />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors" />

              {/* Bottom Section - Status and Results */}
              <Panel defaultSize={50} minSize={20}>
                <div className="h-full flex flex-col">
                  {/* Status Bar */}
                  <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-4">
                    {isExecuting ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className="text-blue-600 dark:text-blue-400">
                          Executing query...
                        </span>
                      </div>
                    ) : error ? (
                      <div className="flex items-center gap-2 text-sm">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-red-600 dark:text-red-400">{error}</span>
                      </div>
                    ) : queryResults ? (
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-green-600 dark:text-green-400">
                          Query succeeded
                        </span>
                      </div>
                    ) : null}
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

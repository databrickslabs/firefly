"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { NotebookCell } from "./notebook-cell";
import { UnifiedClusterSelector } from "./unified-cluster-selector";
import type {
  Notebook,
  CellType,
} from "@/lib/notebook-manager";
import {
  insertCellAt,
  deleteCellAt,
  updateCellAt,
  moveCellUp,
  moveCellDown,
  clearAllOutputs,
  databricksResultToCellOutput,
} from "@/lib/notebook-manager";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Plus, Play, Trash2, Save, RotateCcw, Square } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { ContextStatusResponse } from "@/hooks/use-notebook-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

interface InsertCellTriggerProps {
  onInsert: () => void;
  disabled?: boolean;
}

function InsertCellTrigger({ onInsert, disabled = false }: InsertCellTriggerProps) {
  return (
    <div className="relative flex items-center justify-center py-2 hover:py-5 transition-all duration-150 group">
      <div className="h-px w-full border-t border-dashed border-transparent group-hover:border-muted-foreground/30 transition-colors duration-150" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 bg-background shadow-sm"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onInsert();
          }}
          disabled={disabled}
          title="Insert cell"
        >
          <Plus className="h-3 w-3" />
          Add Cell
        </Button>
      </div>
    </div>
  );
}

interface NotebookEditorProps {
  notebook: Notebook;
  clusterId: string | null;
  contextId: string | null;
  contextStatus?: ContextStatusResponse;
  language?: string;
  onNotebookChange: (notebook: Notebook) => void;
  onContextChange?: (contextId: string | null) => void;
  onSave?: () => void;
  isSaving?: boolean;
  readOnly?: boolean;
  onClusterChange?: (clusterId: string) => void;
  onLanguageChange?: (language: string) => void;
}

export function NotebookEditor({
  notebook,
  clusterId,
  contextId,
  contextStatus,
  language = "python",
  onNotebookChange,
  onContextChange,
  onSave,
  isSaving = false,
  readOnly = false,
  onClusterChange,
  onLanguageChange,
}: NotebookEditorProps) {
  const [selectedCellIndex, setSelectedCellIndex] = React.useState<number>(0);
  // Map of cell index to command ID for tracking running cells
  const [runningCells, setRunningCells] = React.useState<Map<number, string>>(new Map());
  const [clearAllDialog, setClearAllDialog] = React.useState(false);
  const [restartKernelDialog, setRestartKernelDialog] = React.useState(false);
  const [isRestartingKernel, setIsRestartingKernel] = React.useState(false);
  const [isRunningAll, setIsRunningAll] = React.useState(false);
  // Version counter to force remounts during moves - prevents Monaco Editor stale render issues
  const [cellsVersion, setCellsVersion] = React.useState(0);
  // Track run all state
  const runAllAbortController = React.useRef<AbortController | null>(null);

  // Fetch clusters to get full cluster details
  const { data: clustersData } = useQuery({
    queryKey: ["clusters"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/clusters/list");
      if (!response.ok) {
        throw new Error("Failed to fetch clusters");
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchOnWindowFocus: true,
  });

  const selectedCluster = React.useMemo(() => {
    if (!clusterId || !clustersData?.clusters) return undefined;
    return clustersData.clusters.find((c: { cluster_id: string }) => c.cluster_id === clusterId);
  }, [clusterId, clustersData]);

  // Cancel cell execution
  const handleCancelCell = async (cellIndex: number) => {
    const commandId = runningCells.get(cellIndex);
    if (!commandId || !clusterId || !contextId) {
      return;
    }

    try {
      console.log(`Cancelling cell ${cellIndex}, command ${commandId}`);

      // Immediately update UI to show cancelling state
      onNotebookChange(
        updateCellAt(notebook, cellIndex, {
          executionState: "cancelling",
        })
      );

      const response = await fetch("/api/databricks/contexts/cancel-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_id: clusterId,
          context_id: contextId,
          command_id: commandId,
        }),
      });

      if (!response.ok) {
        console.error("Failed to cancel command");
      } else {
        console.log(`Successfully initiated cancellation for cell ${cellIndex}`);
      }
    } catch (error) {
      console.error("Error cancelling command:", error);
    }
  };

  // Execute cell mutation
  const executeCellMutation = useMutation({
    mutationFn: async ({
      cellIndex,
      command,
    }: {
      cellIndex: number;
      command: string;
    }) => {
      if (!clusterId || !contextId) {
        throw new Error("No cluster or context selected");
      }

      const response = await fetch("/api/databricks/contexts/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_id: clusterId,
          context_id: contextId,
          command,
          language,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute command");
      }

      const data = await response.json();
      return { cellIndex, commandId: data.id };
    },
    onMutate: ({ cellIndex }) => {
      // Mark cell as running (will add command ID in onSuccess)
      onNotebookChange(
        updateCellAt(notebook, cellIndex, {
          executionState: "running",
          outputs: [],
        })
      );
    },
  });

  const handleRunCell = (index: number, onComplete?: (success: boolean) => void) => {
    const cell = notebook.cells[index];
    if (cell.type !== "code" || !cell.source.trim()) {
      onComplete?.(true);
      return;
    }

    // Check if context is healthy before executing
    if (!isContextHealthy) {
      onNotebookChange(
        updateCellAt(notebook, index, {
          executionState: "failed",
          outputs: [
            {
              output_type: "error",
              ename: "ContextError",
              evalue: "Execution context is not ready. Please wait for cluster to be running.",
              traceback: [contextStatus?.reason || "Context not available"],
            },
          ],
        })
      );
      onComplete?.(false);
      return;
    }

    const startTime = Date.now();

    executeCellMutation.mutate(
      { cellIndex: index, command: cell.source },
      {
        onSuccess: async ({ cellIndex, commandId }) => {
          // Track command ID for this cell
          setRunningCells((prev) => {
            const next = new Map(prev);
            next.set(cellIndex, commandId);
            return next;
          });

          // Poll for results
          const pollForResults = async (): Promise<void> => {
            const response = await fetch(
              `/api/databricks/contexts/status/${commandId}?cluster_id=${clusterId}&context_id=${contextId}`
            );

            if (!response.ok) {
              throw new Error("Failed to get command status");
            }

            const data = await response.json();

            // Debug: Log the full response
            console.log("Command status response:", JSON.stringify(data, null, 2));

            // Handle terminal states
            if (data.status === "Finished" || data.status === "Error" || data.status === "Cancelled") {
              const executionTime = Date.now() - startTime;

              // Create custom output for cancelled cells
              const outputs = data.status === "Cancelled" ? [] : databricksResultToCellOutput(data);

              console.log("Converted outputs:", JSON.stringify(outputs, null, 2));

              onNotebookChange(
                updateCellAt(notebook, cellIndex, {
                  executionState:
                    data.status === "Finished" ? "succeeded" :
                    data.status === "Cancelled" ? "cancelled" : "failed",
                  outputs,
                  executionTime,
                  executionCount: data.status === "Finished" ? (notebook.cells[cellIndex].executionCount || 0) + 1 : notebook.cells[cellIndex].executionCount,
                })
              );

              setRunningCells((prev) => {
                const next = new Map(prev);
                next.delete(cellIndex);
                return next;
              });

              // Wait a bit for UI to render before notifying completion
              setTimeout(() => {
                onComplete?.(data.status === "Finished");
              }, 300);
            } else if (data.status === "Running" || data.status === "Queued") {
              // Continue polling for running or queued states
              setTimeout(pollForResults, 1000);
            } else if (data.status === "Cancelling") {
              // Update to cancelling state and continue polling
              onNotebookChange(
                updateCellAt(notebook, cellIndex, {
                  executionState: "cancelling",
                })
              );
              setTimeout(pollForResults, 1000);
            }
          };

          pollForResults();
        },
        onError: (error, { cellIndex }) => {
          onNotebookChange(
            updateCellAt(notebook, cellIndex, {
              executionState: "failed",
              outputs: [
                {
                  output_type: "error",
                  ename: "ExecutionError",
                  evalue: String(error),
                  traceback: [String(error)],
                },
              ],
            })
          );

          setRunningCells((prev) => {
            const next = new Map(prev);
            next.delete(cellIndex);
            return next;
          });

          // Notify completion with failure
          onComplete?.(false);
        },
      }
    );
  };

  const handleRunAll = () => {
    // Set running all state
    setIsRunningAll(true);

    // Create abort controller for this run
    runAllAbortController.current = new AbortController();
    const signal = runAllAbortController.current.signal;

    // Run cells sequentially, waiting for each to complete
    const runNext = async (index: number) => {
      // Check if aborted
      if (signal.aborted) {
        console.log("Run All aborted");
        setIsRunningAll(false);
        return;
      }

      if (index >= notebook.cells.length) {
        runAllAbortController.current = null;
        setIsRunningAll(false);
        return;
      }

      const cell = notebook.cells[index];
      if (cell.type === "code" && cell.source.trim()) {
        // Wait for cell to complete before continuing
        await new Promise<void>((resolve) => {
          handleRunCell(index, (success) => {
            // Stop if cell failed or aborted
            if (!success || signal.aborted) {
              console.log(`Cell ${index} failed or aborted, stopping Run All`);
              runAllAbortController.current = null;
              setIsRunningAll(false);
              resolve();
              return;
            }
            resolve();
          });
        });

        // Check again after cell completes
        if (signal.aborted) {
          return;
        }

        // Continue to next cell
        await runNext(index + 1);
      } else {
        // Skip non-code cells
        await runNext(index + 1);
      }
    };

    runNext(0);
  };

  const handleStopAll = async () => {
    // Abort the run all queue
    if (runAllAbortController.current) {
      runAllAbortController.current.abort();
      runAllAbortController.current = null;
    }

    // Cancel any currently running cells
    const runningCellIndices = Array.from(runningCells.keys());
    for (const cellIndex of runningCellIndices) {
      await handleCancelCell(cellIndex);
    }

    // Clear running state
    setIsRunningAll(false);
  };

  const handleInsertBelow = (index: number, type: CellType = "code") => {
    const newNotebook = insertCellAt(notebook, index + 1, type);
    onNotebookChange(newNotebook);
    setSelectedCellIndex(index + 1);
  };

  const handleInsertAbove = (index: number, type: CellType = "code") => {
    const newNotebook = insertCellAt(notebook, index, type);
    onNotebookChange(newNotebook);
    setSelectedCellIndex(index);
  };

  const handleDeleteCell = (index: number) => {
    const newNotebook = deleteCellAt(notebook, index);
    onNotebookChange(newNotebook);
    if (selectedCellIndex >= newNotebook.cells.length) {
      setSelectedCellIndex(Math.max(0, newNotebook.cells.length - 1));
    }
  };

  const handleCellSourceChange = (index: number, source: string) => {
    onNotebookChange(updateCellAt(notebook, index, { source }));
  };

  const handleClearAllOutputs = () => {
    onNotebookChange(clearAllOutputs(notebook));
    setClearAllDialog(false);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;

    // Use flushSync to ensure DOM updates complete before Monaco Editor tries to render
    flushSync(() => {
      onNotebookChange(moveCellUp(notebook, index));
      setCellsVersion((v) => v + 1);
      setSelectedCellIndex(index - 1);
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= notebook.cells.length - 1) return;

    // Use flushSync to ensure DOM updates complete before Monaco Editor tries to render
    flushSync(() => {
      onNotebookChange(moveCellDown(notebook, index));
      setCellsVersion((v) => v + 1);
      setSelectedCellIndex(index + 1);
    });
  };

  const handleRestartKernel = async () => {
    if (!clusterId || !contextId) return;

    setIsRestartingKernel(true);

    try {
      // First destroy the existing context
      const destroyResponse = await fetch("/api/databricks/contexts/destroy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_id: clusterId,
          context_id: contextId,
        }),
      });

      if (!destroyResponse.ok) {
        throw new Error("Failed to destroy context");
      }

      // Create a new context
      const createResponse = await fetch("/api/databricks/contexts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_id: clusterId,
          language,
        }),
      });

      if (!createResponse.ok) {
        throw new Error("Failed to create new context");
      }

      const newContextData = await createResponse.json();
      const newContextId = newContextData.id;

      // Update parent component with new contextId (this will update localStorage)
      if (onContextChange) {
        onContextChange(newContextId);
      }

      // Clear all outputs
      onNotebookChange(clearAllOutputs(notebook));
      setRunningCells(new Map());

      setRestartKernelDialog(false);
    } catch (error) {
      console.error("Failed to restart kernel:", error);
      // Handle error - could show a toast notification here
    } finally {
      setIsRestartingKernel(false);
    }
  };

  // Detach handler - destroys context and clears cluster selection
  const handleDetach = async () => {
    if (!clusterId || !contextId) return;

    try {
      // Destroy the context
      await fetch("/api/databricks/contexts/destroy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_id: clusterId,
          context_id: contextId,
        }),
      });

      // Clear cluster selection and context
      if (onClusterChange) {
        onClusterChange("");
      }
      if (onContextChange) {
        onContextChange(null);
      }

      // Clear running cells
      setRunningCells(new Map());
    } catch (error) {
      console.error("Failed to detach:", error);
    }
  };

  const hasRunningCells = runningCells.size > 0;
  const isContextHealthy = contextStatus?.healthy ?? false;
  const contextReadyToExecute = clusterId && contextId && isContextHealthy;
  const showStopButton = isRunningAll || hasRunningCells;

  return (
    <div className="h-full flex flex-col">
      {/* Compact Toolbar */}
      <div className="pl-2 pr-4 py-1.5 border-b flex items-center gap-2 bg-background text-sm">
        {/* Action Buttons - Left Side */}
        <ButtonGroup>
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={showStopButton ? handleStopAll : handleRunAll}
            disabled={!contextReadyToExecute || readOnly}
          >
            {showStopButton ? (
              <>
                <Square className="h-3 w-3 mr-1" />
                Stop
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" />
                Run All
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => handleInsertBelow(selectedCellIndex)}
            disabled={readOnly}
            title="Insert Cell"
          >
            <Plus className="h-3 w-3 mr-1" />
            Insert Cell
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setClearAllDialog(true)}
            disabled={readOnly}
            title="Clear All Outputs"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear All Outputs
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setRestartKernelDialog(true)}
            disabled={!contextReadyToExecute || hasRunningCells || readOnly || isRestartingKernel}
            title="Restart Kernel"
          >
            {isRestartingKernel ? (
              <>
                <Spinner className="h-3 w-3 text-purple-600 mr-1" />
                Restarting
              </>
            ) : (
              <>
                <RotateCcw className="h-3 w-3 mr-1" />
                Restart Kernel
              </>
            )}
          </Button>

          {onSave && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Spinner className="h-3 w-3 text-purple-600 mr-1" />
                  Saving
                </>
              ) : (
                <>
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </>
              )}
            </Button>
          )}
        </ButtonGroup>

        <div className="flex-1" />

        {/* Cluster and Language Selectors - Right Side */}
        {(onClusterChange || onLanguageChange) && (
          <>
            <div className="h-4 w-px bg-border mx-1" />

            {onClusterChange && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <UnifiedClusterSelector
                        value={clusterId || undefined}
                        onValueChange={onClusterChange}
                        contextHealthy={contextStatus?.healthy}
                        onDetach={handleDetach}
                        onClusterActionStart={() => {
                          // Cluster action started
                        }}
                        onClusterActionComplete={() => {
                          // Cluster action completed
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  {contextId && clusterId && (
                    <TooltipContent>
                      {contextStatus?.healthy ? (
                        <div className="text-xs">
                          <div className="font-semibold">Context Ready</div>
                          <div className="text-muted-foreground mt-1">
                            Context ID: {contextId}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs">
                          <div className="font-semibold">Context Unhealthy</div>
                          {contextStatus?.reason && (
                            <div className="text-muted-foreground mt-1">
                              {contextStatus.reason}
                            </div>
                          )}
                        </div>
                      )}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}

            {onLanguageChange && (
              <Select value={language} onValueChange={onLanguageChange}>
                <SelectTrigger className="h-7 w-[100px] text-xs">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="python">Python</SelectItem>
                  <SelectItem value="sql">SQL</SelectItem>
                  <SelectItem value="scala">Scala</SelectItem>
                  <SelectItem value="r">R</SelectItem>
                </SelectContent>
              </Select>
            )}
          </>
        )}
      </div>

      {/* Cells */}
      <div className="flex-1 overflow-auto pt-4 pb-32 px-4 space-y-4 bg-slate-50 dark:bg-slate-900">
        {notebook.cells.map((cell, index) => {
          const cellKey = `${cell.id}-v${cellsVersion}`;

          return (
            <div key={cellKey} className="space-y-2">
              {index === 0 && (
                <InsertCellTrigger onInsert={() => handleInsertAbove(0)} disabled={readOnly} />
              )}

              <NotebookCell
                cell={cell}
                index={index}
                isSelected={selectedCellIndex === index}
                isRunning={runningCells.has(index)}
                onSelect={() => setSelectedCellIndex(index)}
                onSourceChange={(source) => handleCellSourceChange(index, source)}
                onRun={() => handleRunCell(index)}
                onStop={() => handleCancelCell(index)}
                onDelete={() => handleDeleteCell(index)}
                onMoveUp={index > 0 ? () => handleMoveUp(index) : undefined}
                onMoveDown={index < notebook.cells.length - 1 ? () => handleMoveDown(index) : undefined}
                onInsertAbove={() => handleInsertAbove(index)}
                onInsertBelow={() => handleInsertBelow(index)}
                onChangeType={(type) => onNotebookChange(updateCellAt(notebook, index, { type }))}
                readOnly={readOnly}
              />

              <InsertCellTrigger onInsert={() => handleInsertBelow(index)} disabled={readOnly} />
            </div>
          );
        })}
      </div>

      {/* Clear All Outputs Dialog */}
      <AlertDialog open={clearAllDialog} onOpenChange={setClearAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Outputs</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all cell outputs? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAllOutputs}>Clear All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restart Kernel Dialog */}
      <AlertDialog open={restartKernelDialog} onOpenChange={setRestartKernelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Kernel</AlertDialogTitle>
            <AlertDialogDescription>
              This will destroy the current execution context and create a new one. All variables and
              imports will be lost. All cell outputs will be cleared. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestartingKernel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestartKernel} disabled={isRestartingKernel}>
              {isRestartingKernel ? (
                <>
                  <Spinner className="h-4 w-4 text-purple-600 mr-2" />
                  Restarting...
                </>
              ) : (
                "Restart Kernel"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

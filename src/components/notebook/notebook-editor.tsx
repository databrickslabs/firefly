"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { NotebookCell } from "./notebook-cell";
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
import { Plus, Play, Trash2, Save, Loader2, RotateCcw } from "lucide-react";
import type { ContextStatusResponse } from "@/hooks/use-notebook-context";
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
}: NotebookEditorProps) {
  const [selectedCellIndex, setSelectedCellIndex] = React.useState<number>(0);
  const [runningCells, setRunningCells] = React.useState<Set<number>>(new Set());
  const [clearAllDialog, setClearAllDialog] = React.useState(false);
  const [restartKernelDialog, setRestartKernelDialog] = React.useState(false);
  const [isRestartingKernel, setIsRestartingKernel] = React.useState(false);
  // Version counter to force remounts during moves - prevents Monaco Editor stale render issues
  const [cellsVersion, setCellsVersion] = React.useState(0);

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
      setRunningCells((prev) => new Set(prev).add(cellIndex));
      onNotebookChange(
        updateCellAt(notebook, cellIndex, {
          executionState: "running",
          outputs: [],
        })
      );
    },
  });

  const handleRunCell = (index: number) => {
    const cell = notebook.cells[index];
    if (cell.type !== "code" || !cell.source.trim()) return;

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
      return;
    }

    const startTime = Date.now();

    executeCellMutation.mutate(
      { cellIndex: index, command: cell.source },
      {
        onSuccess: async ({ cellIndex, commandId }) => {
          // Poll for results
          const pollForResults = async () => {
            const response = await fetch(
              `/api/databricks/contexts/status/${commandId}?cluster_id=${clusterId}&context_id=${contextId}`
            );

            if (!response.ok) {
              throw new Error("Failed to get command status");
            }

            const data = await response.json();

            // Debug: Log the full response
            console.log("Command status response:", JSON.stringify(data, null, 2));

            if (data.status === "Finished" || data.status === "Error") {
              const executionTime = Date.now() - startTime;
              const outputs = databricksResultToCellOutput(data);
              console.log("Converted outputs:", JSON.stringify(outputs, null, 2));

              onNotebookChange(
                updateCellAt(notebook, cellIndex, {
                  executionState: data.status === "Finished" ? "succeeded" : "failed",
                  outputs,
                  executionTime,
                  executionCount: (notebook.cells[cellIndex].executionCount || 0) + 1,
                })
              );

              setRunningCells((prev) => {
                const next = new Set(prev);
                next.delete(cellIndex);
                return next;
              });
            } else if (data.status === "Running" || data.status === "Queued") {
              // Continue polling
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
            const next = new Set(prev);
            next.delete(cellIndex);
            return next;
          });
        },
      }
    );
  };

  const handleRunAll = () => {
    // Run cells sequentially
    const runNext = (index: number) => {
      if (index >= notebook.cells.length) return;

      const cell = notebook.cells[index];
      if (cell.type === "code" && cell.source.trim()) {
        handleRunCell(index);
        // Wait for cell to finish before running next
        // This is simplified - a real implementation would need better sequencing
        setTimeout(() => runNext(index + 1), 2000);
      } else {
        runNext(index + 1);
      }
    };

    runNext(0);
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
      setRunningCells(new Set());

      setRestartKernelDialog(false);
    } catch (error) {
      console.error("Failed to restart kernel:", error);
      // Handle error - could show a toast notification here
    } finally {
      setIsRestartingKernel(false);
    }
  };

  const hasRunningCells = runningCells.size > 0;
  const isContextHealthy = contextStatus?.healthy ?? false;
  const contextReadyToExecute = clusterId && contextId && isContextHealthy;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b flex items-center gap-2 bg-background">
        <ButtonGroup>
          <Button
            variant="default"
            size="sm"
            onClick={handleRunAll}
            disabled={!contextReadyToExecute || hasRunningCells || readOnly}
          >
            {hasRunningCells ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run All
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleInsertBelow(selectedCellIndex)}
            disabled={readOnly}
          >
            <Plus className="h-4 w-4 mr-2" />
            Insert Cell
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setClearAllDialog(true)}
            disabled={readOnly}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All Outputs
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setRestartKernelDialog(true)}
            disabled={!contextReadyToExecute || hasRunningCells || readOnly || isRestartingKernel}
          >
            {isRestartingKernel ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Restarting...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restart Kernel
              </>
            )}
          </Button>
        </ButtonGroup>

        <div className="flex-1" />

        {onSave && (
          <Button variant="outline" size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        )}
      </div>

      {/* Cells */}
      <div className="flex-1 overflow-auto pt-4 pb-32 px-4 space-y-4">
        {notebook.cells.map((cell, index) => (
          <NotebookCell
            key={`${cell.id}-v${cellsVersion}`}
            cell={cell}
            index={index}
            isSelected={selectedCellIndex === index}
            isRunning={runningCells.has(index)}
            onSelect={() => setSelectedCellIndex(index)}
            onSourceChange={(source) => handleCellSourceChange(index, source)}
            onRun={() => handleRunCell(index)}
            onDelete={() => handleDeleteCell(index)}
            onMoveUp={index > 0 ? () => handleMoveUp(index) : undefined}
            onMoveDown={index < notebook.cells.length - 1 ? () => handleMoveDown(index) : undefined}
            onInsertAbove={() => handleInsertAbove(index)}
            onInsertBelow={() => handleInsertBelow(index)}
            onChangeType={(type) => onNotebookChange(updateCellAt(notebook, index, { type }))}
            readOnly={readOnly}
          />
        ))}
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
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
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

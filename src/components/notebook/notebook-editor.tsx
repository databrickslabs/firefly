"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { NotebookCell } from "./notebook-cell";
import type {
  Notebook,
  NotebookCell as NotebookCellType,
  CellType,
} from "@/lib/notebook-manager";
import {
  createEmptyCell,
  insertCellAt,
  deleteCellAt,
  updateCellAt,
  moveCellUp,
  moveCellDown,
  clearCellOutputs,
  clearAllOutputs,
  databricksResultToCellOutput,
} from "@/lib/notebook-manager";
import { Button } from "@/components/ui/button";
import { Plus, Play, Square, Trash2, Save, Loader2 } from "lucide-react";
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
  language?: string;
  onNotebookChange: (notebook: Notebook) => void;
  onSave?: () => void;
  isSaving?: boolean;
  readOnly?: boolean;
}

export function NotebookEditor({
  notebook,
  clusterId,
  language = "python",
  onNotebookChange,
  onSave,
  isSaving = false,
  readOnly = false,
}: NotebookEditorProps) {
  const [selectedCellIndex, setSelectedCellIndex] = React.useState<number>(0);
  const [contextId, setContextId] = React.useState<string | null>(null);
  const [runningCells, setRunningCells] = React.useState<Set<number>>(new Set());
  const [clearAllDialog, setClearAllDialog] = React.useState(false);

  // Create execution context when cluster changes
  const createContextMutation = useMutation({
    mutationFn: async ({ clusterId, lang }: { clusterId: string; lang: string }) => {
      const response = await fetch("/api/databricks/contexts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_id: clusterId,
          language: lang,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create execution context");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setContextId(data.id);
    },
  });

  // Create context when cluster is selected
  React.useEffect(() => {
    if (clusterId && !contextId) {
      createContextMutation.mutate({ clusterId, lang: language });
    }
  }, [clusterId, language]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Poll for command status
  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ["command-status", contextId],
    queryFn: async () => {
      const runningCellsArray = Array.from(runningCells);
      if (runningCellsArray.length === 0 || !clusterId || !contextId) {
        return null;
      }

      // Get the first running cell
      const cellIndex = runningCellsArray[0];
      const cell = notebook.cells[cellIndex];

      // This would need the commandId - we'll need to track it per cell
      // For now, we'll skip this and use a simpler approach
      return null;
    },
    enabled: false, // Disabled for now - needs refactoring to track commandId per cell
    refetchInterval: 1000,
  });

  const handleRunCell = (index: number) => {
    const cell = notebook.cells[index];
    if (cell.type !== "code" || !cell.source.trim()) return;

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

            if (data.status === "Finished" || data.status === "Error") {
              const executionTime = Date.now() - startTime;
              const outputs = databricksResultToCellOutput(data);

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

  const hasRunningCells = runningCells.size > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b flex items-center gap-2 bg-background">
        <Button
          variant="default"
          size="sm"
          onClick={handleRunAll}
          disabled={!clusterId || !contextId || hasRunningCells || readOnly}
          className="gap-2"
        >
          {hasRunningCells ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run All
            </>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleInsertBelow(selectedCellIndex)}
          disabled={readOnly}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Insert Cell
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setClearAllDialog(true)}
          disabled={readOnly}
          className="gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Clear All Outputs
        </Button>

        <div className="flex-1" />

        {onSave && (
          <Button variant="outline" size="sm" onClick={onSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save
              </>
            )}
          </Button>
        )}
      </div>

      {/* Cells */}
      <div className="flex-1 overflow-auto">
        {notebook.cells.map((cell, index) => (
          <NotebookCell
            key={cell.id}
            cell={cell}
            index={index}
            isSelected={selectedCellIndex === index}
            isRunning={runningCells.has(index)}
            onSelect={() => setSelectedCellIndex(index)}
            onSourceChange={(source) => handleCellSourceChange(index, source)}
            onRun={() => handleRunCell(index)}
            onDelete={() => handleDeleteCell(index)}
            onMoveUp={index > 0 ? () => onNotebookChange(moveCellUp(notebook, index)) : undefined}
            onMoveDown={
              index < notebook.cells.length - 1
                ? () => onNotebookChange(moveCellDown(notebook, index))
                : undefined
            }
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
    </div>
  );
}

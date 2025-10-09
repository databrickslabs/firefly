"use client";

import * as React from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type { NotebookCell as NotebookCellType } from "@/lib/notebook-manager";
import { CellOutput } from "./cell-output";
import { Button } from "@/components/ui/button";
import {
  Play,
  Square,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Loader2,
  Code,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NotebookCellProps {
  cell: NotebookCellType;
  index: number;
  isSelected: boolean;
  isRunning: boolean;
  onSelect: () => void;
  onSourceChange: (source: string) => void;
  onRun: () => void;
  onStop?: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onInsertAbove?: () => void;
  onInsertBelow?: () => void;
  onChangeType?: (type: "code" | "markdown") => void;
  readOnly?: boolean;
}

export function NotebookCell({
  cell,
  index,
  isSelected,
  isRunning,
  onSelect,
  onSourceChange,
  onRun,
  onStop,
  onDelete,
  onMoveUp,
  onMoveDown,
  onInsertAbove,
  onInsertBelow,
  onChangeType,
  readOnly = false,
}: NotebookCellProps) {
  const editorRef = React.useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount: OnMount = React.useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      // Shift+Enter to run cell
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
        if (!isRunning && cell.type === "code") {
          onRun();
        }
      });

      // Ctrl/Cmd+Enter to run and insert below
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        if (!isRunning && cell.type === "code") {
          onRun();
          onInsertBelow?.();
        }
      });
    },
    [isRunning, cell.type, onRun, onInsertBelow]
  );

  const getLanguage = () => {
    if (cell.type === "markdown") return "markdown";
    // Detect language from metadata or default to python
    return "python";
  };

  const getExecutionStateColor = () => {
    switch (cell.executionState) {
      case "running":
        return "border-blue-500";
      case "succeeded":
        return "border-green-500";
      case "failed":
        return "border-red-500";
      default:
        return "border-transparent";
    }
  };

  return (
    <div
      className={cn(
        "group border-l-4 transition-colors",
        getExecutionStateColor(),
        isSelected ? "bg-accent/20" : "hover:bg-accent/10"
      )}
      onClick={onSelect}
    >
      {/* Cell Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 border-b opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
          {cell.type === "code" ? (
            <>
              <Code className="h-3 w-3" />
              {cell.executionCount !== null && cell.executionCount !== undefined ? (
                <span>[{cell.executionCount}]</span>
              ) : (
                <span>[ ]</span>
              )}
            </>
          ) : (
            <>
              <Type className="h-3 w-3" />
              <span>Markdown</span>
            </>
          )}
        </div>

        {cell.type === "code" && (
          <>
            {isRunning ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onStop?.();
                }}
              >
                <Square className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onRun();
                }}
                disabled={readOnly}
              >
                <Play className="h-3 w-3" />
              </Button>
            )}
          </>
        )}

        <div className="flex-1" />

        {onChangeType && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={(e) => {
              e.stopPropagation();
              onChangeType(cell.type === "code" ? "markdown" : "code");
            }}
            title={cell.type === "code" ? "To Markdown" : "To Code"}
          >
            {cell.type === "code" ? <Type className="h-3 w-3" /> : <Code className="h-3 w-3" />}
          </Button>
        )}

        {onMoveUp && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            title="Move Up"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
        )}

        {onMoveDown && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            title="Move Down"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        )}

        {onInsertAbove && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={(e) => {
              e.stopPropagation();
              onInsertAbove();
            }}
            title="Insert Above"
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}

        {onInsertBelow && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={(e) => {
              e.stopPropagation();
              onInsertBelow();
            }}
            title="Insert Below"
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete Cell"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Editor */}
      <div className="relative min-h-[100px]">
        {isRunning && (
          <div className="absolute top-2 right-2 z-10">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          </div>
        )}

        <Editor
          height="100px"
          defaultLanguage={getLanguage()}
          language={getLanguage()}
          value={cell.source}
          onChange={(value) => onSourceChange(value || "")}
          onMount={handleEditorDidMount}
          theme="vs"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            readOnly: readOnly || isRunning,
            wordWrap: "on",
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              alwaysConsumeMouseWheel: false,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
          }}
        />
      </div>

      {/* Output */}
      {cell.outputs && cell.outputs.length > 0 && (
        <div className="px-2 py-2">
          <CellOutput outputs={cell.outputs} />
        </div>
      )}

      {/* Execution time */}
      {cell.executionTime !== undefined && (
        <div className="px-2 py-1 text-xs text-muted-foreground">
          Execution time: {cell.executionTime}ms
        </div>
      )}
    </div>
  );
}

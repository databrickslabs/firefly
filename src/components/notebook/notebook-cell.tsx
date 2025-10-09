"use client";

import * as React from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NotebookCell as NotebookCellType } from "@/lib/notebook-manager";
import { CellOutput } from "./cell-output";
import { Button } from "@/components/ui/button";
import {
  Play,
  Square,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Loader2,
  Code,
  Type,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [isEditingMarkdown, setIsEditingMarkdown] = React.useState(false);
  const [isCollapsed, setIsCollapsed] = React.useState(false);

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

  // Cleanup editor on unmount
  React.useEffect(() => {
    return () => {
      if (editorRef.current) {
        try {
          editorRef.current.dispose();
        } catch (error) {
          // Silently handle disposal errors during cleanup
          console.debug("Editor cleanup error:", error);
        }
        editorRef.current = null;
      }
    };
  }, []);

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
        "group border-l-4 transition-colors rounded-lg border border-border bg-card shadow-sm hover:shadow-md",
        getExecutionStateColor(),
        isSelected ? "ring-1 ring-primary/30 bg-accent/5" : ""
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

        {/* Toggle code visibility */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={(e) => {
            e.stopPropagation();
            setIsCollapsed(!isCollapsed);
          }}
          title={isCollapsed ? "Show code" : "Hide code"}
        >
          {isCollapsed ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </Button>

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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Add cells section */}
            {onInsertAbove && (
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onInsertAbove();
              }}>
                <span className="text-xs text-muted-foreground mr-3 w-4">A</span>
                <span>Add cell above</span>
              </DropdownMenuItem>
            )}
            {onInsertBelow && (
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onInsertBelow();
              }}>
                <span className="text-xs text-muted-foreground mr-3 w-4">B</span>
                <span>Add cell below</span>
              </DropdownMenuItem>
            )}

            {/* Move section */}
            {(onMoveUp || onMoveDown) && <DropdownMenuSeparator />}

            {onMoveUp && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp();
                }}
                disabled={!onMoveUp}
              >
                <ChevronUp className="h-4 w-4 mr-2" />
                Move up
                <span className="ml-auto text-xs text-muted-foreground">Ctrl+Option+↑</span>
              </DropdownMenuItem>
            )}

            {onMoveDown && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown();
                }}
                disabled={!onMoveDown}
              >
                <ChevronDown className="h-4 w-4 mr-2" />
                Move down
                <span className="ml-auto text-xs text-muted-foreground">Ctrl+Option+↓</span>
              </DropdownMenuItem>
            )}

            {/* Cell type section */}
            {onChangeType && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeType(cell.type === "code" ? "markdown" : "code");
                  }}
                >
                  <span className="text-xs text-muted-foreground mr-3 w-4">T</span>
                  <span>{cell.type === "code" ? "Convert to markdown" : "Convert to code"}</span>
                </DropdownMenuItem>
              </>
            )}

            {/* Output section */}
            {cell.type === "code" && cell.outputs && cell.outputs.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: Implement clear output
                  }}
                >
                  Clear output
                </DropdownMenuItem>
              </>
            )}

            {/* Delete section */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-red-600 focus:text-red-700 focus:bg-red-100 dark:focus:bg-red-900/20"
            >
              Delete cell
              <span className="ml-auto text-xs text-muted-foreground">D, D</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Editor or Rendered Markdown */}
      {isCollapsed ? (
        // Collapsed view - show truncated content with blur
        <div
          className="relative px-4 py-2 cursor-pointer hover:bg-accent/5 overflow-hidden"
          onClick={() => setIsCollapsed(false)}
        >
          <div className="relative">
            <div className="text-sm font-mono text-muted-foreground whitespace-nowrap overflow-hidden blur-[1px] select-none">
              {cell.source || '(empty cell)'}
            </div>
            <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent pointer-events-none" />
            <span className="absolute right-2 top-0 text-muted-foreground text-xs">...</span>
          </div>
        </div>
      ) : (
        // Expanded view - show full content
        <div className="relative">
          {isRunning && (
            <div className="absolute top-2 right-2 z-10">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            </div>
          )}

          {cell.type === "markdown" && !isEditingMarkdown && cell.source.trim() ? (
            <div
              className="px-4 py-3 markdown-content cursor-pointer hover:bg-accent/5"
              onDoubleClick={() => setIsEditingMarkdown(true)}
              title="Double-click to edit"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{cell.source}</ReactMarkdown>
            </div>
          ) : (
            <div
              onBlur={() => {
                if (cell.type === "markdown") {
                  setTimeout(() => setIsEditingMarkdown(false), 200);
                }
              }}
            >
              <Editor
                key={cell.id}
                height={`${(cell.source.split('\n').length * 21) + 16}px`}
                defaultLanguage={getLanguage()}
                language={getLanguage()}
                value={cell.source}
                onChange={(value) => onSourceChange(value || "")}
                onMount={handleEditorDidMount}
                theme="vs"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: cell.type === "markdown" ? "off" : "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  readOnly: readOnly || isRunning,
                  wordWrap: "on",
                  padding: { top: 8, bottom: 8 },
                  scrollbar: {
                    vertical: "hidden",
                    horizontal: "hidden",
                    alwaysConsumeMouseWheel: false,
                  },
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Output */}
      {!isCollapsed && cell.outputs && cell.outputs.length > 0 && (
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

"use client";

import * as React from "react";
import * as ReactDOM from "react-dom/client";
import Editor, { OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NotebookCell as NotebookCellType } from "@/lib/notebook-manager";
import { CellOutput } from "./cell-output";
import { NotebookAiEditButton, NotebookAiPrompt } from "./notebook-cell-ai-control";
import { Button } from "@/components/ui/button";
import {
  Play,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Code,
  Type,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
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
  onAiEdit?: (params: { cell: NotebookCellType; prompt: string }) => Promise<void> | void;
}

export function NotebookCell({
  cell,
  index: _index,
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
  onAiEdit,
}: NotebookCellProps) {
  const editorRef = React.useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = React.useRef<typeof Monaco | null>(null);
  const [isEditingMarkdown, setIsEditingMarkdown] = React.useState(false);
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isAiPromptOpen, setIsAiPromptOpen] = React.useState(false);
  const [isAiHovered, setIsAiHovered] = React.useState(false);
  const [aiPromptValue, setAiPromptValue] = React.useState("");
  const [isSubmittingAiPrompt, setIsSubmittingAiPrompt] = React.useState(false);
  const aiPromptTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const editorContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [aiSelectionPopover, setAiSelectionPopover] = React.useState<{
    selectedText: string;
    selection: Monaco.Selection | null;
  } | null>(null);
  const selectionPopoverWidgetRef = React.useRef<Monaco.editor.IContentWidget | null>(null);
  const selectionPopoverContainerRef = React.useRef<HTMLDivElement | null>(null);
  const selectionPopoverRootRef = React.useRef<ReactDOM.Root | null>(null);
  const isAiPromptOpenRef = React.useRef(isAiPromptOpen);
  const viewZoneIdRef = React.useRef<string | null>(null);
  const [isInlineAiControlsVisible, setIsInlineAiControlsVisible] = React.useState(false);
  const inlineAiControlsContainerRef = React.useRef<HTMLDivElement | null>(null);
  const inlineAiControlsRootRef = React.useRef<ReactDOM.Root | null>(null);
  const [selectionEndLine, setSelectionEndLine] = React.useState<number | null>(null);
  const [viewZoneHeight, setViewZoneHeight] = React.useState(140);

  React.useEffect(() => {
    isAiPromptOpenRef.current = isAiPromptOpen;
    if (isAiPromptOpen) {
      setAiSelectionPopover(null);
    }
  }, [isAiPromptOpen]);

  // Create inline AI controls container
  React.useEffect(() => {
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.zIndex = '100';
    container.style.pointerEvents = 'auto'; // Ensure interactions work
    container.setAttribute('aria-hidden', 'false'); // Override Monaco's aria-hidden
    inlineAiControlsContainerRef.current = container;
    return () => {
      inlineAiControlsContainerRef.current = null;
    };
  }, []);

  // Create selection popover container
  React.useEffect(() => {
    const container = document.createElement('div');
    container.className = 'selection-widget';
    selectionPopoverContainerRef.current = container;
    return () => {
      selectionPopoverContainerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (aiSelectionPopover) {
      setIsAiHovered(true);
      return;
    }

    if (!isAiPromptOpen) {
      setIsAiHovered(false);
    }
  }, [aiSelectionPopover, isAiPromptOpen]);

  const handleEditorDidMount: OnMount = React.useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

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

      const updateSelectionPopover = () => {
        if (isAiPromptOpenRef.current) {
          setAiSelectionPopover(null);
          // Remove widget if exists
          if (selectionPopoverWidgetRef.current) {
            editor.removeContentWidget(selectionPopoverWidgetRef.current);
            selectionPopoverWidgetRef.current = null;
          }
          return;
        }

        const selection = editor.getSelection();
        if (!selection || selection.isEmpty()) {
          setAiSelectionPopover(null);
          if (selectionPopoverWidgetRef.current) {
            editor.removeContentWidget(selectionPopoverWidgetRef.current);
            selectionPopoverWidgetRef.current = null;
          }
          return;
        }

        const model = editor.getModel();
        if (!model) {
          setAiSelectionPopover(null);
          return;
        }

        const selectedText = model.getValueInRange(selection);
        if (!selectedText.trim()) {
          setAiSelectionPopover(null);
          if (selectionPopoverWidgetRef.current) {
            editor.removeContentWidget(selectionPopoverWidgetRef.current);
            selectionPopoverWidgetRef.current = null;
          }
          return;
        }

        // Create/update content widget
        const container = selectionPopoverContainerRef.current;
        if (!container) return;

        // Remove existing widget
        if (selectionPopoverWidgetRef.current) {
          editor.removeContentWidget(selectionPopoverWidgetRef.current);
        }

        // Create new widget - position at the start of the selection (top)
        const widget: Monaco.editor.IContentWidget = {
          getId: () => 'selection-popover-widget',
          getDomNode: () => container,
          getPosition: () => ({
            position: {
              lineNumber: selection.startLineNumber,
              column: selection.startColumn,
            },
            preference: [
              monaco.editor.ContentWidgetPositionPreference.ABOVE,
            ],
          }),
        };

        selectionPopoverWidgetRef.current = widget;
        editor.addContentWidget(widget);

        setAiSelectionPopover({
          selectedText,
          selection,
        });
      };

      const disposables = [
        editor.onDidChangeCursorSelection(updateSelectionPopover),
        editor.onDidBlurEditorText(() => setAiSelectionPopover(null)),
        editor.onDidScrollChange(() => {
          if (!isAiPromptOpenRef.current) {
            updateSelectionPopover();
          }
        }),
        editor.onDidLayoutChange(() => {
          if (!isAiPromptOpenRef.current) {
            updateSelectionPopover();
          }
        }),
      ];

      const handleWindowResize = () => {
        if (!isAiPromptOpenRef.current) {
          updateSelectionPopover();
        }
      };

      window.addEventListener("resize", handleWindowResize);

      requestAnimationFrame(() => {
        if (!isAiPromptOpenRef.current) {
          updateSelectionPopover();
        }
      });

      editor.onDidDispose(() => {
        window.removeEventListener("resize", handleWindowResize);
        disposables.forEach((disposable) => disposable.dispose());
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
      case "cancelling":
        return "border-orange-500";
      case "cancelled":
        return "border-gray-500";
      case "succeeded":
        return "border-green-500";
      case "failed":
        return "border-red-500";
      default:
        return "border-transparent";
    }
  };

  const selectAllEditorContent = React.useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (!editor || !monaco) {
      return;
    }

    const model = editor.getModel();
    if (!model) {
      return;
    }

    const lastLine = model.getLineCount();
    const lastColumn = model.getLineMaxColumn(lastLine);

    editor.focus();
    editor.setSelection(new monaco.Range(1, 1, lastLine, lastColumn));
  }, []);

  const createInlineViewZone = React.useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (!editor || !monaco) return;

    // Remove existing view zone if any
    if (viewZoneIdRef.current) {
      editor.changeViewZones((changeAccessor) => {
        if (viewZoneIdRef.current) {
          changeAccessor.removeZone(viewZoneIdRef.current);
          viewZoneIdRef.current = null;
        }
      });
    }

    const selection = editor.getSelection();
    if (!selection) return;

    const container = inlineAiControlsContainerRef.current;
    if (!container) return;

    // Store the selection start line for view zone positioning
    setSelectionEndLine(selection.startLineNumber);

    // Add view zone BEFORE the selection (above it)
    editor.changeViewZones((changeAccessor) => {
      const viewZone: Monaco.editor.IViewZone = {
        afterLineNumber: selection.startLineNumber - 1, // Place above the selection
        heightInPx: viewZoneHeight, // Dynamic height based on content
        domNode: container,
        suppressMouseDown: false, // Allow mouse interactions
      };

      const id = changeAccessor.addZone(viewZone);
      viewZoneIdRef.current = id;
    });

    setIsInlineAiControlsVisible(true);
    setAiSelectionPopover(null);

    requestAnimationFrame(() => {
      aiPromptTextareaRef.current?.focus();
    });
  }, [viewZoneHeight]);

  const removeInlineViewZone = React.useCallback(() => {
    const editor = editorRef.current;
    if (editor && viewZoneIdRef.current) {
      editor.changeViewZones((changeAccessor) => {
        if (viewZoneIdRef.current) {
          changeAccessor.removeZone(viewZoneIdRef.current);
          viewZoneIdRef.current = null;
        }
      });
    }
    setIsInlineAiControlsVisible(false);
    setSelectionEndLine(null);
  }, []);

  const handleAiPromptOpen = React.useCallback(
    (options?: { preserveSelection?: boolean; initialPrompt?: string; inline?: boolean }) => {
      setIsAiPromptOpen(true);
      setAiPromptValue(options?.initialPrompt ?? "");

      if (options?.inline) {
        createInlineViewZone();
      } else {
        if (!options?.preserveSelection) {
          selectAllEditorContent();
        }
        setAiSelectionPopover(null);
      }

      onSelect();

      if (!options?.inline) {
        requestAnimationFrame(() => {
          aiPromptTextareaRef.current?.focus();
        });
      }
    },
    [onSelect, selectAllEditorContent, createInlineViewZone]
  );

  const handleAiPromptCancel = React.useCallback(() => {
    setIsAiPromptOpen(false);
    setIsAiHovered(false);
    setAiPromptValue("");
    setViewZoneHeight(140);
    removeInlineViewZone();
  }, [removeInlineViewZone]);

  // Handle Escape key to cancel AI prompt
  React.useEffect(() => {
    if (!isAiPromptOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleAiPromptCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAiPromptOpen, handleAiPromptCancel]);

  const handleAiPromptSubmit = React.useCallback(async () => {
    const trimmedPrompt = aiPromptValue.trim();
    if (!trimmedPrompt) {
      aiPromptTextareaRef.current?.focus();
      return;
    }

    if (!onAiEdit) {
      setIsAiPromptOpen(false);
      setIsAiHovered(false);
      setAiPromptValue("");
      setViewZoneHeight(140);
      removeInlineViewZone();
      return;
    }

    try {
      setIsSubmittingAiPrompt(true);
      await onAiEdit({ cell, prompt: trimmedPrompt });
      setIsAiPromptOpen(false);
      setIsAiHovered(false);
      setAiPromptValue("");
      setViewZoneHeight(140);
      removeInlineViewZone();
    } catch (error) {
      console.error("AI edit request failed", error);
    } finally {
      setIsSubmittingAiPrompt(false);
    }
  }, [aiPromptValue, cell, onAiEdit, removeInlineViewZone]);

  // Update view zone height dynamically by recreating with preserved focus
  React.useEffect(() => {
    if (!viewZoneIdRef.current || !editorRef.current || !isInlineAiControlsVisible) return;

    const editor = editorRef.current;
    const container = inlineAiControlsContainerRef.current;
    if (!container) return;

    // Get current focused element
    const activeElement = document.activeElement;
    const shouldRestoreFocus = activeElement?.tagName === 'TEXTAREA' &&
                               container.contains(activeElement);

    // Get cursor position if textarea is focused
    let cursorPos: { start: number; end: number } | null = null;
    if (shouldRestoreFocus && activeElement instanceof HTMLTextAreaElement) {
      cursorPos = {
        start: activeElement.selectionStart,
        end: activeElement.selectionEnd
      };
    }

    editor.changeViewZones((changeAccessor) => {
      // Remove old zone
      if (viewZoneIdRef.current) {
        changeAccessor.removeZone(viewZoneIdRef.current);
      }

      const selection = editor.getSelection();
      if (!selection) return;

      // Create new zone with updated height
      const viewZone: Monaco.editor.IViewZone = {
        afterLineNumber: selection.startLineNumber - 1,
        heightInPx: viewZoneHeight,
        domNode: container,
        suppressMouseDown: false,
      };

      const id = changeAccessor.addZone(viewZone);
      viewZoneIdRef.current = id;
    });

    // Restore focus and cursor position
    if (shouldRestoreFocus && activeElement instanceof HTMLTextAreaElement && cursorPos) {
      requestAnimationFrame(() => {
        activeElement.focus();
        activeElement.setSelectionRange(cursorPos.start, cursorPos.end);
      });
    }
  }, [viewZoneHeight, isInlineAiControlsVisible]);

  const showAiHighlight = isAiPromptOpen || isAiHovered;

  // Cleanup editor on unmount
  React.useEffect(() => {
    return () => {
      removeInlineViewZone();
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
  }, [removeInlineViewZone]);

  // Render selection popover buttons into content widget
  React.useEffect(() => {
    const container = selectionPopoverContainerRef.current;

    if (!container) return;

    // Create root if it doesn't exist
    if (!selectionPopoverRootRef.current) {
      selectionPopoverRootRef.current = ReactDOM.createRoot(container);
    }

    // Render content if popover is visible
    if (aiSelectionPopover && !readOnly && onAiEdit) {
      selectionPopoverRootRef.current.render(
        <div className="flex items-center gap-1 bg-white border border-purple-200 rounded-md shadow-md p-0.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 hover:bg-purple-50"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleAiPromptOpen({ preserveSelection: true, inline: true });
            }}
            title="Use AI on selection"
          >
            <Sparkles className="h-3 w-3 text-purple-600" />
          </Button>
        </div>
      );
    } else {
      // Clear the content when popover is hidden
      selectionPopoverRootRef.current.render(null);
    }

    // Cleanup happens separately to avoid race conditions
  }, [aiSelectionPopover, readOnly, onAiEdit, handleAiPromptOpen]);

  // Cleanup selection popover on unmount
  React.useEffect(() => {
    return () => {
      const root = selectionPopoverRootRef.current;
      if (root) {
        setTimeout(() => {
          root.unmount();
        }, 0);
        selectionPopoverRootRef.current = null;
      }
    };
  }, []);

  // Memoized handlers to prevent unnecessary re-renders
  const handleHeightChange = React.useCallback((height: number) => {
    const newHeight = Math.max(140, Math.min(300, height + 80));
    setViewZoneHeight((prev) => {
      if (prev !== newHeight) {
        return newHeight;
      }
      return prev;
    });
  }, []);

  const aiPromptValueRef = React.useRef(aiPromptValue);

  React.useEffect(() => {
    aiPromptValueRef.current = aiPromptValue;
  }, [aiPromptValue]);

  const handleAiPromptChange = React.useCallback((value: string) => {
    setAiPromptValue(value);
  }, []);

  // Render inline AI controls into the view zone container
  // CRITICAL: Only render once when opening, never re-render during typing
  React.useEffect(() => {
    const container = inlineAiControlsContainerRef.current;

    if (!container) return;

    // Only proceed if we're opening the prompt
    if (!isInlineAiControlsVisible || !isAiPromptOpen) return;

    // Create root if it doesn't exist
    if (!inlineAiControlsRootRef.current) {
      inlineAiControlsRootRef.current = ReactDOM.createRoot(container);
    }

    // Render ONCE - React handles internal updates via props
    inlineAiControlsRootRef.current.render(
      <div className="w-full px-1 py-1" style={{ pointerEvents: 'auto' }} aria-hidden="false">
        <NotebookAiPrompt
          ref={aiPromptTextareaRef}
          value={aiPromptValue}
          onChange={handleAiPromptChange}
          onCancel={handleAiPromptCancel}
          onSubmit={handleAiPromptSubmit}
          isSubmitting={isSubmittingAiPrompt}
          onHeightChange={handleHeightChange}
        />
      </div>
    );

    // Don't include aiPromptValue in deps - we only render on open/close
  }, [isInlineAiControlsVisible, isAiPromptOpen, handleAiPromptChange, handleAiPromptCancel, handleAiPromptSubmit, isSubmittingAiPrompt, handleHeightChange]);

  // Cleanup portal on unmount - use setTimeout to avoid race condition
  React.useEffect(() => {
    return () => {
      const root = inlineAiControlsRootRef.current;
      if (root) {
        setTimeout(() => {
          root.unmount();
        }, 0);
        inlineAiControlsRootRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "group border-l-4 transition-colors rounded-lg border border-border bg-card shadow-sm hover:shadow-md overflow-hidden",
        getExecutionStateColor(),
        isSelected ? "ring-1 ring-primary/30 bg-accent/5" : "",
        showAiHighlight ? "ring-2 ring-purple-300/70 shadow-[0_0_0_1.5px_rgba(167,139,250,0.4)]" : ""
      )}
      onClick={onSelect}
    >
      {/* Cell Toolbar */}
      <div className={cn(
        "flex items-center gap-1 px-2 py-1 bg-slate-100 border-b border-slate-200 transition-opacity rounded-t-lg",
        isRunning || cell.executionState === "cancelling" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
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
            {isRunning || cell.executionState === "cancelling" ? (
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-6 px-3 gap-1.5",
                  cell.executionState === "cancelling"
                    ? "border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 hover:text-orange-800"
                    : "border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onStop?.();
                }}
                disabled={cell.executionState === "cancelling"}
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs font-medium">
                  {cell.executionState === "cancelling" ? "Cancelling" : "Interrupt"}
                </span>
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

        <NotebookAiEditButton
          isActive={isAiPromptOpen}
          disabled={readOnly}
          onHoverChange={(hovering) => setIsAiHovered(hovering)}
          onClick={(event) => {
            event.stopPropagation();
            handleAiPromptOpen();
          }}
        />

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
        <div
          className={cn(
            "relative transition-colors",
            showAiHighlight ? "bg-purple-50" : ""
          )}
        >
          {isAiPromptOpen && !isInlineAiControlsVisible && (
            <div className="px-4 pt-4">
              <NotebookAiPrompt
                ref={aiPromptTextareaRef}
                value={aiPromptValue}
                onChange={(value) => setAiPromptValue(value)}
                onCancel={handleAiPromptCancel}
                onSubmit={handleAiPromptSubmit}
                isSubmitting={isSubmittingAiPrompt}
              />
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
              ref={editorContainerRef}
              className={cn(
                "relative p-4 transition-opacity",
                isAiPromptOpen && !isInlineAiControlsVisible ? "pointer-events-none opacity-80" : ""
              )}
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
      {!isCollapsed && cell.executionState === "cancelled" && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-start gap-2 text-gray-600">
            <div className="text-sm">
              <span className="font-medium">Execution cancelled</span>
              {cell.executionTime !== undefined && (
                <span className="ml-2 text-xs text-gray-500">
                  (after {cell.executionTime}ms)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Normal output - only show if not cancelled and has meaningful content */}
      {!isCollapsed && cell.executionState !== "cancelled" && cell.outputs && cell.outputs.length > 0 && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
          <CellOutput outputs={cell.outputs} />
        </div>
      )}

      {/* Execution time */}
      {cell.executionTime !== undefined && cell.executionState !== "cancelled" && (
        <div className="px-2 py-1 text-xs text-muted-foreground">
          Execution time: {cell.executionTime}ms
        </div>
      )}
    </div>
  );
}

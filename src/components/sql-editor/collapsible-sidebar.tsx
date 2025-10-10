"use client";

import * as React from "react";
import { Database, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useQueryStates, parseAsStringLiteral, parseAsBoolean } from "nuqs";

type SidebarView = "files" | "catalog" | null;

interface CollapsibleSidebarProps {
  filesContent: React.ReactNode;
  catalogContent: React.ReactNode;
  className?: string;
  panelRef?: React.RefObject<ImperativePanelHandle | null>;
  onExpandedChange?: (isExpanded: boolean) => void;
}

export const CollapsibleSidebar = React.memo(function CollapsibleSidebar({
  filesContent,
  catalogContent,
  className,
  panelRef,
  onExpandedChange,
}: CollapsibleSidebarProps) {
  // Use nuqs for URL state management
  const [urlState, setUrlState] = useQueryStates(
    {
      sidebarView: parseAsStringLiteral(["files", "catalog"] as const).withDefault("files"),
      sidebarExpanded: parseAsBoolean.withDefault(true),
    },
    {
      history: "replace", // Use replace to avoid polluting browser history
      shallow: true, // Shallow routing for better performance
    }
  );

  const activeView = urlState.sidebarView as SidebarView;
  const isExpanded = urlState.sidebarExpanded;

  // Notify parent when expanded state changes
  React.useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  const handleViewToggle = (view: SidebarView) => {
    if (activeView === view) {
      // Clicking active button toggles expanded/collapsed
      const newExpandedState = !isExpanded;
      setUrlState({ sidebarExpanded: newExpandedState });

      // Collapse or expand the panel
      if (panelRef?.current) {
        if (newExpandedState) {
          panelRef.current.expand();
        } else {
          panelRef.current.collapse();
        }
      }
    } else {
      // Switching to different view
      setUrlState({ sidebarView: view as "files" | "catalog", sidebarExpanded: true });

      // Ensure panel is expanded
      if (panelRef?.current) {
        panelRef.current.expand();
      }
    }
  };

  const handleToggleExpand = () => {
    const newExpandedState = !isExpanded;
    setUrlState({ sidebarExpanded: newExpandedState });

    // Collapse or expand the panel
    if (panelRef?.current) {
      if (newExpandedState) {
        panelRef.current.expand();
      } else {
        panelRef.current.collapse();
      }
    }
  };

  return (
    <div className={cn("h-full w-full flex", className)}>
      {/* Icon Bar */}
      <div className="w-12 flex-shrink-0 flex-col items-center py-4 gap-2 border-r border-slate-200 bg-slate-100/80 flex">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeView === "files" ? "secondary" : "ghost"}
                size="icon"
                className={cn(
                  "h-10 w-10",
                  activeView === "files" && isExpanded && "bg-slate-200 border border-slate-300 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
                  activeView === "files" && !isExpanded && "bg-accent text-foreground"
                )}
                onClick={() => handleViewToggle("files")}
              >
                <FileText className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Files</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeView === "catalog" ? "secondary" : "ghost"}
                size="icon"
                className={cn(
                  "h-10 w-10",
                  activeView === "catalog" && isExpanded && "bg-slate-200 border border-slate-300 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
                  activeView === "catalog" && !isExpanded && "bg-accent text-foreground"
                )}
                onClick={() => handleViewToggle("catalog")}
              >
                <Database className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Catalog</p>
            </TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          {activeView && isExpanded && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleToggleExpand}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Collapse</p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>

      {/* Content Panel */}
      {isExpanded && activeView && (
        <div className="flex-1 border-r border-slate-200 overflow-hidden bg-white">
          {activeView === "files" && (
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80">
                <h2 className="text-sm font-semibold">Workspace</h2>
              </div>
              <div className="flex-1 min-h-0">
                {filesContent}
              </div>
            </div>
          )}
          {activeView === "catalog" && (
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80">
                <h2 className="text-sm font-semibold">Catalog</h2>
              </div>
              <div className="flex-1 min-h-0">
                {catalogContent}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

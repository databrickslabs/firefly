"use client";

import * as React from "react";
import { Database, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ImperativePanelHandle } from "react-resizable-panels";

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
  const [activeView, setActiveView] = React.useState<SidebarView>("files");
  const [isExpanded, setIsExpanded] = React.useState(true);

  // Notify parent when expanded state changes
  React.useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  const handleViewToggle = (view: SidebarView) => {
    if (activeView === view) {
      // Clicking active button toggles expanded/collapsed
      const newExpandedState = !isExpanded;
      setIsExpanded(newExpandedState);

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
      setActiveView(view);
      setIsExpanded(true);

      // Ensure panel is expanded
      if (panelRef?.current) {
        panelRef.current.expand();
      }
    }
  };

  const handleToggleExpand = () => {
    const newExpandedState = !isExpanded;
    setIsExpanded(newExpandedState);

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
      <div className={cn(
        "flex-col items-center py-4 gap-2 border-r border-slate-200 bg-slate-100/80 flex",
        isExpanded ? "w-12 flex-shrink-0" : "w-full"
      )}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeView === "files" ? "secondary" : "ghost"}
                size="icon"
                className={cn(
                  "h-10 w-10",
                  activeView === "files" && "bg-accent"
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
                  activeView === "catalog" && "bg-accent"
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

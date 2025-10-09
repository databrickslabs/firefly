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
}

export function CollapsibleSidebar({
  filesContent,
  catalogContent,
  className,
  panelRef,
}: CollapsibleSidebarProps) {
  const [activeView, setActiveView] = React.useState<SidebarView>("files");
  const [isExpanded, setIsExpanded] = React.useState(true);

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
      <div className="w-12 flex-shrink-0 border-r bg-muted/30 flex flex-col items-center py-4 gap-2">
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

          {activeView && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleToggleExpand}
                >
                  {isExpanded ? (
                    <ChevronLeft className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{isExpanded ? "Collapse" : "Expand"}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>

      {/* Content Panel */}
      {isExpanded && activeView && (
        <div className="flex-1 border-r overflow-hidden">
          {activeView === "files" && (
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b">
                <h2 className="text-sm font-semibold">Workspace</h2>
              </div>
              <div className="flex-1 min-h-0">
                {filesContent}
              </div>
            </div>
          )}
          {activeView === "catalog" && (
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b">
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
}

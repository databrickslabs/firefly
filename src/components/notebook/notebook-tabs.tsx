"use client";

import * as React from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface NotebookTab {
  id: string;
  path: string | null;
  name: string;
  isDirty?: boolean;
}

interface NotebookTabsProps {
  tabs: NotebookTab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

export function NotebookTabs({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
}: NotebookTabsProps) {
  return (
    <div className="flex items-center gap-0 border-b bg-muted/30 overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "group relative flex items-center gap-2 px-4 py-2 border-r cursor-pointer transition-colors min-w-[120px] max-w-[200px]",
            activeTabId === tab.id
              ? "bg-background border-b-2 border-b-primary"
              : "hover:bg-accent/50"
          )}
          onClick={() => onTabClick(tab.id)}
        >
          <span className="truncate text-sm flex-1">
            {tab.name}
            {tab.isDirty && <span className="ml-1 text-orange-500">•</span>}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.id);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 mx-1"
        onClick={onNewTab}
        title="New Notebook"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

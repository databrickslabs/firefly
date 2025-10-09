"use client";

import * as React from "react";
import { X, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFileName } from "@/lib/workspace-file-manager";
import type { OpenFile } from "@/lib/workspace-file-manager";

interface EditorTabsProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
}

export function EditorTabs({
  openFiles,
  activeFilePath,
  onTabClick,
  onTabClose,
}: EditorTabsProps) {
  const tabsContainerRef = React.useRef<HTMLDivElement>(null);

  // Scroll active tab into view when it changes
  React.useEffect(() => {
    if (activeFilePath && tabsContainerRef.current) {
      const activeTab = tabsContainerRef.current.querySelector(`[data-path="${activeFilePath}"]`);
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [activeFilePath]);

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div
      ref={tabsContainerRef}
      className="flex items-center gap-0.5 overflow-x-auto bg-muted/30 border-b scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent"
    >
      {openFiles.map((file) => (
        <EditorTab
          key={file.path}
          file={file}
          isActive={file.path === activeFilePath}
          onClick={() => onTabClick(file.path)}
          onClose={(e) => {
            e.stopPropagation();
            onTabClose(file.path);
          }}
        />
      ))}
    </div>
  );
}

interface EditorTabProps {
  file: OpenFile;
  isActive: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function EditorTab({ file, isActive, onClick, onClose }: EditorTabProps) {
  return (
    <div
      data-path={file.path}
      className={`
        group flex items-center gap-2 px-3 py-2 cursor-pointer
        border-r border-border hover:bg-accent/50 transition-colors
        min-w-[120px] max-w-[200px]
        ${isActive ? "bg-background border-b-2 border-b-primary" : "bg-muted/30"}
      `}
      onClick={onClick}
      title={file.path}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {file.isDirty && <Circle className="h-2 w-2 fill-current shrink-0" />}
        <span className="truncate text-sm">{getFileName(file.path)}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/20"
        onClick={onClose}
        title="Close"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FileJson, ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SharedNotebook {
  id: string;
  workspacePath: string;
  objectId: string;
  notebookName: string;
  permissionLevel: string;
  sharedAt: string;
  sharedByEmail: string;
  sharedByName: string;
}

interface SharedNotebooksTreeProps {
  onNotebookClick?: (path: string, permissionLevel: string) => void;
  selectedFilePath?: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  level: number;
  notebook?: SharedNotebook;
  children?: TreeNode[];
}

function buildTree(notebooks: SharedNotebook[]): TreeNode[] {
  const root: Map<string, TreeNode> = new Map();

  notebooks.forEach((notebook) => {
    const parts = notebook.workspacePath.split("/").filter(Boolean);
    let currentPath = "";

    parts.forEach((part, index) => {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
      const isLastPart = index === parts.length - 1;

      if (!root.has(currentPath)) {
        root.set(currentPath, {
          name: part,
          path: currentPath,
          isDirectory: !isLastPart,
          level: index,
          notebook: isLastPart ? notebook : undefined,
          children: [],
        });
      }

      if (parentPath && root.has(parentPath)) {
        const parent = root.get(parentPath)!;
        const child = root.get(currentPath)!;
        if (!parent.children!.some((c) => c.path === child.path)) {
          parent.children!.push(child);
        }
      }
    });
  });

  // Get top-level nodes
  const topLevel: TreeNode[] = [];
  root.forEach((node) => {
    const parentPath = node.path.substring(0, node.path.lastIndexOf("/"));
    if (!parentPath || !root.has(parentPath)) {
      topLevel.push(node);
    }
  });

  return topLevel.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

function TreeNodeComponent({
  node,
  expandedPaths,
  togglePath,
  onNotebookClick,
  selectedFilePath,
}: {
  node: TreeNode;
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  onNotebookClick?: (path: string, permissionLevel: string) => void;
  selectedFilePath?: string | null;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedFilePath === node.path;
  const paddingLeft = 4 + node.level * 12;

  const handleClick = () => {
    if (node.isDirectory) {
      togglePath(node.path);
    } else if (node.notebook) {
      onNotebookClick?.(node.path, node.notebook.permissionLevel);
    }
  };

  return (
    <>
      <div
        className={`
          flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors
          ${isSelected ? "bg-accent" : ""}
        `}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
      >
        {node.isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-blue-500" />
            )}
          </>
        ) : (
          <>
            <div className="w-4" />
            <FileJson className="h-4 w-4 shrink-0 text-purple-500" />
          </>
        )}

        <span className="text-sm truncate flex-1">{node.name}</span>

        {node.notebook && (
          <Badge
            variant={node.notebook.permissionLevel === "CAN_EDIT" ? "default" : "secondary"}
            className="text-xs shrink-0"
          >
            {node.notebook.permissionLevel === "CAN_EDIT" ? "Edit" : "Read"}
          </Badge>
        )}
      </div>

      {node.isDirectory && isExpanded && node.children && node.children.length > 0 && (
        <>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              expandedPaths={expandedPaths}
              togglePath={togglePath}
              onNotebookClick={onNotebookClick}
              selectedFilePath={selectedFilePath}
            />
          ))}
        </>
      )}
    </>
  );
}

export function SharedNotebooksTree({ onNotebookClick, selectedFilePath }: SharedNotebooksTreeProps) {
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set(["/Workspace"]));

  const { data, isLoading, error, refetch } = useQuery<{ notebooks: SharedNotebook[] }>({
    queryKey: ["shared-notebooks"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/workspace/shared-notebooks");
      if (!response.ok) {
        throw new Error("Failed to fetch shared notebooks");
      }
      return response.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-red-600 mb-4 text-sm">Failed to load shared notebooks</p>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <Spinner className="h-8 w-8 text-purple-600" />
          <p className="text-sm text-muted-foreground">Loading shared notebooks...</p>
        </div>
      </div>
    );
  }

  if (!data?.notebooks || data.notebooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FileJson className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Shared Notebooks</h3>
        <p className="text-sm text-muted-foreground">
          Notebooks shared with you will appear here
        </p>
      </div>
    );
  }

  const tree = buildTree(data.notebooks);

  return (
    <div className="h-full overflow-auto">
      <div className="py-2">
        {tree.map((node) => (
          <TreeNodeComponent
            key={node.path}
            node={node}
            expandedPaths={expandedPaths}
            togglePath={togglePath}
            onNotebookClick={onNotebookClick}
            selectedFilePath={selectedFilePath}
          />
        ))}
      </div>
    </div>
  );
}

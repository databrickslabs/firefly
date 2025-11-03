"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FileJson, User, Calendar, Shield } from "lucide-react";
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

interface SharedNotebooksListProps {
  onNotebookClick?: (path: string) => void;
}

export function SharedNotebooksList({ onNotebookClick }: SharedNotebooksListProps) {
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getPermissionBadge = (level: string) => {
    switch (level) {
      case "CAN_EDIT":
        return <Badge className="bg-blue-500">Can Edit</Badge>;
      case "CAN_READ":
        return <Badge className="bg-green-500">Can Read</Badge>;
      default:
        return <Badge>{level}</Badge>;
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-red-600 mb-4">Failed to load shared notebooks</p>
        <Button onClick={() => refetch()} variant="outline">
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

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 space-y-3">
        {data.notebooks.map((notebook) => (
          <div
            key={notebook.id}
            className="border rounded-lg p-4 hover:bg-accent cursor-pointer transition-colors"
            onClick={() => onNotebookClick?.(notebook.workspacePath)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Notebook Name */}
                <div className="flex items-center gap-2 mb-2">
                  <FileJson className="h-5 w-5 text-blue-600 shrink-0" />
                  <h4 className="font-medium truncate">{notebook.notebookName}</h4>
                </div>

                {/* Path */}
                <p className="text-xs text-muted-foreground mb-3 truncate">
                  {notebook.workspacePath}
                </p>

                {/* Metadata */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>
                      Shared by {notebook.sharedByName || notebook.sharedByEmail}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(notebook.sharedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {getPermissionBadge(notebook.permissionLevel)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

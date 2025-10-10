"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Globe, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface Workspace {
  workspace_id: number;
  workspace_name: string;
  deployment_name: string;
  workspace_status: string;
  workspace_url: string;
  cloud?: string;
  aws_region?: string;
  location?: string;
}

interface WorkspacesResponse {
  workspaces: Workspace[];
}

interface WorkspaceSelectorProps {
  value?: string; // workspace URL without trailing slash
  onValueChange: (workspaceUrl: string) => void;
  className?: string;
}

export function WorkspaceSelector({ value, onValueChange, className }: WorkspaceSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [manualEntry, setManualEntry] = React.useState(false);
  const [manualUrl, setManualUrl] = React.useState(value || "");

  const { data: workspacesData, isLoading, error } = useQuery<WorkspacesResponse>({
    queryKey: ["account-workspaces"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/accounts/workspaces");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch workspaces");
      }
      return response.json();
    },
    retry: false, // Don't retry on auth errors
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const workspaces = workspacesData?.workspaces || [];

  // If there's an error or no workspaces, show manual entry
  React.useEffect(() => {
    if (error || (workspaces.length === 0 && !isLoading)) {
      setManualEntry(true);
    }
  }, [error, workspaces.length, isLoading]);

  // Normalize URLs by removing trailing slashes for comparison
  const normalizeUrl = (url: string) => url.replace(/\/$/, "");

  const selectedWorkspace = workspaces.find((w) => normalizeUrl(w.workspace_url) === normalizeUrl(value || ""));

  const getStatusBadgeColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "RUNNING":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "PROVISIONING":
      case "STARTING":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "FAILED":
      case "BANNED":
      case "CANCELING":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
    }
  };

  const getCloudIcon = (cloud?: string) => {
    // You could add specific cloud provider icons here
    return <Globe className="h-4 w-4 shrink-0" />;
  };

  const handleManualUrlChange = (url: string) => {
    setManualUrl(url);
    const normalized = normalizeUrl(url);
    if (normalized) {
      onValueChange(normalized);
    }
  };

  // If manual entry mode or error, show input field
  if (manualEntry) {
    return (
      <div className="space-y-2">
        <Input
          type="url"
          value={manualUrl}
          onChange={(e) => handleManualUrlChange(e.target.value)}
          placeholder="https://your-workspace.cloud.databricks.com"
          className={cn("w-full", className)}
        />
        {error && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Unable to load workspaces from account. Please enter URL manually.
          </p>
        )}
        {!error && workspaces.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground">
            Enter your Databricks workspace URL manually
          </p>
        )}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[400px] justify-between", className)}
        >
          {selectedWorkspace ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {getCloudIcon(selectedWorkspace.cloud)}
              <span className="truncate">{selectedWorkspace.workspace_name}</span>
              <span
                className={cn(
                  "ml-auto px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                  getStatusBadgeColor(selectedWorkspace.workspace_status)
                )}
              >
                {selectedWorkspace.workspace_status}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {isLoading ? "Loading workspaces..." : "Select workspace..."}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Search workspaces..." />
          <CommandList>
            <CommandEmpty>No workspace found.</CommandEmpty>
            <CommandGroup>
              {workspaces.map((workspace) => {
                const normalizedUrl = normalizeUrl(workspace.workspace_url);
                return (
                  <CommandItem
                    key={workspace.workspace_id}
                    value={workspace.workspace_name}
                    onSelect={() => {
                      onValueChange(normalizedUrl);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        normalizeUrl(value || "") === normalizedUrl ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getCloudIcon(workspace.cloud)}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{workspace.workspace_name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {normalizedUrl}
                          {workspace.cloud && ` • ${workspace.cloud.toUpperCase()}`}
                          {workspace.aws_region && ` • ${workspace.aws_region}`}
                          {workspace.location && ` • ${workspace.location}`}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "ml-auto px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                          getStatusBadgeColor(workspace.workspace_status)
                        )}
                      >
                        {workspace.workspace_status}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

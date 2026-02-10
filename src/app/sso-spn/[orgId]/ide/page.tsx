"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { VolumeFolderPicker } from "@/components/volume-folder-picker";
import {
  Plus,
  MoreVertical,
  Trash2,
  ExternalLink,
  NotebookPen,
  Code2,
  RefreshCw,
  AlertCircle,
  Cpu,
  BookOpen,
  Play,
  Square,
  Pencil,
  HardDrive,
  FolderOpen,
  Settings,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";

type AuthoringToolType = "MARIMO" | "CODE_SERVER";

interface AuthoringTool {
  id: string;
  name: string;
  description: string | null;
  type: AuthoringToolType;
  backingType: string;
  appId: string | null;
  appName: string | null;
  appUrl: string | null;
  appStatus: string | null;
  volumePath: string | null;
  status: string;
  statusMessage: string | null;
  hasActiveDeployment: boolean;
  deploymentStatus: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  creatorName: string | null;
  creatorEmail: string;
}

const toolTypeConfig = {
  MARIMO: {
    label: "Marimo Notebook",
    description: "Interactive Python notebooks with reactive execution",
    icon: NotebookPen,
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  CODE_SERVER: {
    label: "Code Server IDE",
    description: "VS Code in the browser for full development environments",
    icon: Code2,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  CREATING: {
    label: "Creating",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  STARTING: {
    label: "Starting",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  PENDING: {
    label: "Pending",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  RUNNING: {
    label: "Running",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  ACTIVE: {
    label: "Active",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  STOPPED: {
    label: "Stopped",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  STOPPING: {
    label: "Stopping",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  ERROR: {
    label: "Error",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  FAILED: {
    label: "Failed",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  DELETING: {
    label: "Deleting",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  UNKNOWN: {
    label: "Unknown",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
};

export default function IDEPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<AuthoringTool | null>(null);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDescription, setNewToolDescription] = useState("");
  const [newToolType, setNewToolType] = useState<AuthoringToolType>("MARIMO");
  const [newToolVolumePath, setNewToolVolumePath] = useState<string>("");

  // Edit dialog state
  const [editToolType, setEditToolType] = useState<AuthoringToolType>("MARIMO");
  const [editToolVolumePath, setEditToolVolumePath] = useState<string>("");

  // Folder picker dialog states
  const [createFolderPickerOpen, setCreateFolderPickerOpen] = useState(false);
  const [editFolderPickerOpen, setEditFolderPickerOpen] = useState(false);

  // Fetch authoring tools with periodic status refresh
  const {
    data: toolsData,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery<{ authoringTools: AuthoringTool[] }>({
    queryKey: ["authoring-tools"],
    queryFn: async () => {
      const response = await fetch("/api/sso-spn/authoring-tools");
      if (!response.ok) {
        throw new Error("Failed to fetch authoring tools");
      }
      return response.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 5000, // Refresh status every 5 seconds
  });

  // Create authoring tool mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      type: AuthoringToolType;
      volumePath?: string;
    }) => {
      const response = await fetch("/api/sso-spn/authoring-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create authoring tool");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authoring-tools"] });
      setCreateDialogOpen(false);
      setNewToolName("");
      setNewToolDescription("");
      setNewToolType("MARIMO");
      setNewToolVolumePath("");
    },
  });

  // Delete authoring tool mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/sso-spn/authoring-tools/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete authoring tool");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authoring-tools"] });
      setDeleteDialogOpen(false);
      setSelectedTool(null);
    },
  });

  // Start/Stop mutation
  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "start" | "stop" }) => {
      const response = await fetch(`/api/sso-spn/authoring-tools/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} environment`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authoring-tools"] });
    },
  });

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      type?: AuthoringToolType;
      volumePath?: string | null;
    }) => {
      const { id, ...updateData } = data;
      const response = await fetch(`/api/sso-spn/authoring-tools/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update environment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authoring-tools"] });
      setEditDialogOpen(false);
      setSelectedTool(null);
    },
  });

  // Setup/Deploy mutation
  const setupMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/sso-spn/authoring-tools/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to setup environment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authoring-tools"] });
    },
  });

  // Redeploy mutation (for changing type/backup while running)
  const redeployMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      type: AuthoringToolType;
      volumePath: string;
    }) => {
      const response = await fetch(`/api/sso-spn/authoring-tools/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "redeploy",
          type: data.type,
          volumePath: data.volumePath,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to redeploy environment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authoring-tools"] });
      setEditDialogOpen(false);
      setSelectedTool(null);
    },
  });

  const tools = toolsData?.authoringTools || [];

  // Validate name: after sanitization, must only contain lowercase letters, numbers, and dashes
  // and result in a valid 2-30 char app name (sanitized name + 7 char suffix: "-" + 6 random)
  const getNameError = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return null; // Don't show error for empty (handled by disabled button)
    if (/[^a-zA-Z0-9\s-]/.test(trimmed)) {
      return "Name can only contain letters, numbers, spaces, and dashes";
    }
    const sanitized = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (sanitized.length < 1) {
      return "Name must contain at least one letter or number";
    }
    return null;
  };

  const nameError = getNameError(newToolName);

  const handleCreate = () => {
    if (!newToolName.trim() || nameError) return;
    createMutation.mutate({
      name: newToolName.trim(),
      description: newToolDescription.trim() || undefined,
      type: newToolType,
      volumePath: newToolVolumePath || undefined,
    });
  };

  const handleDelete = () => {
    if (!selectedTool) return;
    deleteMutation.mutate(selectedTool.id);
  };

  const handleStartStop = (tool: AuthoringTool, action: "start" | "stop") => {
    actionMutation.mutate({ id: tool.id, action });
  };

  const openEditDialog = (tool: AuthoringTool) => {
    setSelectedTool(tool);
    setEditToolType(tool.type);
    setEditToolVolumePath(tool.volumePath || "");
    setEditDialogOpen(true);
  };

  const handleEdit = () => {
    if (!selectedTool) return;

    const isRunning = selectedTool.status === "RUNNING" || selectedTool.status === "ACTIVE";

    if (isRunning) {
      // When running, create a new deployment with updated settings
      if (!editToolVolumePath) {
        return; // Backup folder is required for redeploy
      }
      redeployMutation.mutate({
        id: selectedTool.id,
        type: editToolType,
        volumePath: editToolVolumePath,
      });
    } else {
      // When stopped, just update the database
      editMutation.mutate({
        id: selectedTool.id,
        type: editToolType,
        volumePath: editToolVolumePath || null,
      });
    }
  };

  // Helper to parse volume path into components
  // Path format: /Volumes/catalog/schema/volume/folder/subfolder
  const parseVolumePath = (path: string) => {
    if (!path) return { catalog: "", schema: "", volumeName: "", pathInVolume: "", fullPath: path };
    const parts = path.split("/").filter(Boolean);
    // parts = ["Volumes", "catalog", "schema", "volume", "folder", "subfolder"]
    if (parts.length >= 4 && parts[0] === "Volumes") {
      const catalog = parts[1];
      const schema = parts[2];
      const volumeName = parts[3];
      const pathInVolume = parts.length > 4 ? "/" + parts.slice(4).join("/") : "/";
      return { catalog, schema, volumeName, pathInVolume, fullPath: path };
    }
    return { catalog: "", schema: "", volumeName: path, pathInVolume: "", fullPath: path };
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">IDE Environments</h1>
            <p className="text-muted-foreground mt-1">
              Create and manage authoring tools backed by Databricks Apps
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Environment
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center p-12 border-2 border-dashed rounded-xl">
            <div className="text-center space-y-4">
              <Spinner className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="text-muted-foreground">Loading environments...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6 bg-red-100 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-800 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-semibold text-red-800 dark:text-red-200">
                  Failed to load environments
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && tools.length === 0 && (
          <div className="p-12 border-2 border-dashed rounded-xl text-center space-y-4">
            <div className="flex justify-center gap-4">
              <NotebookPen className="w-12 h-12 text-muted-foreground opacity-50" />
              <Code2 className="w-12 h-12 text-muted-foreground opacity-50" />
            </div>
            <div>
              <p className="text-lg font-semibold">No IDE environments yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first Marimo notebook or Code Server environment
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Environment
            </Button>
          </div>
        )}

        {/* Tools Grid */}
        {!isLoading && !error && tools.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.map((tool) => {
              const typeConfig = toolTypeConfig[tool.type];
              const TypeIcon = typeConfig.icon;
              const status = statusConfig[tool.status] || statusConfig.UNKNOWN;
              const isRunning = tool.status === "RUNNING" || tool.status === "ACTIVE";
              const isStopped = tool.status === "STOPPED";
              const isTransitioning = tool.status === "STARTING" || tool.status === "STOPPING" || tool.status === "CREATING";
              const actionInProgress = actionMutation.isPending && actionMutation.variables?.id === tool.id;
              const canOpenIframe = isRunning && tool.hasActiveDeployment && tool.appUrl;

              const ideDetailPath = `/sso-spn/${params.orgId}/ide/${tool.id}`;

              const cardContent = (
                <Card
                  key={tool.id}
                  className={`relative group ${canOpenIframe ? "hover:border-emerald-500 transition-colors" : ""}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${typeConfig.color}`}
                        >
                          <TypeIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">
                            {tool.name}
                          </CardTitle>
                          <Badge variant="outline" className="mt-1 text-xs">
                            {typeConfig.label}
                          </Badge>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.preventDefault()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {tool.appUrl && isRunning && (
                            <DropdownMenuItem asChild>
                              <a
                                href={tool.appUrl.startsWith("http") ? tool.appUrl : `https://${tool.appUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open in Browser
                              </a>
                            </DropdownMenuItem>
                          )}
                          {isStopped && (
                            <DropdownMenuItem onClick={() => openEditDialog(tool)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit Settings
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 dark:text-red-400"
                            disabled={isTransitioning}
                            onClick={() => {
                              setSelectedTool(tool);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {tool.description && (
                      <CardDescription className="line-clamp-2">
                        {tool.description}
                      </CardDescription>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className={status.color}>{status.label}</Badge>
                    </div>

                    {tool.appStatus && tool.appStatus !== tool.status && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">App Status</span>
                        <Badge variant="outline" className="text-xs">
                          {tool.appStatus}
                        </Badge>
                      </div>
                    )}

                    {/* Deployment Status */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{typeConfig.label}</span>
                      {tool.hasActiveDeployment ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="text-xs">Deployed</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="text-xs">Not Deployed</span>
                        </span>
                      )}</div>

                    {tool.volumePath && (() => {
                      const { catalog, schema, volumeName, pathInVolume } = parseVolumePath(tool.volumePath);
                      return (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Backup</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs truncate max-w-[180px] flex items-center gap-1 cursor-help">
                                <HardDrive className="h-3 w-3 flex-shrink-0" />
                                {volumeName}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Catalog:</span>
                                  <code>{catalog}</code>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Schema:</span>
                                  <code>{schema}</code>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Volume:</span>
                                  <code>{volumeName}</code>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Path:</span>
                                  <code>{pathInVolume}</code>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    })()}

                    {tool.statusMessage && tool.status === "ERROR" && (
                      <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded text-xs text-red-700 dark:text-red-300">
                        {tool.statusMessage}
                      </div>
                    )}

                    {/* Start/Stop Buttons */}
                    <div className="flex gap-2 pt-2" onClick={(e) => e.preventDefault()}>
                      {isStopped && (
                        <>
                          <Button
                            className="flex-1"
                            onClick={() => handleStartStop(tool, "start")}
                            disabled={actionInProgress || isTransitioning}
                          >
                            {actionInProgress ? (
                              <Spinner className="h-4 w-4 mr-2" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Start
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openEditDialog(tool)}
                            title="Edit settings"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {isRunning && (
                        <>
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleStartStop(tool, "stop")}
                            disabled={actionInProgress || isTransitioning}
                          >
                            {actionInProgress ? (
                              <Spinner className="h-4 w-4 mr-2" />
                            ) : (
                              <Square className="h-4 w-4 mr-2" />
                            )}
                            Stop
                          </Button>
                          {tool.appUrl && tool.hasActiveDeployment ? (
                            <>
                              <Button
                                className="flex-1"
                                onClick={() => router.push(`/sso-spn/${params.orgId}/ide/${tool.id}`)}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => openEditDialog(tool)}
                                title="Change IDE type or backup folder (creates new deployment)"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              className="flex-1"
                              variant="secondary"
                              onClick={() => setupMutation.mutate(tool.id)}
                              disabled={setupMutation.isPending && setupMutation.variables === tool.id}
                            >
                              {setupMutation.isPending && setupMutation.variables === tool.id ? (
                                <>
                                  <Spinner className="h-4 w-4 mr-2" />
                                  Setting up...
                                </>
                              ) : (
                                <>
                                  <Settings className="h-4 w-4 mr-2" />
                                  Setup
                                </>
                              )}
                            </Button>
                          )}
                        </>
                      )}
                      {isTransitioning && (
                        <Button className="flex-1" disabled>
                          <Spinner className="h-4 w-4 mr-2" />
                          {tool.status === "STARTING" ? "Starting..." : tool.status === "STOPPING" ? "Stopping..." : "Creating..."}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );

              if (canOpenIframe) {
                return (
                  <Link key={tool.id} href={ideDetailPath} className="block no-underline text-inherit">
                    {cardContent}
                  </Link>
                );
              }

              return <div key={tool.id}>{cardContent}</div>;
            })}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Create IDE Environment</DialogTitle>
              <DialogDescription>
                Create a new authoring environment backed by a Databricks App
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="type">Environment Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  {/* Marimo Notebook */}
                  <button
                    type="button"
                    onClick={() => setNewToolType("MARIMO")}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      newToolType === "MARIMO"
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <NotebookPen className="h-5 w-5" />
                      <span className="font-medium">Marimo</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Interactive Python notebooks with reactive execution
                    </p>
                  </button>

                  {/* Code Server IDE */}
                  <button
                    type="button"
                    onClick={() => setNewToolType("CODE_SERVER")}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      newToolType === "CODE_SERVER"
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Code2 className="h-5 w-5" />
                      <span className="font-medium">Code Server</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      VS Code in the browser for full development
                    </p>
                  </button>

                  {/* JupyterHub - Coming Soon */}
                  <button
                    type="button"
                    disabled
                    className="p-4 rounded-lg border-2 border-dashed border-border text-left opacity-60 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="h-5 w-5" />
                      <span className="font-medium text-sm">JupyterHub</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Multi-user Jupyter notebook environments
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      Coming Soon
                    </Badge>
                  </button>
                </div>
              </div>

              {/* GPU Accelerated Switch */}
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">GPU Accelerated</span>
                      <Badge variant="secondary" className="text-xs">
                        Coming Soon
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      T10, A10, L24, A100, H100, H200
                    </p>
                  </div>
                </div>
                <Switch disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="My Notebook Environment"
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  className={nameError ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {nameError ? (
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {nameError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Only letters, numbers, spaces, and dashes are allowed
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="A brief description of this environment"
                  value={newToolDescription}
                  onChange={(e) => setNewToolDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Backup Folder <span className="text-red-500">*</span></Label>
                {newToolVolumePath ? (() => {
                  const { catalog, schema, volumeName, pathInVolume } = parseVolumePath(newToolVolumePath);
                  return (
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                      <HardDrive className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <code className="text-sm font-mono flex-1 truncate cursor-help">
                            {volumeName}
                          </code>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-md">
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Catalog:</span>
                              <code>{catalog}</code>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Schema:</span>
                              <code>{schema}</code>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Volume:</span>
                              <code>{volumeName}</code>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Path:</span>
                              <code>{pathInVolume}</code>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCreateFolderPickerOpen(true)}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setNewToolVolumePath("")}
                      >
                        Clear
                      </Button>
                    </div>
                  );
                })() : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setCreateFolderPickerOpen(true)}
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Browse volumes and folders...
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Select a folder where environment files will be backed up
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newToolName.trim() || !!nameError || !newToolVolumePath || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2" />
                    Creating...
                  </>
                ) : (
                  "Create Environment"
                )}
              </Button>
            </DialogFooter>
            {createMutation.isError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-sm text-red-700 dark:text-red-300">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Failed to create environment"}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {selectedTool?.status === "RUNNING" || selectedTool?.status === "ACTIVE"
                  ? "Redeploy Environment"
                  : "Edit Environment Settings"}
              </DialogTitle>
              <DialogDescription>
                {selectedTool?.status === "RUNNING" || selectedTool?.status === "ACTIVE"
                  ? `Change the IDE type or backup folder for "${selectedTool?.name}". This will create a new snapshot deployment.`
                  : `Update settings for "${selectedTool?.name}".`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Environment Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  {/* Marimo Notebook */}
                  <button
                    type="button"
                    onClick={() => setEditToolType("MARIMO")}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      editToolType === "MARIMO"
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <NotebookPen className="h-5 w-5" />
                      <span className="font-medium">Marimo</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Interactive Python notebooks with reactive execution
                    </p>
                  </button>

                  {/* Code Server IDE */}
                  <button
                    type="button"
                    onClick={() => setEditToolType("CODE_SERVER")}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      editToolType === "CODE_SERVER"
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Code2 className="h-5 w-5" />
                      <span className="font-medium">Code Server</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      VS Code in the browser for full development
                    </p>
                  </button>

                  {/* JupyterHub - Coming Soon */}
                  <button
                    type="button"
                    disabled
                    className="p-4 rounded-lg border-2 border-dashed border-border text-left opacity-60 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="h-5 w-5" />
                      <span className="font-medium text-sm">JupyterHub</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Multi-user Jupyter notebook environments
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      Coming Soon
                    </Badge>
                  </button>
                </div>
              </div>

              {/* GPU Accelerated Switch */}
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">GPU Accelerated</span>
                      <Badge variant="secondary" className="text-xs">
                        Coming Soon
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      T10, A10, L24, A100, H100, H200
                    </p>
                  </div>
                </div>
                <Switch disabled />
              </div>

              <div className="space-y-2">
                <Label>Backup Folder</Label>
                {editToolVolumePath ? (() => {
                  const { catalog, schema, volumeName, pathInVolume } = parseVolumePath(editToolVolumePath);
                  return (
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                      <HardDrive className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <code className="text-sm font-mono flex-1 truncate cursor-help">
                            {volumeName}
                          </code>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-md">
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Catalog:</span>
                              <code>{catalog}</code>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Schema:</span>
                              <code>{schema}</code>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Volume:</span>
                              <code>{volumeName}</code>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Path:</span>
                              <code>{pathInVolume}</code>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditFolderPickerOpen(true)}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditToolVolumePath("")}
                      >
                        Clear
                      </Button>
                    </div>
                  );
                })() : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setEditFolderPickerOpen(true)}
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Browse volumes and folders...
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Files will be backed up to the selected folder
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleEdit}
                disabled={
                  editMutation.isPending ||
                  redeployMutation.isPending ||
                  ((selectedTool?.status === "RUNNING" || selectedTool?.status === "ACTIVE") && !editToolVolumePath)
                }
              >
                {editMutation.isPending || redeployMutation.isPending ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2" />
                    {selectedTool?.status === "RUNNING" || selectedTool?.status === "ACTIVE"
                      ? "Redeploying..."
                      : "Saving..."}
                  </>
                ) : selectedTool?.status === "RUNNING" || selectedTool?.status === "ACTIVE" ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Redeploy
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
            {(editMutation.isError || redeployMutation.isError) && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-sm text-red-700 dark:text-red-300">
                {editMutation.error instanceof Error
                  ? editMutation.error.message
                  : redeployMutation.error instanceof Error
                  ? redeployMutation.error.message
                  : "Failed to update environment"}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Environment</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{selectedTool?.name}&quot;? This
                will also delete the associated Databricks App. This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </Button>
            </DialogFooter>
            {deleteMutation.isError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-sm text-red-700 dark:text-red-300">
                {deleteMutation.error instanceof Error
                  ? deleteMutation.error.message
                  : "Failed to delete environment"}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Volume Folder Picker for Create Dialog */}
        <VolumeFolderPicker
          open={createFolderPickerOpen}
          onOpenChange={setCreateFolderPickerOpen}
          onSelect={setNewToolVolumePath}
          currentPath={newToolVolumePath}
          title="Select Backup Folder"
          description="Browse and select a folder in Unity Catalog volumes for file backup"
        />

        {/* Volume Folder Picker for Edit Dialog */}
        <VolumeFolderPicker
          open={editFolderPickerOpen}
          onOpenChange={setEditFolderPickerOpen}
          onSelect={setEditToolVolumePath}
          currentPath={editToolVolumePath}
          title="Select Backup Folder"
          description="Browse and select a folder in Unity Catalog volumes for file backup"
        />
      </div>
    </div>
  );
}

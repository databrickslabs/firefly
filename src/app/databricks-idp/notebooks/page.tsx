"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FileTree } from "@/components/sql-editor/file-tree";
import { CollapsibleSidebar } from "@/components/sql-editor/collapsible-sidebar";
import { CatalogTreeView } from "@/components/unity-catalog/catalog-tree-view";
import { ClusterSelector } from "@/components/notebook/cluster-selector";
import { NotebookEditor } from "@/components/notebook/notebook-editor";
import type { Notebook } from "@/lib/notebook-manager";
import {
  createEmptyNotebook,
  parseNotebookFile,
  notebookToJson,
} from "@/lib/notebook-manager";
import { MONACO_ROOT_PATH } from "@/lib/workspace-file-manager";
import { Button } from "@/components/ui/button";
import { Loader2, FileJson, AlertCircle } from "lucide-react";
import {
  loadClusterContext,
  saveClusterContext,
} from "@/lib/cluster-storage";
import { useCreateContext, useContextStatus } from "@/hooks/use-notebook-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NotebookPage() {
  const queryClient = useQueryClient();
  const sidebarPanelRef = React.useRef<React.ElementRef<typeof Panel>>(null);

  const [clusterId, setClusterId] = React.useState<string>("");
  const [contextId, setContextId] = React.useState<string | null>(null);
  const [language, setLanguage] = React.useState<string>("python");
  const [notebook, setNotebook] = React.useState<Notebook>(createEmptyNotebook());
  const [currentFilePath, setCurrentFilePath] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = React.useState(false);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = React.useState(false);
  const [notebookName, setNotebookName] = React.useState("");

  // Load persisted cluster selection on mount
  React.useEffect(() => {
    const stored = loadClusterContext();
    if (stored) {
      setClusterId(stored.clusterId);
      setContextId(stored.contextId);
      setLanguage(stored.language);
    }
  }, []);

  // Create context mutation
  const createContextMutation = useCreateContext();

  // Monitor context status with periodic health checks (every 5 seconds)
  const { data: contextStatus } = useContextStatus(clusterId, contextId, {
    enabled: Boolean(clusterId && contextId),
    refetchInterval: 5000,
  });

  // Auto-create context when cluster changes (and no context exists)
  React.useEffect(() => {
    if (clusterId && !contextId && !createContextMutation.isPending) {
      createContextMutation.mutate(
        { clusterId, language },
        {
          onSuccess: (data) => {
            setContextId(data.id);
            // Context is saved to localStorage in the hook
          },
          onError: (err) => {
            setError(`Failed to create execution context: ${err.message}`);
          },
        }
      );
    }
  }, [clusterId, contextId, language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle dead or unhealthy contexts - recreate if needed
  React.useEffect(() => {
    if (
      contextStatus &&
      !contextStatus.healthy &&
      clusterId &&
      contextId &&
      !createContextMutation.isPending &&
      contextStatus.clusterState === "RUNNING"
    ) {
      // Cluster is running but context is unhealthy - recreate context
      console.log("Context unhealthy, recreating...", contextStatus.reason);
      setContextId(null); // This will trigger context recreation
    }
  }, [contextStatus, clusterId, contextId, createContextMutation.isPending]);

  // Handle cluster selection change
  const handleClusterChange = (newClusterId: string) => {
    setClusterId(newClusterId);
    setContextId(null); // Reset context when cluster changes
    setError(null);

    // Save to localStorage (without context yet)
    saveClusterContext({
      clusterId: newClusterId,
      contextId: null,
      language,
      timestamp: Date.now(),
    });
  };

  // Handle context change (e.g., from kernel restart)
  const handleContextChange = (newContextId: string | null) => {
    setContextId(newContextId);

    // Update localStorage
    if (clusterId) {
      saveClusterContext({
        clusterId,
        contextId: newContextId,
        language,
        timestamp: Date.now(),
      });
    }
  };

  // Save notebook mutation
  const saveNotebookMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const response = await fetch("/api/databricks/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          content,
          format: "JUPYTER", // Save as Jupyter notebook format
          overwrite: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save notebook");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      // Update currentFilePath if this was a "Save As"
      setCurrentFilePath(variables.path);
      setSaveAsDialogOpen(false);
      setNotebookName("");
    },
    onError: (err: Error) => {
      setError(`Failed to save notebook: ${err.message}`);
    },
  });

  const handleFileSelect = async (filePath: string) => {
    // Only load .ipynb files
    if (!filePath.endsWith(".ipynb")) {
      setError("Please select a .ipynb notebook file");
      return;
    }

    setIsLoadingFile(true);
    setError(null);

    try {
      console.log("Loading notebook from:", filePath);
      const response = await fetch(
        `/api/databricks/workspace/export?path=${encodeURIComponent(filePath)}&format=JUPYTER`
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Export API error:", errorText);
        throw new Error(`Failed to fetch notebook file: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Export API response:", data);

      if (!data.content) {
        throw new Error("No content returned from export API");
      }

      const notebookData = parseNotebookFile(data.content);
      console.log("Parsed notebook:", notebookData);

      setNotebook(notebookData);
      setCurrentFilePath(filePath);

      // Set language from notebook metadata
      if (notebookData.metadata.language_info?.name) {
        setLanguage(notebookData.metadata.language_info.name);
      }
    } catch (err) {
      console.error("Failed to load notebook:", err);
      setError(`Failed to load notebook: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleSave = () => {
    if (!currentFilePath) {
      // Show "Save As" dialog for untitled notebooks
      setSaveAsDialogOpen(true);
      return;
    }

    // Save to existing path
    const notebookJson = notebookToJson(notebook);
    saveNotebookMutation.mutate({
      path: currentFilePath,
      content: notebookJson,
    });
  };

  const handleSaveAs = () => {
    if (!notebookName.trim()) {
      setError("Please enter a valid notebook name");
      return;
    }

    // Ensure .ipynb extension
    let fileName = notebookName.trim();
    if (!fileName.endsWith(".ipynb")) {
      fileName += ".ipynb";
    }

    // Prepend MONACO_ROOT_PATH
    const fullPath = `${MONACO_ROOT_PATH}/${fileName}`;

    const notebookJson = notebookToJson(notebook);
    saveNotebookMutation.mutate({
      path: fullPath,
      content: notebookJson,
    });
  };

  const handleNewNotebook = () => {
    setNotebook(createEmptyNotebook());
    setCurrentFilePath(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Main Layout with Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Panel - Collapsible Sidebar */}
          <Panel
            ref={sidebarPanelRef}
            defaultSize={20}
            minSize={15}
            maxSize={40}
            collapsible={true}
            collapsedSize={5}
          >
            <CollapsibleSidebar
              panelRef={sidebarPanelRef}
              filesContent={
                <FileTree
                  onFileSelect={handleFileSelect}
                  selectedFilePath={currentFilePath}
                />
              }
              catalogContent={<CatalogTreeView showColumns={true} />}
            />
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />

          {/* Right Panel - Notebook Editor */}
          <Panel>
            <div className="h-full flex flex-col">
              {/* Top Toolbar */}
              <div className="px-4 py-2 border-b flex items-center gap-4 bg-background">
                <div className="flex items-center gap-2">
                  <ClusterSelector
                    value={clusterId}
                    onValueChange={handleClusterChange}
                  />

                  {/* Context Status Indicator */}
                  {clusterId && (
                    <div className="relative group">
                      {contextId && contextStatus ? (
                        <div
                          className={`w-3 h-3 rounded-full ${
                            contextStatus.healthy
                              ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                              : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                          } cursor-help`}
                          title={contextId}
                        />
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.6)]"
                          title="Creating context..."
                        />
                      )}

                      {/* Tooltip */}
                      <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 whitespace-nowrap">
                        <div className="bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-md border text-sm">
                          {contextId ? (
                            <>
                              <div className="font-semibold">
                                {contextStatus?.healthy ? "Context Ready" : "Context Unhealthy"}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Context ID: {contextId}
                              </div>
                              {contextStatus?.reason && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {contextStatus.reason}
                                </div>
                              )}
                            </>
                          ) : (
                            <div>Creating execution context...</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="sql">SQL</SelectItem>
                    <SelectItem value="scala">Scala</SelectItem>
                    <SelectItem value="r">R</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex-1" />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewNotebook}
                  className="gap-2"
                >
                  <FileJson className="h-4 w-4" />
                  New Notebook
                </Button>

                <div className="text-sm text-muted-foreground">
                  {currentFilePath
                    ? currentFilePath.startsWith(MONACO_ROOT_PATH)
                      ? currentFilePath.slice(MONACO_ROOT_PATH.length + 1)
                      : currentFilePath.split("/").pop()
                    : "Untitled Notebook"}
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
                </div>
              )}

              {/* Loading State */}
              {isLoadingFile ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading notebook...</p>
                  </div>
                </div>
              ) : (
                /* Custom Notebook Editor */
                <div className="flex-1 overflow-hidden">
                  <NotebookEditor
                    notebook={notebook}
                    clusterId={clusterId || null}
                    contextId={contextId}
                    contextStatus={contextStatus}
                    language={language}
                    onNotebookChange={setNotebook}
                    onContextChange={handleContextChange}
                    onSave={handleSave}
                    isSaving={saveNotebookMutation.isPending}
                    readOnly={false}
                  />
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Save As Dialog */}
      <Dialog open={saveAsDialogOpen} onOpenChange={setSaveAsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Notebook As</DialogTitle>
            <DialogDescription>
              Enter a name for your notebook. It will be saved in your workspace folder. The .ipynb extension will be added automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="notebook-name">Notebook Name</Label>
              <Input
                id="notebook-name"
                placeholder="my-notebook"
                value={notebookName}
                onChange={(e) => setNotebookName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveAs();
                  }
                }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Will be saved as: {notebookName || "notebook-name"}.ipynb
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAs} disabled={saveNotebookMutation.isPending}>
              {saveNotebookMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

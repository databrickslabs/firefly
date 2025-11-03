"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FileTree } from "@/components/sql-editor/file-tree";
import { CollapsibleSidebar } from "@/components/sql-editor/collapsible-sidebar";
import { CatalogTreeView } from "@/components/unity-catalog/catalog-tree-view";
import { NotebookEditor } from "@/components/notebook/notebook-editor";
import { NotebookTabs, type NotebookTab } from "@/components/notebook/notebook-tabs";
import { SharedNotebooksTree } from "@/components/notebook/shared-notebooks-tree";
import type { Notebook } from "@/lib/notebook-manager";
import {
  createEmptyNotebook,
  parseNotebookFile,
  notebookToJson,
} from "@/lib/notebook-manager";
import { useMonacoRootPath } from "@/providers/user-store-provider";
import { Button } from "@/components/ui/button";
import { FileJson } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import {
  loadClusterContext,
  saveClusterContext,
} from "@/lib/cluster-storage";
import { useCreateContext, useContextStatus } from "@/hooks/use-notebook-context";
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

interface NotebookState {
  id: string;
  notebook: Notebook;
  filePath: string | null;
  isDirty: boolean;
  permissionLevel?: string; // CAN_READ or CAN_EDIT, undefined for owned notebooks
}

export default function NotebookPage() {
  const queryClient = useQueryClient();
  const sidebarPanelRef = React.useRef<React.ElementRef<typeof Panel>>(null);

  // Get Monaco root path from Zustand store (always available, no loading state)
  const monacoRootPath = useMonacoRootPath();

  const [clusterId, setClusterId] = React.useState<string>("");
  const [contextId, setContextId] = React.useState<string | null>(null);
  const [language, setLanguage] = React.useState<string>("python");
  const [isSidebarExpanded, setIsSidebarExpanded] = React.useState(true);

  // Tab management - start with no notebooks
  const [notebookStates, setNotebookStates] = React.useState<NotebookState[]>([]);
  const [activeTabId, setActiveTabId] = React.useState<string>("");

  const [isLoadingFile, setIsLoadingFile] = React.useState(false);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = React.useState(false);
  const [notebookName, setNotebookName] = React.useState("");

  // Get active notebook
  const activeNotebookState = notebookStates.find((ns) => ns.id === activeTabId);
  const notebook = activeNotebookState?.notebook || createEmptyNotebook();
  const currentFilePath = activeNotebookState?.filePath || null;

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
            toast.error(`Failed to create execution context: ${err.message}`);
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
      // Update the notebook state with the new path
      setNotebookStates((prev) =>
        prev.map((ns) =>
          ns.id === activeTabId ? { ...ns, filePath: variables.path, isDirty: false } : ns
        )
      );
      setSaveAsDialogOpen(false);
      setNotebookName("");
    },
    onError: (err: Error) => {
      toast.error(`Failed to save notebook: ${err.message}`);
    },
  });

  const handleFileSelect = async (filePath: string, permissionLevel?: string) => {
    // Only load .ipynb files
    if (!filePath.endsWith(".ipynb")) {
      toast.error("Please select a .ipynb notebook file");
      return;
    }

    // Check if already open
    const existingTab = notebookStates.find((ns) => ns.filePath === filePath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    setIsLoadingFile(true);

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

      // Create new tab for this notebook
      const newTabId = `notebook-${Date.now()}`;
      setNotebookStates((prev) => [
        ...prev,
        {
          id: newTabId,
          notebook: notebookData,
          filePath,
          isDirty: false,
          permissionLevel, // Store permission level for shared notebooks
        },
      ]);
      setActiveTabId(newTabId);

      // Set language from notebook metadata
      if (notebookData.metadata.language_info?.name) {
        setLanguage(notebookData.metadata.language_info.name);
      }
    } catch (err) {
      console.error("Failed to load notebook:", err);
      toast.error(`Failed to load notebook: ${err instanceof Error ? err.message : String(err)}`);
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
      toast.error("Please enter a valid notebook name");
      return;
    }

    // Ensure .ipynb extension
    let fileName = notebookName.trim();
    if (!fileName.endsWith(".ipynb")) {
      fileName += ".ipynb";
    }

    // Prepend monacoRootPath
    const fullPath = `${monacoRootPath}/${fileName}`;

    const notebookJson = notebookToJson(notebook);
    saveNotebookMutation.mutate({
      path: fullPath,
      content: notebookJson,
    });
  };

  const handleNewNotebook = React.useCallback(() => {
    const newTabId = `untitled-${Date.now()}`;
    setNotebookStates((prev) => [
      ...prev,
      {
        id: newTabId,
        notebook: createEmptyNotebook(),
        filePath: null,
        isDirty: false,
      },
    ]);
    setActiveTabId(newTabId);
  }, []);

  // Sidebar expanded change handler
  const handleSidebarExpandedChange = React.useCallback((isExpanded: boolean) => {
    setIsSidebarExpanded(isExpanded);
  }, []);

  // Tab handlers - wrapped in useCallback to prevent re-renders
  const handleTabClick = React.useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const handleTabClose = React.useCallback((tabId: string) => {
    setNotebookStates((prev) => {
      const filtered = prev.filter((ns) => ns.id !== tabId);

      // Switch to another tab if closing active tab
      if (tabId === activeTabId) {
        if (filtered.length > 0) {
          setActiveTabId(filtered[0].id);
        } else {
          setActiveTabId("");
        }
      }

      return filtered;
    });
  }, [activeTabId]);

  // Update active notebook when it changes
  const handleNotebookChange = (updatedNotebook: Notebook) => {
    setNotebookStates((prev) =>
      prev.map((ns) =>
        ns.id === activeTabId
          ? { ...ns, notebook: updatedNotebook, isDirty: true }
          : ns
      )
    );
  };

  // Convert notebook states to tabs
  const tabs: NotebookTab[] = notebookStates.map((ns) => {
    const name = ns.filePath
      ? ns.filePath.startsWith(monacoRootPath)
        ? ns.filePath.slice(monacoRootPath.length + 1)
        : ns.filePath.split("/").pop() || "Untitled"
      : "Untitled";

    return {
      id: ns.id,
      path: ns.filePath,
      name,
      isDirty: ns.isDirty,
      isReadOnly: ns.permissionLevel === "CAN_READ",
    };
  });

  return (
    <div className="h-full flex flex-col">
      {/* Main Layout with Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Panel - Collapsible Sidebar */}
          <Panel
            ref={sidebarPanelRef}
            defaultSize={20}
            minSize={4}
            maxSize={40}
            collapsible={true}
            collapsedSize={4}
          >
            <CollapsibleSidebar
              panelRef={sidebarPanelRef}
              onExpandedChange={handleSidebarExpandedChange}
              filesContent={
                <FileTree
                  onFileSelect={handleFileSelect}
                  selectedFilePath={currentFilePath}
                />
              }
              catalogContent={<CatalogTreeView showColumns={true} />}
              sharedContent={<SharedNotebooksTree onNotebookClick={handleFileSelect} selectedFilePath={currentFilePath} />}
            />
          </Panel>
          {isSidebarExpanded && (
            <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />
          )}

          {/* Right Panel - Notebook Editor */}
          <Panel>
            <div className="h-full flex flex-col">
              {/* Notebook Tabs */}
              <NotebookTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onTabClick={handleTabClick}
                onTabClose={handleTabClose}
                onNewTab={handleNewNotebook}
              />

              {/* Loading State */}
              {isLoadingFile ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <Spinner className="h-8 w-8 text-purple-600" />
                    <p className="text-sm text-muted-foreground">Loading notebook...</p>
                  </div>
                </div>
              ) : notebookStates.length === 0 ? (
                /* Empty State */
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <FileJson className="h-16 w-16 text-muted-foreground/50" />
                    <div>
                      <h3 className="text-lg font-semibold">No Notebooks Open</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Create a new notebook or open one from the file tree
                      </p>
                    </div>
                    <Button onClick={handleNewNotebook} className="gap-2">
                      <FileJson className="h-4 w-4" />
                      New Notebook
                    </Button>
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
                    onNotebookChange={handleNotebookChange}
                    onContextChange={handleContextChange}
                    onSave={handleSave}
                    isSaving={saveNotebookMutation.isPending}
                    readOnly={activeNotebookState?.permissionLevel === "CAN_READ"}
                    onClusterChange={handleClusterChange}
                    onLanguageChange={setLanguage}
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
                  <Spinner className="h-4 w-4 text-purple-600 mr-2" />
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

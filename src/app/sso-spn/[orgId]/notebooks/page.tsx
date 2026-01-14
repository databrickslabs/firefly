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
import { SqlFileEditor } from "@/components/workbench/sql-file-editor";
import type { Notebook } from "@/lib/notebook-manager";
import type { OpenFile } from "@/lib/workspace-file-manager";
import {
  createEmptyNotebook,
  parseNotebookFile,
  notebookToJson,
} from "@/lib/notebook-manager";
import { useMonacoRootPath, useActiveOrganizationId } from "@/providers/user-store-provider";
import { useWorkspaceTabs } from "@/hooks/use-workspace-tabs";
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

interface SqlFileState {
  id: string;
  file: OpenFile;
  filePath: string;
  isDirty: boolean;
}

type WorkbenchTabState =
  | ({ type: "notebook" } & NotebookState)
  | ({ type: "sql" } & SqlFileState);

export default function NotebookPage() {
  const queryClient = useQueryClient();
  const sidebarPanelRef = React.useRef<React.ElementRef<typeof Panel>>(null);

  // Get Monaco root path and orgId from Zustand store (always available, no loading state)
  const monacoRootPath = useMonacoRootPath();
  const orgId = useActiveOrganizationId();

  // Use workspace tabs hook for persistence (read-only on mount)
  const workspaceTabs = useWorkspaceTabs({ orgId, workspace: "notebooks" });

  const [clusterId, setClusterId] = React.useState<string>("");
  const [contextId, setContextId] = React.useState<string | null>(null);
  const [language, setLanguage] = React.useState<string>("python");
  const [isSidebarExpanded, setIsSidebarExpanded] = React.useState(true);

  // Tab management - start with no files
  const [tabStates, setTabStates] = React.useState<WorkbenchTabState[]>([]);
  const [activeTabId, setActiveTabId] = React.useState<string>("");

  const [isLoadingFile, setIsLoadingFile] = React.useState(false);
  const [isRestoringFromStorage, setIsRestoringFromStorage] = React.useState(true);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = React.useState(false);
  const [notebookName, setNotebookName] = React.useState("");

  // Get active tab
  const activeTab = tabStates.find((tab) => tab.id === activeTabId);
  const currentFilePath = activeTab?.filePath || null;

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

  // Load notebooks from storage on mount (only once)
  const hasLoadedFromStorageRef = React.useRef(false);

  React.useEffect(() => {
    // Wait for the hook to finish loading from localStorage first
    if (!workspaceTabs.hasLoaded) {
      return;
    }

    // Only load once, after the hook has loaded data
    if (hasLoadedFromStorageRef.current) {
      return;
    }

    const storedPaths = workspaceTabs.openedPaths;
    const storedActive = workspaceTabs.activePath;

    if (storedPaths.length === 0) {
      // No notebooks to restore
      setIsRestoringFromStorage(false);
      return;
    }

    // Mark as loading to prevent duplicate loads
    hasLoadedFromStorageRef.current = true;

    const loadFilesFromStorage = async () => {
      const loadedStates: WorkbenchTabState[] = [];

      for (const filePath of storedPaths) {
        try {
          if (filePath.endsWith(".sql")) {
            // Load SQL file
            const response = await fetch(
              `/api/databricks/workspace/export?path=${encodeURIComponent(filePath)}`
            );

            if (response.ok) {
              const data = await response.json();
              loadedStates.push({
                type: "sql",
                id: `sql-${Date.now()}-${Math.random()}`,
                file: {
                  path: filePath,
                  name: filePath.split("/").pop() || "",
                  content: data.content || "",
                  isDirty: false,
                  language: "sql",
                },
                filePath,
                isDirty: false,
              });
            }
          } else if (filePath.endsWith(".ipynb")) {
            // Load notebook file
            const response = await fetch(
              `/api/databricks/workspace/export?path=${encodeURIComponent(filePath)}&format=JUPYTER`
            );

            if (response.ok) {
              const data = await response.json();
              if (data.content) {
                const notebookData = parseNotebookFile(data.content);
                loadedStates.push({
                  type: "notebook",
                  id: `notebook-${Date.now()}-${Math.random()}`,
                  notebook: notebookData,
                  filePath,
                  isDirty: false,
                });
              }
            }
          }
        } catch (err) {
          console.error(`Failed to load file from storage: ${filePath}`, err);
        }
      }

      if (loadedStates.length > 0) {
        setTabStates(loadedStates);
        // Set active tab from storage
        const activeState = loadedStates.find(tab => tab.filePath === storedActive);
        setActiveTabId(activeState?.id || loadedStates[0].id);

        // Wait for next tick to ensure state has updated before hiding loader
        setTimeout(() => {
          setIsRestoringFromStorage(false);
        }, 0);
      } else {
        // No files were loaded
        setIsRestoringFromStorage(false);
      }
    };

    loadFilesFromStorage();
  }, [workspaceTabs.hasLoaded, workspaceTabs.openedPaths, workspaceTabs.activePath]); // Wait for hook to load data

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
      setTabStates((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId && tab.type === "notebook"
            ? { ...tab, filePath: variables.path, isDirty: false }
            : tab
        )
      );
      setSaveAsDialogOpen(false);
      setNotebookName("");
    },
    onError: (err: Error) => {
      toast.error(`Failed to save notebook: ${err.message}`);
    },
  });

  // Save SQL file mutation
  const saveSqlFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const response = await fetch("/api/databricks/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          content,
          format: "AUTO",
          isNotebook: false,
          overwrite: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save SQL file");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      // Mark file as not dirty
      setTabStates((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId && tab.type === "sql"
            ? { ...tab, file: { ...tab.file, isDirty: false }, isDirty: false }
            : tab
        )
      );
    },
    onError: (err: Error) => {
      toast.error(`Failed to save SQL file: ${err.message}`);
    },
  });

  const handleFileSelect = async (filePath: string, permissionLevel?: string) => {
    // Support both .ipynb and .sql files
    if (!filePath.endsWith(".ipynb") && !filePath.endsWith(".sql")) {
      toast.error("Please select a .ipynb notebook or .sql file");
      return;
    }

    // Check if already open
    const existingTab = tabStates.find((tab) => tab.filePath === filePath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    setIsLoadingFile(true);

    try {
      if (filePath.endsWith(".sql")) {
        // Load SQL file
        console.log("Loading SQL file from:", filePath);
        const response = await fetch(
          `/api/databricks/workspace/export?path=${encodeURIComponent(filePath)}`
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Export API error:", errorText);
          throw new Error(`Failed to fetch SQL file: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Create new tab for this SQL file
        const newTabId = `sql-${Date.now()}`;
        const newState: WorkbenchTabState = {
          type: "sql",
          id: newTabId,
          file: {
            path: filePath,
            name: filePath.split("/").pop() || "",
            content: data.content || "",
            isDirty: false,
            language: "sql",
          },
          filePath,
          isDirty: false,
        };

        setTabStates((prev) => {
          const updated = [...prev, newState];

          // Save to localStorage immediately
          const paths = updated.map(tab => tab.filePath).filter((p): p is string => p !== null);
          workspaceTabs.setAllTabs(paths, filePath);

          return updated;
        });
        setActiveTabId(newTabId);
      } else {
        // Load notebook file
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
        const newState: WorkbenchTabState = {
          type: "notebook",
          id: newTabId,
          notebook: notebookData,
          filePath,
          isDirty: false,
          permissionLevel, // Store permission level for shared notebooks
        };

        setTabStates((prev) => {
          const updated = [...prev, newState];

          // Save to localStorage immediately
          const paths = updated.map(tab => tab.filePath).filter((p): p is string => p !== null);
          workspaceTabs.setAllTabs(paths, filePath);

          return updated;
        });
        setActiveTabId(newTabId);

        // Set language from notebook metadata
        if (notebookData.metadata.language_info?.name) {
          setLanguage(notebookData.metadata.language_info.name);
        }
      }
    } catch (err) {
      console.error("Failed to load file:", err);
      toast.error(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleSave = () => {
    if (!activeTab) return;

    if (activeTab.type === "sql") {
      // Save SQL file
      saveSqlFileMutation.mutate({
        path: activeTab.filePath,
        content: activeTab.file.content,
      });
    } else if (activeTab.type === "notebook") {
      if (!currentFilePath) {
        // Show "Save As" dialog for untitled notebooks
        setSaveAsDialogOpen(true);
        return;
      }

      // Save to existing path
      const notebookJson = notebookToJson(activeTab.notebook);
      saveNotebookMutation.mutate({
        path: currentFilePath,
        content: notebookJson,
      });
    }
  };

  const handleSaveAs = () => {
    if (!activeTab || activeTab.type !== "notebook") return;

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

    const notebookJson = notebookToJson(activeTab.notebook);
    saveNotebookMutation.mutate({
      path: fullPath,
      content: notebookJson,
    });
  };

  const handleNewNotebook = React.useCallback(() => {
    const newTabId = `untitled-${Date.now()}`;
    setTabStates((prev) => [
      ...prev,
      {
        type: "notebook",
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

    // Update active tab in storage
    const tab = tabStates.find(t => t.id === tabId);
    if (tab?.filePath) {
      workspaceTabs.setActiveTab(tab.filePath);
    }
  }, [tabStates, workspaceTabs]);

  const handleTabClose = React.useCallback((tabId: string) => {
    setTabStates((prev) => {
      const filtered = prev.filter((tab) => tab.id !== tabId);

      // Save to localStorage immediately
      const paths = filtered.map(tab => tab.filePath).filter((p): p is string => p !== null);
      const newActive = filtered.length > 0 ? filtered[0].filePath || "" : "";
      workspaceTabs.setAllTabs(paths, newActive);

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
  }, [activeTabId, workspaceTabs]);

  // Update active notebook when it changes
  const handleNotebookChange = (updatedNotebook: Notebook) => {
    setTabStates((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId && tab.type === "notebook"
          ? { ...tab, notebook: updatedNotebook, isDirty: true }
          : tab
      )
    );
  };

  // Update SQL file content when it changes
  const handleSqlContentChange = (content: string) => {
    setTabStates((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId && tab.type === "sql"
          ? { ...tab, file: { ...tab.file, content, isDirty: true }, isDirty: true }
          : tab
      )
    );
  };

  // Convert tab states to tabs for the UI
  const tabs: NotebookTab[] = tabStates.map((tab) => {
    const name = tab.filePath
      ? tab.filePath.startsWith(monacoRootPath)
        ? tab.filePath.slice(monacoRootPath.length + 1)
        : tab.filePath.split("/").pop() || "Untitled"
      : "Untitled";

    return {
      id: tab.id,
      path: tab.filePath,
      name,
      isDirty: tab.isDirty,
      isReadOnly: tab.type === "notebook" && tab.permissionLevel === "CAN_READ",
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
              {isLoadingFile || isRestoringFromStorage ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <Spinner className="h-8 w-8 text-emerald-600" />
                    <p className="text-sm text-muted-foreground">
                      {isRestoringFromStorage ? "Restoring session..." : "Loading file..."}
                    </p>
                  </div>
                </div>
              ) : tabStates.length === 0 ? (
                /* Empty State */
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <FileJson className="h-16 w-16 text-muted-foreground/50" />
                    <div>
                      <h3 className="text-lg font-semibold">No Files Open</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Create a new notebook or open a file from the file tree
                      </p>
                    </div>
                    <Button onClick={handleNewNotebook} className="gap-2">
                      <FileJson className="h-4 w-4" />
                      New Notebook
                    </Button>
                  </div>
                </div>
              ) : (
                /* Render appropriate editor based on file type */
                <div className="flex-1 overflow-hidden">
                  {activeTab?.type === "sql" ? (
                    <SqlFileEditor
                      file={activeTab.file}
                      onContentChange={handleSqlContentChange}
                      onSave={handleSave}
                      isSaving={saveSqlFileMutation.isPending}
                    />
                  ) : activeTab?.type === "notebook" ? (
                    <NotebookEditor
                      notebook={activeTab.notebook}
                      clusterId={clusterId || null}
                      contextId={contextId}
                      contextStatus={contextStatus}
                      language={language}
                      onNotebookChange={handleNotebookChange}
                      onContextChange={handleContextChange}
                      onSave={handleSave}
                      isSaving={saveNotebookMutation.isPending}
                      readOnly={activeTab.permissionLevel === "CAN_READ"}
                      onClusterChange={handleClusterChange}
                      onLanguageChange={setLanguage}
                    />
                  ) : null}
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
                  <Spinner className="h-4 w-4 text-emerald-600 mr-2" />
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

import { useState, useEffect, useCallback } from "react";

/**
 * Storage interface for workspace tabs
 */
interface WorkspaceTabsState {
  openedPaths: string[];
  activePath: string;
  timestamp: number;
}

/**
 * Hook options
 */
interface UseWorkspaceTabsOptions {
  orgId: string;
  workspace: "notebooks" | "sql";
}

/**
 * Custom hook to manage opened files/notebooks tabs with localStorage persistence
 *
 * @param options - Configuration options including orgId and workspace type
 * @returns Object with opened paths, active path, and update functions
 */
export function useWorkspaceTabs({ orgId, workspace }: UseWorkspaceTabsOptions) {
  const storageKey = `workspace-tabs:${orgId}:${workspace}`;

  // Initialize state from localStorage
  const [openedPaths, setOpenedPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string>("");
  const [hasLoaded, setHasLoaded] = useState(false);

  /**
   * Load state from localStorage on mount
   */
  useEffect(() => {
    const loadFromStorage = () => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed: WorkspaceTabsState = JSON.parse(stored);
          setOpenedPaths(parsed.openedPaths || []);
          setActivePath(parsed.activePath || "");
        }
      } catch (error) {
        console.error(`Failed to load ${workspace} tabs from localStorage:`, error);
      } finally {
        // Mark as loaded even if there was no data or an error
        setHasLoaded(true);
      }
    };

    loadFromStorage();
  }, [storageKey, workspace]);

  /**
   * Save state to localStorage whenever it changes (but only after initial load)
   */
  useEffect(() => {
    // Don't save until we've loaded from storage first
    if (!hasLoaded) {
      return;
    }

    try {
      const state: WorkspaceTabsState = {
        openedPaths,
        activePath,
        timestamp: Date.now(),
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error(`Failed to save ${workspace} tabs to localStorage:`, error);
    }
  }, [openedPaths, activePath, storageKey, workspace, hasLoaded]);

  /**
   * Add a new tab/file to opened paths
   */
  const openTab = useCallback((path: string) => {
    setOpenedPaths((prev) => {
      // Don't add if already open
      if (prev.includes(path)) {
        return prev;
      }
      return [...prev, path];
    });
    // Set as active when opened
    setActivePath(path);
  }, []);

  /**
   * Close a tab/file
   */
  const closeTab = useCallback((path: string) => {
    setOpenedPaths((prev) => {
      const filtered = prev.filter((p) => p !== path);

      // If closing the active tab, switch to another tab
      setActivePath((currentActive) => {
        if (currentActive === path) {
          // Switch to the first remaining tab, or empty string if none
          return filtered.length > 0 ? filtered[0] : "";
        }
        return currentActive;
      });

      return filtered;
    });
  }, []);

  /**
   * Set the active tab/file
   */
  const setActiveTab = useCallback((path: string) => {
    setActivePath(path);
  }, []);

  /**
   * Clear all tabs
   */
  const clearAllTabs = useCallback(() => {
    setOpenedPaths([]);
    setActivePath("");
  }, []);

  /**
   * Check if a path is currently open
   */
  const isOpen = useCallback(
    (path: string) => {
      return openedPaths.includes(path);
    },
    [openedPaths]
  );

  /**
   * Replace all opened paths (useful for bulk operations)
   */
  const setAllTabs = useCallback(
    (paths: string[], active?: string) => {
      setOpenedPaths(paths);
      if (active !== undefined) {
        setActivePath(active);
      } else if (paths.length > 0 && !paths.includes(activePath)) {
        // If current active path is not in the new list, set to first path
        setActivePath(paths[0]);
      }
    },
    [activePath]
  );

  return {
    openedPaths,
    activePath,
    openTab,
    closeTab,
    setActiveTab,
    clearAllTabs,
    isOpen,
    setAllTabs,
    hasLoaded,
  };
}

/**
 * Export type for use in components
 */
export type UseWorkspaceTabsReturn = ReturnType<typeof useWorkspaceTabs>;

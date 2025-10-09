/**
 * Utility for persisting cluster selection and context information to localStorage
 */

const CLUSTER_STORAGE_KEY = "databricks-notebook-cluster";

export interface ClusterContextData {
  clusterId: string;
  contextId: string | null;
  language: string;
  timestamp: number;
}

/**
 * Save cluster and context information to localStorage
 */
export function saveClusterContext(data: ClusterContextData): void {
  try {
    localStorage.setItem(CLUSTER_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save cluster context to localStorage:", error);
  }
}

/**
 * Load cluster and context information from localStorage
 * Returns null if no data exists or if data is older than 24 hours
 */
export function loadClusterContext(): ClusterContextData | null {
  try {
    const stored = localStorage.getItem(CLUSTER_STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored) as ClusterContextData;

    // Check if data is older than 24 hours
    const hoursSinceStore = (Date.now() - data.timestamp) / (1000 * 60 * 60);
    if (hoursSinceStore > 24) {
      clearClusterContext();
      return null;
    }

    return data;
  } catch (error) {
    console.error("Failed to load cluster context from localStorage:", error);
    return null;
  }
}

/**
 * Update just the context ID for an existing cluster
 */
export function updateContextId(contextId: string): void {
  try {
    const existing = loadClusterContext();
    if (existing) {
      saveClusterContext({
        ...existing,
        contextId,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error("Failed to update context ID:", error);
  }
}

/**
 * Clear cluster context from localStorage
 */
export function clearClusterContext(): void {
  try {
    localStorage.removeItem(CLUSTER_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear cluster context:", error);
  }
}

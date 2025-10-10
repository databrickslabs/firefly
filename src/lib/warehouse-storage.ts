/**
 * Utility for persisting SQL warehouse selection to localStorage
 */

const WAREHOUSE_STORAGE_KEY = "databricks-sql-warehouse";

export interface WarehouseData {
  warehouseId: string;
  timestamp: number;
}

/**
 * Save warehouse information to localStorage
 */
export function saveWarehouse(data: WarehouseData): void {
  try {
    localStorage.setItem(WAREHOUSE_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save warehouse to localStorage:", error);
  }
}

/**
 * Load warehouse information from localStorage
 * Returns null if no data exists or if data is older than 24 hours
 */
export function loadWarehouse(): WarehouseData | null {
  try {
    const stored = localStorage.getItem(WAREHOUSE_STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored) as WarehouseData;

    // Check if data is older than 24 hours
    const hoursSinceStore = (Date.now() - data.timestamp) / (1000 * 60 * 60);
    if (hoursSinceStore > 24) {
      clearWarehouse();
      return null;
    }

    return data;
  } catch (error) {
    console.error("Failed to load warehouse from localStorage:", error);
    return null;
  }
}

/**
 * Clear warehouse from localStorage
 */
export function clearWarehouse(): void {
  try {
    localStorage.removeItem(WAREHOUSE_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear warehouse:", error);
  }
}

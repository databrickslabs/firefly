/**
 * Catalog Metadata Cache Manager
 *
 * Manages a persistent cache of Unity Catalog metadata (schemas, tables, columns)
 * stored in localStorage for fast autocomplete suggestions.
 *
 * Cache is shared across tabs/windows via localStorage events.
 */

export interface CatalogMetadata {
  catalogs: string[];
  schemas: Record<string, string[]>; // catalog -> schema[]
  tables: Record<string, Record<string, string[]>>; // catalog -> schema -> table[]
  columns: Record<string, Array<{ name: string; type: string; comment?: string }>>; // full_table_name -> columns[]
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CatalogCache {
  catalogs?: CacheEntry<string[]>;
  schemas: Record<string, CacheEntry<string[]>>;
  tables: Record<string, CacheEntry<string[]>>;
  columns: Record<string, CacheEntry<Array<{ name: string; type: string; comment?: string }>>>;
}

const CACHE_KEY = 'databricks-catalog-metadata-cache';
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
const CATALOG_LIST_TTL = 60 * 60 * 1000; // 1 hour for catalog list

export class CatalogMetadataCache {
  private cache: CatalogCache;
  private listeners: Set<() => void> = new Set();
  private storageListener: ((e: StorageEvent) => void) | null = null;

  constructor() {
    this.cache = this.loadFromStorage();
    this.setupStorageListener();
  }

  /**
   * Load cache from localStorage
   */
  private loadFromStorage(): CatalogCache {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load catalog cache from localStorage:', error);
    }
    return {
      schemas: {},
      tables: {},
      columns: {},
    };
  }

  /**
   * Save cache to localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache));
    } catch (error) {
      console.error('Failed to save catalog cache to localStorage:', error);
    }
  }

  /**
   * Listen for storage events (changes from other tabs)
   */
  private setupStorageListener(): void {
    if (typeof window === 'undefined') return;

    this.storageListener = (e: StorageEvent) => {
      if (e.key === CACHE_KEY && e.newValue) {
        try {
          this.cache = JSON.parse(e.newValue);
          this.notifyListeners();
        } catch (error) {
          console.error('Failed to parse storage event:', error);
        }
      }
    };

    window.addEventListener('storage', this.storageListener);
  }

  /**
   * Clean up storage listener
   */
  public cleanup(): void {
    if (this.storageListener) {
      window.removeEventListener('storage', this.storageListener);
    }
  }

  /**
   * Subscribe to cache updates
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of cache changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Check if a cache entry is valid (not expired)
   */
  private isValid<T>(entry: CacheEntry<T> | undefined): boolean {
    if (!entry) return false;
    return Date.now() < entry.expiresAt;
  }

  /**
   * Create a cache entry with expiration
   */
  private createEntry<T>(data: T, ttl: number = DEFAULT_TTL): CacheEntry<T> {
    const now = Date.now();
    return {
      data,
      timestamp: now,
      expiresAt: now + ttl,
    };
  }

  // ===== Catalogs =====

  /**
   * Get cached catalogs
   */
  public getCatalogs(): string[] | null {
    if (this.isValid(this.cache.catalogs)) {
      return this.cache.catalogs!.data;
    }
    return null;
  }

  /**
   * Set catalogs in cache
   */
  public setCatalogs(catalogs: string[]): void {
    this.cache.catalogs = this.createEntry(catalogs, CATALOG_LIST_TTL);
    this.saveToStorage();
    this.notifyListeners();
  }

  // ===== Schemas =====

  /**
   * Get cached schemas for a catalog
   */
  public getSchemas(catalog: string): string[] | null {
    const entry = this.cache.schemas[catalog];
    if (this.isValid(entry)) {
      return entry.data;
    }
    return null;
  }

  /**
   * Set schemas for a catalog
   */
  public setSchemas(catalog: string, schemas: string[]): void {
    this.cache.schemas[catalog] = this.createEntry(schemas);
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Get all cached schemas
   */
  public getAllSchemas(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    Object.entries(this.cache.schemas).forEach(([catalog, entry]) => {
      if (this.isValid(entry)) {
        result[catalog] = entry.data;
      }
    });
    return result;
  }

  // ===== Tables =====

  /**
   * Get cached tables for a catalog.schema
   */
  public getTables(catalog: string, schema: string): string[] | null {
    const key = `${catalog}.${schema}`;
    const entry = this.cache.tables[key];
    if (this.isValid(entry)) {
      return entry.data;
    }
    return null;
  }

  /**
   * Set tables for a catalog.schema
   */
  public setTables(catalog: string, schema: string, tables: string[]): void {
    const key = `${catalog}.${schema}`;
    this.cache.tables[key] = this.createEntry(tables);
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Get all cached tables organized by catalog and schema
   */
  public getAllTables(): Record<string, Record<string, string[]>> {
    const result: Record<string, Record<string, string[]>> = {};
    Object.entries(this.cache.tables).forEach(([key, entry]) => {
      if (this.isValid(entry)) {
        const [catalog, schema] = key.split('.');
        if (!result[catalog]) {
          result[catalog] = {};
        }
        result[catalog][schema] = entry.data;
      }
    });
    return result;
  }

  // ===== Columns =====

  /**
   * Get cached columns for a table
   */
  public getColumns(fullTableName: string): Array<{ name: string; type: string; comment?: string }> | null {
    const entry = this.cache.columns[fullTableName];
    if (this.isValid(entry)) {
      return entry.data;
    }
    return null;
  }

  /**
   * Set columns for a table
   */
  public setColumns(
    fullTableName: string,
    columns: Array<{ name: string; type: string; comment?: string }>
  ): void {
    this.cache.columns[fullTableName] = this.createEntry(columns);
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Get all cached columns
   */
  public getAllColumns(): Record<string, Array<{ name: string; type: string; comment?: string }>> {
    const result: Record<string, Array<{ name: string; type: string; comment?: string }>> = {};
    Object.entries(this.cache.columns).forEach(([tableName, entry]) => {
      if (this.isValid(entry)) {
        result[tableName] = entry.data;
      }
    });
    return result;
  }

  // ===== Batch Operations =====

  /**
   * Get all valid cached metadata in the format expected by Monaco editor
   */
  public getAllMetadata(): CatalogMetadata {
    return {
      catalogs: this.getCatalogs() || [],
      schemas: this.getAllSchemas(),
      tables: this.getAllTables(),
      columns: this.getAllColumns(),
    };
  }

  /**
   * Clear all cached data
   */
  public clear(): void {
    this.cache = {
      schemas: {},
      tables: {},
      columns: {},
    };
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Clear expired entries
   */
  public clearExpired(): void {
    const now = Date.now();

    // Clear expired catalogs
    if (this.cache.catalogs && now >= this.cache.catalogs.expiresAt) {
      delete this.cache.catalogs;
    }

    // Clear expired schemas
    Object.keys(this.cache.schemas).forEach(key => {
      if (now >= this.cache.schemas[key].expiresAt) {
        delete this.cache.schemas[key];
      }
    });

    // Clear expired tables
    Object.keys(this.cache.tables).forEach(key => {
      if (now >= this.cache.tables[key].expiresAt) {
        delete this.cache.tables[key];
      }
    });

    // Clear expired columns
    Object.keys(this.cache.columns).forEach(key => {
      if (now >= this.cache.columns[key].expiresAt) {
        delete this.cache.columns[key];
      }
    });

    this.saveToStorage();
    this.notifyListeners();
  }
}

// Singleton instance
let cacheInstance: CatalogMetadataCache | null = null;

export function getCatalogCache(): CatalogMetadataCache {
  if (!cacheInstance) {
    cacheInstance = new CatalogMetadataCache();
  }
  return cacheInstance;
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { CatalogsResponse, Catalog } from "@/app/api/databricks/unity-catalog/catalogs/route";
import type { SchemasResponse, Schema } from "@/app/api/databricks/unity-catalog/schemas/route";
import type { TablesResponse, Table } from "@/app/api/databricks/unity-catalog/tables/route";
import type { TableDetails, Column } from "@/app/api/databricks/unity-catalog/table-details/route";

/**
 * Hook to fetch all Unity Catalog catalogs
 */
export function useCatalogs() {
  return useQuery<Catalog[]>({
    queryKey: ["unity-catalog", "catalogs"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/unity-catalog/catalogs");
      if (!response.ok) {
        throw new Error("Failed to fetch catalogs");
      }
      const data: CatalogsResponse = await response.json();
      return data.catalogs ?? [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch schemas for a given catalog
 */
export function useSchemas(catalogName: string | undefined) {
  return useQuery<Schema[]>({
    queryKey: ["unity-catalog", "schemas", catalogName],
    queryFn: async () => {
      if (!catalogName) return [];
      const response = await fetch(
        `/api/databricks/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalogName)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch schemas");
      }
      const data: SchemasResponse = await response.json();
      return data.schemas ?? [];
    },
    enabled: !!catalogName,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch tables for a given catalog and schema
 */
export function useTables(catalogName: string | undefined, schemaName: string | undefined) {
  return useQuery<Table[]>({
    queryKey: ["unity-catalog", "tables", catalogName, schemaName],
    queryFn: async () => {
      if (!catalogName || !schemaName) return [];
      const response = await fetch(
        `/api/databricks/unity-catalog/tables?catalog_name=${encodeURIComponent(catalogName)}&schema_name=${encodeURIComponent(schemaName)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch tables");
      }
      const data: TablesResponse = await response.json();
      return data.tables ?? [];
    },
    enabled: !!catalogName && !!schemaName,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch table details including columns
 */
export function useTableDetails(
  catalogName: string | undefined,
  schemaName: string | undefined,
  tableName: string | undefined
) {
  const fullName = catalogName && schemaName && tableName
    ? `${catalogName}.${schemaName}.${tableName}`
    : undefined;

  return useQuery<TableDetails>({
    queryKey: ["unity-catalog", "table-details", fullName],
    queryFn: async () => {
      if (!fullName) {
        throw new Error("Full table name required");
      }
      const response = await fetch(
        `/api/databricks/unity-catalog/table-details?full_name=${encodeURIComponent(fullName)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch table details");
      }
      return response.json();
    },
    enabled: !!fullName,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Re-export types for convenience
export type { Catalog, Schema, Table, TableDetails, Column };

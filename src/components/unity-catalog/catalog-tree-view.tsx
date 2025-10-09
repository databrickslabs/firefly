"use client";

import * as React from "react";
import { ChevronRight, Database, Folder, Table as TableIcon, Columns, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Types
export interface Catalog {
  name: string;
  comment?: string;
}

export interface Schema {
  name: string;
  catalog_name: string;
  comment?: string;
}

export interface Table {
  name: string;
  catalog_name: string;
  schema_name: string;
  table_type?: string;
  comment?: string;
}

export interface Column {
  name: string;
  type_text: string;
  comment?: string;
}

export type SelectedItem =
  | { type: "catalog"; catalog: string }
  | { type: "schema"; catalog: string; schema: string }
  | { type: "table"; catalog: string; schema: string; table: string };

interface CatalogTreeViewProps {
  showColumns?: boolean;
  onItemSelect?: (item: SelectedItem) => void;
  className?: string;
}

export function CatalogTreeView({
  showColumns = false,
  onItemSelect,
  className,
}: CatalogTreeViewProps) {
  const [selectedItemKey, setSelectedItemKey] = React.useState<string | null>(null);

  // Fetch catalogs
  const { data: catalogsData, isLoading: catalogsLoading } = useQuery({
    queryKey: ["catalogs"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/unity-catalog/catalogs");
      if (!response.ok) {
        throw new Error("Failed to fetch catalogs");
      }
      const data = await response.json();
      return data.catalogs || [];
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const handleCatalogClick = (catalog: string) => {
    const key = `catalog:${catalog}`;
    setSelectedItemKey(key);
    onItemSelect?.({ type: "catalog", catalog });
  };

  const handleSchemaClick = (catalog: string, schema: string) => {
    const key = `schema:${catalog}.${schema}`;
    setSelectedItemKey(key);
    onItemSelect?.({ type: "schema", catalog, schema });
  };

  const handleTableClick = (catalog: string, schema: string, table: string) => {
    const key = `table:${catalog}.${schema}.${table}`;
    setSelectedItemKey(key);
    onItemSelect?.({ type: "table", catalog, schema, table });
  };

  if (catalogsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading catalogs...</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="p-4 space-y-1">
        {catalogsData?.map((catalog: Catalog) => (
          <CatalogNode
            key={catalog.name}
            catalog={catalog}
            showColumns={showColumns}
            onCatalogClick={handleCatalogClick}
            onSchemaClick={handleSchemaClick}
            onTableClick={handleTableClick}
            selectedItemKey={selectedItemKey}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface CatalogNodeProps {
  catalog: Catalog;
  showColumns: boolean;
  onCatalogClick: (catalog: string) => void;
  onSchemaClick: (catalog: string, schema: string) => void;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function CatalogNode({
  catalog,
  showColumns,
  onCatalogClick,
  onSchemaClick,
  onTableClick,
  selectedItemKey,
}: CatalogNodeProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const itemKey = `catalog:${catalog.name}`;
  const isSelected = selectedItemKey === itemKey;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="group/collapsible"
    >
      <CollapsibleTrigger asChild>
        <button
          onClick={(e) => {
            // If clicking the catalog name (not the chevron), select it
            if (!(e.target as HTMLElement).closest('[data-chevron]')) {
              onCatalogClick(catalog.name);
            }
          }}
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors",
            "group-data-[state=open]/collapsible:bg-accent/50",
            isSelected && "bg-accent"
          )}
        >
          <ChevronRight
            data-chevron
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-90"
            )}
          />
          <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="font-medium">{catalog.name}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6">
        {isOpen && (
          <SchemaList
            catalogName={catalog.name}
            showColumns={showColumns}
            onSchemaClick={onSchemaClick}
            onTableClick={onTableClick}
            selectedItemKey={selectedItemKey}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface SchemaListProps {
  catalogName: string;
  showColumns: boolean;
  onSchemaClick: (catalog: string, schema: string) => void;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function SchemaList({
  catalogName,
  showColumns,
  onSchemaClick,
  onTableClick,
  selectedItemKey,
}: SchemaListProps) {
  const { data: schemasData, isLoading } = useQuery({
    queryKey: ["schemas", catalogName],
    queryFn: async () => {
      const response = await fetch(
        `/api/databricks/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalogName)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch schemas");
      }
      const data = await response.json();
      return data.schemas || [];
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="py-2 px-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading schemas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {schemasData?.map((schema: Schema) => (
        <SchemaNode
          key={`${schema.catalog_name}.${schema.name}`}
          schema={schema}
          showColumns={showColumns}
          onSchemaClick={onSchemaClick}
          onTableClick={onTableClick}
          selectedItemKey={selectedItemKey}
        />
      ))}
    </div>
  );
}

interface SchemaNodeProps {
  schema: Schema;
  showColumns: boolean;
  onSchemaClick: (catalog: string, schema: string) => void;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function SchemaNode({
  schema,
  showColumns,
  onSchemaClick,
  onTableClick,
  selectedItemKey,
}: SchemaNodeProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const itemKey = `schema:${schema.catalog_name}.${schema.name}`;
  const isSelected = selectedItemKey === itemKey;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="group/collapsible"
    >
      <CollapsibleTrigger asChild>
        <button
          onClick={(e) => {
            // If clicking the schema name (not the chevron), select it
            if (!(e.target as HTMLElement).closest('[data-chevron]')) {
              onSchemaClick(schema.catalog_name, schema.name);
            }
          }}
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors",
            "group-data-[state=open]/collapsible:bg-accent/50",
            isSelected && "bg-accent"
          )}
        >
          <ChevronRight
            data-chevron
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-90"
            )}
          />
          <Folder className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span>{schema.name}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6">
        {isOpen && (
          <TableList
            catalogName={schema.catalog_name}
            schemaName={schema.name}
            showColumns={showColumns}
            onTableClick={onTableClick}
            selectedItemKey={selectedItemKey}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface TableListProps {
  catalogName: string;
  schemaName: string;
  showColumns: boolean;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function TableList({
  catalogName,
  schemaName,
  showColumns,
  onTableClick,
  selectedItemKey,
}: TableListProps) {
  const { data: tablesData, isLoading } = useQuery({
    queryKey: ["tables", catalogName, schemaName],
    queryFn: async () => {
      const response = await fetch(
        `/api/databricks/unity-catalog/tables?catalog_name=${encodeURIComponent(
          catalogName
        )}&schema_name=${encodeURIComponent(schemaName)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch tables");
      }
      const data = await response.json();
      return data.tables || [];
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="py-2 px-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading tables...</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {tablesData?.map((table: Table) => (
        <TableNode
          key={`${table.catalog_name}.${table.schema_name}.${table.name}`}
          table={table}
          showColumns={showColumns}
          onTableClick={onTableClick}
          selectedItemKey={selectedItemKey}
        />
      ))}
    </div>
  );
}

interface TableNodeProps {
  table: Table;
  showColumns: boolean;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function TableNode({
  table,
  showColumns,
  onTableClick,
  selectedItemKey,
}: TableNodeProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const itemKey = `table:${table.catalog_name}.${table.schema_name}.${table.name}`;
  const isSelected = selectedItemKey === itemKey;

  if (!showColumns) {
    // Simple table item without columns
    return (
      <button
        onClick={() => onTableClick(table.catalog_name, table.schema_name, table.name)}
        className={cn(
          "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors",
          isSelected && "bg-accent"
        )}
      >
        <TableIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span>{table.name}</span>
        {table.table_type && (
          <span className="ml-auto text-xs text-muted-foreground">
            {table.table_type}
          </span>
        )}
      </button>
    );
  }

  // Table with collapsible columns
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="group/collapsible"
    >
      <CollapsibleTrigger asChild>
        <button
          onClick={(e) => {
            // If clicking the table name (not the chevron), select it
            if (!(e.target as HTMLElement).closest('[data-chevron]')) {
              onTableClick(table.catalog_name, table.schema_name, table.name);
            }
          }}
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors",
            "group-data-[state=open]/collapsible:bg-accent/50",
            isSelected && "bg-accent"
          )}
        >
          <ChevronRight
            data-chevron
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-90"
            )}
          />
          <TableIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span>{table.name}</span>
          {table.table_type && (
            <span className="ml-auto text-xs text-muted-foreground">
              {table.table_type}
            </span>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6">
        {isOpen && (
          <ColumnList fullName={itemKey.replace("table:", "")} />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ColumnListProps {
  fullName: string;
}

function ColumnList({ fullName }: ColumnListProps) {
  const { data: tableDetails, isLoading } = useQuery({
    queryKey: ["table-details", fullName],
    queryFn: async () => {
      const response = await fetch(
        `/api/databricks/unity-catalog/table-details?full_name=${encodeURIComponent(fullName)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch table details");
      }
      return response.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="py-2 px-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading columns...</span>
      </div>
    );
  }

  const columns = tableDetails?.columns || [];

  return (
    <div className="space-y-0.5">
      {columns.map((column: Column) => (
        <div
          key={column.name}
          className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
        >
          <Columns className="h-3 w-3 text-gray-500 dark:text-gray-400" />
          <span className="font-medium">{column.name}</span>
          <span className="text-gray-400 dark:text-gray-500">:</span>
          <span className="font-mono text-[10px]">{column.type_text}</span>
        </div>
      ))}
    </div>
  );
}

"use client";

import * as React from "react";
import { ChevronRight, Database, Folder, Table as TableIcon, Columns } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// View mode determines the display context
export type CatalogViewMode = "editor" | "display";

// Helper to truncate text to max characters
function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

// Truncation limits by view mode
const TRUNCATE_LIMIT_EDITOR = 15;
const TRUNCATE_LIMIT_DISPLAY = 30;
const TRUNCATE_LIMIT_TABLE_EDITOR = 15;
const TRUNCATE_LIMIT_TABLE_DISPLAY = 20;

// Helper to conditionally truncate text based on view mode
function displayText(text: string, viewMode: CatalogViewMode): string {
  const maxChars = viewMode === "editor" ? TRUNCATE_LIMIT_EDITOR : TRUNCATE_LIMIT_DISPLAY;
  return truncateText(text, maxChars);
}

// Helper for table names with different truncation limits
function displayTableText(text: string, viewMode: CatalogViewMode): string {
  const maxChars = viewMode === "editor" ? TRUNCATE_LIMIT_TABLE_EDITOR : TRUNCATE_LIMIT_TABLE_DISPLAY;
  return truncateText(text, maxChars);
}

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
  /** View mode: "editor" truncates text, "display" shows full text */
  viewMode?: CatalogViewMode;
}

export function CatalogTreeView({
  showColumns = false,
  onItemSelect,
  className,
  viewMode = "display",
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
          <Spinner className="w-8 h-8 text-purple-600 mx-auto" />
          <p className="text-sm text-muted-foreground">Loading catalogs...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <ScrollArea className={cn("h-full", className)}>
        <div className="p-4 space-y-1 overflow-hidden">
          {catalogsData?.map((catalog: Catalog) => (
            <CatalogNode
              key={catalog.name}
              catalog={catalog}
              showColumns={showColumns}
              viewMode={viewMode}
              onCatalogClick={handleCatalogClick}
              onSchemaClick={handleSchemaClick}
              onTableClick={handleTableClick}
              selectedItemKey={selectedItemKey}
            />
          ))}
        </div>
      </ScrollArea>
    </TooltipProvider>
  );
}

interface CatalogNodeProps {
  catalog: Catalog;
  showColumns: boolean;
  viewMode: CatalogViewMode;
  onCatalogClick: (catalog: string) => void;
  onSchemaClick: (catalog: string, schema: string) => void;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function CatalogNode({
  catalog,
  showColumns,
  viewMode,
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
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger asChild>
            <button
              onClick={(e) => {
                // If clicking the catalog name (not the chevron), select it
                if (!(e.target as HTMLElement).closest('[data-chevron]')) {
                  onCatalogClick(catalog.name);
                }
              }}
              className={cn(
                "flex items-center gap-2 w-full min-w-0 px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors",
                "group-data-[state=open]/collapsible:bg-accent/50",
                isSelected && "bg-accent"
              )}
            >
              <ChevronRight
                data-chevron
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  isOpen && "rotate-90"
                )}
              />
              <Database className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="font-medium truncate">{displayText(catalog.name, viewMode)}</span>
            </button>
          </CollapsibleTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-mono text-xs">{catalog.name}</p>
        </TooltipContent>
      </Tooltip>
      <CollapsibleContent className="pl-6">
        {isOpen && (
          <SchemaList
            catalogName={catalog.name}
            showColumns={showColumns}
            viewMode={viewMode}
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
  viewMode: CatalogViewMode;
  onSchemaClick: (catalog: string, schema: string) => void;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function SchemaList({
  catalogName,
  showColumns,
  viewMode,
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
        <Spinner className="h-3 w-3 text-purple-600" />
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
          viewMode={viewMode}
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
  viewMode: CatalogViewMode;
  onSchemaClick: (catalog: string, schema: string) => void;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function SchemaNode({
  schema,
  showColumns,
  viewMode,
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
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger asChild>
            <button
              onClick={(e) => {
                // If clicking the schema name (not the chevron), select it
                if (!(e.target as HTMLElement).closest('[data-chevron]')) {
                  onSchemaClick(schema.catalog_name, schema.name);
                }
              }}
              className={cn(
                "flex items-center gap-2 w-full min-w-0 px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors",
                "group-data-[state=open]/collapsible:bg-accent/50",
                isSelected && "bg-accent"
              )}
            >
              <ChevronRight
                data-chevron
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  isOpen && "rotate-90"
                )}
              />
              <Folder className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate">{displayText(schema.name, viewMode)}</span>
            </button>
          </CollapsibleTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-mono text-xs">{schema.catalog_name}.{schema.name}</p>
        </TooltipContent>
      </Tooltip>
      <CollapsibleContent className="pl-6">
        {isOpen && (
          <TableList
            catalogName={schema.catalog_name}
            schemaName={schema.name}
            showColumns={showColumns}
            viewMode={viewMode}
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
  viewMode: CatalogViewMode;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function TableList({
  catalogName,
  schemaName,
  showColumns,
  viewMode,
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
        <Spinner className="h-3 w-3 text-purple-600" />
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
          viewMode={viewMode}
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
  viewMode: CatalogViewMode;
  onTableClick: (catalog: string, schema: string, table: string) => void;
  selectedItemKey: string | null;
}

function TableNode({
  table,
  showColumns,
  viewMode,
  onTableClick,
  selectedItemKey,
}: TableNodeProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const itemKey = `table:${table.catalog_name}.${table.schema_name}.${table.name}`;
  const isSelected = selectedItemKey === itemKey;

  if (!showColumns) {
    // Simple table item without columns
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onTableClick(table.catalog_name, table.schema_name, table.name)}
            className={cn(
              "flex items-center gap-2 w-full min-w-0 px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors",
              isSelected && "bg-accent"
            )}
          >
            <TableIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            <span className="truncate">{displayTableText(table.name, viewMode)}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-mono text-xs">{table.catalog_name}.{table.schema_name}.{table.name}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Table with collapsible columns
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="group/collapsible"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger asChild>
            <button
              onClick={(e) => {
                // If clicking the table name (not the chevron), select it
                if (!(e.target as HTMLElement).closest('[data-chevron]')) {
                  onTableClick(table.catalog_name, table.schema_name, table.name);
                }
              }}
              className={cn(
                "flex items-center gap-2 w-full min-w-0 px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors",
                "group-data-[state=open]/collapsible:bg-accent/50",
                isSelected && "bg-accent"
              )}
            >
              <ChevronRight
                data-chevron
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  isOpen && "rotate-90"
                )}
              />
              <TableIcon className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              <span className="truncate">{displayTableText(table.name, viewMode)}</span>
            </button>
          </CollapsibleTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-mono text-xs">{table.catalog_name}.{table.schema_name}.{table.name}</p>
        </TooltipContent>
      </Tooltip>
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
        <Spinner className="h-3 w-3 text-purple-600" />
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
          className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground min-w-0"
        >
          <Columns className="h-3 w-3 shrink-0 text-gray-500 dark:text-gray-400" />
          <span className="font-medium truncate">{column.name}</span>
          <span className="shrink-0 text-gray-400 dark:text-gray-500">:</span>
          <span className="font-mono text-[10px] truncate">{column.type_text}</span>
        </div>
      ))}
    </div>
  );
}

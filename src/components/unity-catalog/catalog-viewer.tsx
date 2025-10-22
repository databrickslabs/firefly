"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Calendar, User, FileType, HardDrive, Folder } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { SelectedItem } from "./catalog-tree-view";

interface CatalogViewerProps {
  selectedItem: SelectedItem | null;
  className?: string;
}

interface Column {
  name: string;
  type_text: string;
  comment?: string;
  nullable?: boolean;
  position?: number;
}

interface TableDetails {
  name: string;
  catalog_name: string;
  schema_name: string;
  table_type?: string;
  data_source_format?: string;
  columns?: Column[];
  comment?: string;
  owner?: string;
  created_at?: number;
  updated_at?: number;
  storage_location?: string;
  view_definition?: string;
}

interface SchemaDetails {
  name: string;
  catalog_name: string;
  comment?: string;
  owner?: string;
  created_at?: number;
  updated_at?: number;
  full_name?: string;
  storage_location?: string;
}

interface CatalogDetails {
  name: string;
  comment?: string;
  owner?: string;
  created_at?: number;
  updated_at?: number;
  metastore_id?: string;
  catalog_type?: string;
}

export function CatalogViewer({ selectedItem, className }: CatalogViewerProps) {
  if (!selectedItem) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center space-y-4">
          <Database className="h-16 w-16 mx-auto text-muted-foreground opacity-50" />
          <div>
            <p className="text-lg font-semibold">No item selected</p>
            <p className="text-sm text-muted-foreground">
              Select a catalog, schema, or table from the tree to view details
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (selectedItem.type === "catalog") {
    return <CatalogDetailsView catalog={selectedItem.catalog} className={className} />;
  }

  if (selectedItem.type === "schema") {
    return (
      <SchemaDetailsView
        catalog={selectedItem.catalog}
        schema={selectedItem.schema}
        className={className}
      />
    );
  }

  return (
    <TableDetailsView
      catalog={selectedItem.catalog}
      schema={selectedItem.schema}
      table={selectedItem.table}
      className={className}
    />
  );
}

function CatalogDetailsView({ catalog, className }: { catalog: string; className?: string }) {
  const { data: catalogDetails, isLoading, error } = useQuery({
    queryKey: ["catalog-details", catalog],
    queryFn: async () => {
      const response = await fetch(
        `/api/databricks/unity-catalog/catalog-details?catalog_name=${encodeURIComponent(catalog)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch catalog details");
      }
      const data: CatalogDetails = await response.json();
      return data;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading) {
    return <LoadingView />;
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  if (!catalogDetails) {
    return null;
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <ScrollArea className={className}>
      <div className="p-6 space-y-6">
        {/* Catalog Header */}
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <Database className="h-6 w-6 mt-1 text-blue-600 dark:text-blue-400" />
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{catalogDetails.name}</h2>
              <p className="text-sm text-muted-foreground font-mono">{catalog}</p>
            </div>
            {catalogDetails.catalog_type && (
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                {catalogDetails.catalog_type}
              </span>
            )}
          </div>
          {catalogDetails.comment && (
            <MarkdownDescription content={catalogDetails.comment} />
          )}
        </div>

        <Separator />

        {/* Catalog Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {catalogDetails.owner && (
            <MetadataField icon={User} label="Owner" value={catalogDetails.owner} />
          )}

          {catalogDetails.created_at && (
            <MetadataField
              icon={Calendar}
              label="Created"
              value={formatDate(catalogDetails.created_at)}
            />
          )}

          {catalogDetails.updated_at && (
            <MetadataField
              icon={Calendar}
              label="Updated"
              value={formatDate(catalogDetails.updated_at)}
            />
          )}

          {catalogDetails.metastore_id && (
            <MetadataField
              icon={Database}
              label="Metastore ID"
              value={catalogDetails.metastore_id}
              monospace
            />
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function SchemaDetailsView({
  catalog,
  schema,
  className,
}: {
  catalog: string;
  schema: string;
  className?: string;
}) {
  const fullName = `${catalog}.${schema}`;
  const { data: schemaDetails, isLoading, error } = useQuery({
    queryKey: ["schema-details", fullName],
    queryFn: async () => {
      const response = await fetch(
        `/api/databricks/unity-catalog/schema-details?full_name=${encodeURIComponent(fullName)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch schema details");
      }
      const data: SchemaDetails = await response.json();
      return data;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading) {
    return <LoadingView />;
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  if (!schemaDetails) {
    return null;
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <ScrollArea className={className}>
      <div className="p-6 space-y-6">
        {/* Schema Header */}
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <Folder className="h-6 w-6 mt-1 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{schemaDetails.name}</h2>
              <p className="text-sm text-muted-foreground font-mono">{fullName}</p>
            </div>
          </div>
          {schemaDetails.comment && (
            <MarkdownDescription content={schemaDetails.comment} />
          )}
        </div>

        <Separator />

        {/* Schema Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetadataField icon={Database} label="Catalog" value={schemaDetails.catalog_name} />

          {schemaDetails.owner && (
            <MetadataField icon={User} label="Owner" value={schemaDetails.owner} />
          )}

          {schemaDetails.created_at && (
            <MetadataField
              icon={Calendar}
              label="Created"
              value={formatDate(schemaDetails.created_at)}
            />
          )}

          {schemaDetails.updated_at && (
            <MetadataField
              icon={Calendar}
              label="Updated"
              value={formatDate(schemaDetails.updated_at)}
            />
          )}

          {schemaDetails.storage_location && (
            <MetadataField
              icon={HardDrive}
              label="Storage Location"
              value={schemaDetails.storage_location}
              monospace
              fullWidth
            />
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function TableDetailsView({
  catalog,
  schema,
  table,
  className,
}: {
  catalog: string;
  schema: string;
  table: string;
  className?: string;
}) {
  const fullName = `${catalog}.${schema}.${table}`;
  const [currentPage, setCurrentPage] = React.useState(1);
  const COLUMNS_PER_PAGE = 20;

  const { data: tableDetails, isLoading, error } = useQuery({
    queryKey: ["table-details", fullName],
    queryFn: async () => {
      const response = await fetch(
        `/api/databricks/unity-catalog/table-details?full_name=${encodeURIComponent(fullName)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch table details");
      }
      const data: TableDetails = await response.json();
      return data;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Reset to page 1 when table changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [fullName]);

  if (isLoading) {
    return <LoadingView />;
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  if (!tableDetails) {
    return null;
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  // Pagination calculations
  const columns = tableDetails.columns || [];
  const totalColumns = columns.length;
  const totalPages = Math.ceil(totalColumns / COLUMNS_PER_PAGE);
  const startIndex = (currentPage - 1) * COLUMNS_PER_PAGE;
  const endIndex = startIndex + COLUMNS_PER_PAGE;
  const paginatedColumns = columns.slice(startIndex, endIndex);

  return (
    <ScrollArea className={className}>
      <div className="p-6 space-y-6">
        {/* Table Header */}
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <Database className="h-6 w-6 mt-1 text-green-600 dark:text-green-400" />
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{tableDetails.name}</h2>
              <p className="text-sm text-muted-foreground font-mono">{fullName}</p>
            </div>
            {tableDetails.table_type && (
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {tableDetails.table_type}
              </span>
            )}
          </div>
          {tableDetails.comment && (
            <MarkdownDescription content={tableDetails.comment} />
          )}
        </div>

        <Separator />

        {/* Table Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tableDetails.owner && (
            <MetadataField icon={User} label="Owner" value={tableDetails.owner} />
          )}

          {tableDetails.data_source_format && (
            <MetadataField
              icon={FileType}
              label="Format"
              value={tableDetails.data_source_format}
            />
          )}

          {tableDetails.created_at && (
            <MetadataField
              icon={Calendar}
              label="Created"
              value={formatDate(tableDetails.created_at)}
            />
          )}

          {tableDetails.updated_at && (
            <MetadataField
              icon={Calendar}
              label="Updated"
              value={formatDate(tableDetails.updated_at)}
            />
          )}

          {tableDetails.storage_location && (
            <MetadataField
              icon={HardDrive}
              label="Storage Location"
              value={tableDetails.storage_location}
              monospace
              fullWidth
            />
          )}
        </div>

        <Separator />

        {/* Columns Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Columns</h3>
            <span className="text-sm text-muted-foreground">
              {totalColumns} columns total
              {totalPages > 1 && (
                <span className="ml-2">
                  (showing {startIndex + 1}-{Math.min(endIndex, totalColumns)})
                </span>
              )}
            </span>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Column Name</TableHead>
                  <TableHead>Data Type</TableHead>
                  <TableHead>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedColumns.length > 0 ? (
                  paginatedColumns.map((column, index) => {
                    const actualIndex = startIndex + index;
                    return (
                      <TableRow key={column.name}>
                        <TableCell className="font-medium text-muted-foreground">
                          {column.position !== undefined ? column.position + 1 : actualIndex + 1}
                        </TableCell>
                        <TableCell className="font-medium font-mono">
                          {column.name}
                          {column.nullable === false && (
                            <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                              NOT NULL
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{column.type_text}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {column.comment || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No columns found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={
                        currentPage === 1
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>

                  {/* Page Numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current
                    const shouldShow =
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1);

                    if (!shouldShow) {
                      // Show ellipsis for skipped pages
                      if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <PaginationItem key={page}>
                            <span className="px-4">...</span>
                          </PaginationItem>
                        );
                      }
                      return null;
                    }

                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={
                        currentPage === totalPages
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>

        {/* View Definition (if it's a view) */}
        {tableDetails.view_definition && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">View Definition</h3>
              <div className="bg-muted rounded-lg p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                  {tableDetails.view_definition}
                </pre>
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

// Helper components
function MarkdownDescription({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground pl-9">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center space-y-4">
        <div className="animate-spin w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-muted-foreground">Loading details...</p>
      </div>
    </div>
  );
}

function ErrorView({ error }: { error: Error }) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center space-y-4">
        <div className="p-6 bg-red-100 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-800 rounded-xl">
          <p className="font-semibold text-red-800 dark:text-red-200">
            Failed to load details
          </p>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error.message}</p>
        </div>
      </div>
    </div>
  );
}

interface MetadataFieldProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  monospace?: boolean;
  fullWidth?: boolean;
}

function MetadataField({ icon: Icon, label, value, monospace, fullWidth }: MetadataFieldProps) {
  return (
    <div className={cn("flex items-start gap-3", fullWidth && "md:col-span-2")}>
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-medium break-all", monospace && "font-mono")}>{value}</p>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

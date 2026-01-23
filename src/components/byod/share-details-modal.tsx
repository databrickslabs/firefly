"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Table2,
  Code2,
  HardDrive,
  FileText,
  Loader2,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

// Asset types
interface SharedAsset {
  type: "table" | "function" | "volume" | "notebook";
  name: string;
  schema?: string;
  comment?: string;
  dataType?: string;
  id?: string;
}

interface ShareAssetsResponse {
  share?: {
    id?: string;
    name?: string;
  };
  tables: SharedAsset[];
  functions: SharedAsset[];
  volumes: SharedAsset[];
  notebooks: SharedAsset[];
  summary: {
    tableCount: number;
    functionCount: number;
    volumeCount: number;
    notebookCount: number;
    totalCount: number;
  };
}

interface ShareDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  shareName: string;
}

// Icon map for asset types
const assetTypeIcons: Record<SharedAsset["type"], React.ReactNode> = {
  table: <Table2 className="h-4 w-4 text-blue-500" />,
  function: <Code2 className="h-4 w-4 text-purple-500" />,
  volume: <HardDrive className="h-4 w-4 text-amber-500" />,
  notebook: <FileText className="h-4 w-4 text-green-500" />,
};

// Badge colors for asset types
const assetTypeBadgeColors: Record<SharedAsset["type"], string> = {
  table: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  function: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  volume: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  notebook: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

// Column definitions for the data table
const columns: ColumnDef<SharedAsset>[] = [
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => {
      const type = row.getValue("type") as SharedAsset["type"];
      return (
        <div className="flex items-center gap-2">
          {assetTypeIcons[type]}
          <Badge variant="outline" className={cn("text-xs capitalize", assetTypeBadgeColors[type])}>
            {type}
          </Badge>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value === "all" || row.getValue(id) === value;
    },
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 hover:bg-muted/50"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          <span className="font-semibold">Name</span>
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return <span className="font-mono text-sm">{row.getValue("name")}</span>;
    },
  },
  {
    accessorKey: "schema",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 hover:bg-muted/50"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          <span className="font-semibold">Schema</span>
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const schema = row.getValue("schema") as string | undefined;
      return schema ? (
        <span className="text-sm text-muted-foreground">{schema}</span>
      ) : (
        <span className="text-sm text-muted-foreground italic">-</span>
      );
    },
  },
  {
    accessorKey: "comment",
    header: "Comment",
    cell: ({ row }) => {
      const comment = row.getValue("comment") as string | undefined;
      return comment ? (
        <span className="text-sm text-muted-foreground truncate max-w-[300px] block" title={comment}>
          {comment}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground italic">-</span>
      );
    },
  },
];

// Data table component
function AssetsDataTable({ data }: { data: SharedAsset[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");

  // Apply type filter
  const filteredData = React.useMemo(() => {
    if (typeFilter === "all") return data;
    return data.filter((asset) => asset.type === typeFilter);
  }, [data, typeFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  // Count assets by type
  const typeCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: data.length };
    for (const asset of data) {
      counts[asset.type] = (counts[asset.type] || 0) + 1;
    }
    return counts;
  }, [data]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Left side: Type filter tabs */}
        <Tabs value={typeFilter} onValueChange={setTypeFilter} className="w-full sm:w-auto">
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-2 h-6">
              All ({typeCounts.all || 0})
            </TabsTrigger>
            {typeCounts.table > 0 && (
              <TabsTrigger value="table" className="text-xs px-2 h-6 gap-1">
                <Table2 className="h-3 w-3" />
                Tables ({typeCounts.table})
              </TabsTrigger>
            )}
            {typeCounts.function > 0 && (
              <TabsTrigger value="function" className="text-xs px-2 h-6 gap-1">
                <Code2 className="h-3 w-3" />
                Functions ({typeCounts.function})
              </TabsTrigger>
            )}
            {typeCounts.volume > 0 && (
              <TabsTrigger value="volume" className="text-xs px-2 h-6 gap-1">
                <HardDrive className="h-3 w-3" />
                Volumes ({typeCounts.volume})
              </TabsTrigger>
            )}
            {typeCounts.notebook > 0 && (
              <TabsTrigger value="notebook" className="text-xs px-2 h-6 gap-1">
                <FileText className="h-3 w-3" />
                Notebooks ({typeCounts.notebook})
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {/* Right side: Search */}
        <div className="relative w-full sm:w-[250px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={globalFilter ?? ""}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-background overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="h-9 whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2 text-xs">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No assets found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-7 w-[70px] text-xs">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 50, 100].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`} className="text-xs">
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShareDetailsModal({
  open,
  onOpenChange,
  providerName,
  shareName,
}: ShareDetailsModalProps) {
  // Fetch share assets when modal opens
  const { data, isLoading, error } = useQuery({
    queryKey: ["share-assets", providerName, shareName],
    queryFn: async () => {
      const res = await fetch(
        `/api/sso-spn/byod/databricks/providers/shares?provider=${encodeURIComponent(providerName)}&share=${encodeURIComponent(shareName)}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch share assets");
      }
      return res.json() as Promise<ShareAssetsResponse>;
    },
    enabled: open && !!providerName && !!shareName,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Combine all assets into a single array for the table
  const allAssets = React.useMemo(() => {
    if (!data) return [];
    return [...data.tables, ...data.functions, ...data.volumes, ...data.notebooks];
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] !max-w-[1400px] max-h-[90vh] overflow-y-auto sm:!max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-emerald-600" />
            Share: {shareName}
          </DialogTitle>
          <DialogDescription>
            Provider: <span className="font-mono">{providerName}</span>
            {data?.summary && (
              <span className="ml-2">
                • {data.summary.totalCount} total asset{data.summary.totalCount !== 1 ? "s" : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Loading share assets...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-destructive">
              <p className="text-sm font-medium">Failed to load share assets</p>
              <p className="text-xs mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
            </div>
          ) : allAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-sm">No assets found in this share.</p>
            </div>
          ) : (
            <AssetsDataTable data={allAssets} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Button component to trigger the modal
export function ShareDetailsButton({
  providerName,
  shareName,
  className,
}: {
  providerName: string;
  shareName: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 w-7 p-0", className)}
        onClick={() => setOpen(true)}
        title="View share details"
      >
        <ExternalLink className="h-4 w-4" />
        <span className="sr-only">View share details</span>
      </Button>
      <ShareDetailsModal
        open={open}
        onOpenChange={setOpen}
        providerName={providerName}
        shareName={shareName}
      />
    </>
  );
}

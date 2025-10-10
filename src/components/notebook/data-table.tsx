"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";

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
import { ColumnToggle } from "./column-toggle";
import { FilterDialog } from "./filter-dialog";

interface DataTableProps {
  data: unknown[][];
  schema: {
    name: string;
    type: string;
    metadata?: string;
  }[];
  truncated?: boolean;
}

export function DataTable({ data, schema, truncated = false }: DataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  // Convert array data to object data for TanStack Table
  const tableData = React.useMemo(() => {
    return data.map((row) => {
      const rowObj: Record<string, unknown> = {};
      schema.forEach((col, index) => {
        rowObj[col.name] = row[index];
      });
      return rowObj;
    });
  }, [data, schema]);

  // Create columns from schema
  const columns = React.useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    return schema.map((col) => ({
      accessorKey: col.name,
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 hover:bg-muted/50"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            <span className="font-semibold">{col.name}</span>
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ getValue }) => {
        const value = getValue();
        // Handle null/undefined
        if (value === null || value === undefined) {
          return <span className="text-muted-foreground italic">null</span>;
        }
        // Handle different types
        if (typeof value === "boolean") {
          return <span className="font-mono">{String(value)}</span>;
        }
        if (typeof value === "number") {
          return <span className="font-mono tabular-nums">{value}</span>;
        }
        return <span>{String(value)}</span>;
      },
      filterFn: (row, columnId, filterValue) => {
        // If filterValue is a simple string, use default filtering
        if (typeof filterValue === "string") {
          const cellValue = String(row.getValue(columnId) ?? "");
          return cellValue.toLowerCase().includes(filterValue.toLowerCase());
        }

        // If filterValue is an object with operator and filterValue
        if (filterValue && typeof filterValue === "object") {
          const { operator, filterValue: value } = filterValue as {
            operator: string;
            filterValue: string;
          };
          const cellValue = String(row.getValue(columnId) ?? "");
          const valueLower = value.toLowerCase();
          const cellValueLower = cellValue.toLowerCase();

          switch (operator) {
            case "equals":
              return cellValueLower === valueLower;
            case "notEquals":
              return cellValueLower !== valueLower;
            case "contains":
              return cellValueLower.includes(valueLower);
            case "startsWith":
              return cellValueLower.startsWith(valueLower);
            case "endsWith":
              return cellValueLower.endsWith(valueLower);
            case "greaterThan":
              return Number(cellValue) > Number(value);
            case "lessThan":
              return Number(cellValue) < Number(value);
            case "greaterThanOrEqual":
              return Number(cellValue) >= Number(value);
            case "lessThanOrEqual":
              return Number(cellValue) <= Number(value);
            default:
              return true;
          }
        }

        return true;
      },
    }));
  }, [schema]);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        {/* Left side: Info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {truncated && (
            <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
              Results truncated
            </span>
          )}
          <span>
            {(() => {
              const totalRows = tableData.length;
              const filteredRows = table.getFilteredRowModel().rows.length;
              const hasFilters = columnFilters.length > 0 || globalFilter;

              if (hasFilters && filteredRows !== totalRows) {
                return (
                  <>
                    {filteredRows.toLocaleString()} of {totalRows.toLocaleString()} row{totalRows !== 1 ? "s" : ""}
                  </>
                );
              }
              return (
                <>
                  {totalRows.toLocaleString()} row{totalRows !== 1 ? "s" : ""}
                </>
              );
            })()}
          </span>
        </div>

        {/* Right side: Controls */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={globalFilter ?? ""}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Filter */}
          <FilterDialog table={table} />

          {/* Column Toggle */}
          <ColumnToggle table={table} />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="h-9">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-muted/50"
                >
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
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2">
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
              {[10, 20, 30, 40, 50, 100].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`} className="text-xs">
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
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

"use client";

import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  CellContext,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, ChevronDown, ChevronRight } from "lucide-react";
import { exportToCSV, exportToExcel } from "@/lib/export-utils";
import { cn } from "@/lib/utils";

interface Column {
  name: string;
  type_name: string;
  type_text: string;
  position: number;
}

interface QueryResultsTableProps {
  columns: Column[];
  data: unknown[][];
  rowCount?: number;
  executionTime?: number;
}

export function QueryResultsTable({
  columns,
  data,
  rowCount,
  executionTime,
}: QueryResultsTableProps) {
  // Track expanded rows
  const [expandedRows, setExpandedRows] = React.useState<Set<number>>(new Set());

  const toggleRowExpansion = (rowIndex: number) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowIndex)) {
        newSet.delete(rowIndex);
      } else {
        newSet.add(rowIndex);
      }
      return newSet;
    });
  };

  // Convert data array to object array for TanStack Table
  const tableData = React.useMemo(() => {
    return data.map((row) => {
      const rowObj: Record<string, unknown> = {};
      columns.forEach((col, index) => {
        rowObj[col.name] = row[index];
      });
      return rowObj;
    });
  }, [data, columns]);

  // Create column definitions
  const columnDefs = React.useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    return [
      // Expander column
      {
        id: "expander",
        header: () => <div className="w-8"></div>,
        cell: ({ row }) => {
          const rowIndex = row.index;
          const isExpanded = expandedRows.has(rowIndex);
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => toggleRowExpansion(rowIndex)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          );
        },
        size: 40,
        minSize: 40,
        maxSize: 40,
      },
      // Data columns
      ...columns.map((col) => ({
        accessorKey: col.name,
        header: () => (
          <div className="flex flex-col">
            <span className="font-semibold">{col.name}</span>
            <span className="text-xs text-muted-foreground font-normal">
              {col.type_text}
            </span>
          </div>
        ),
        cell: (info: CellContext<Record<string, unknown>, unknown>) => {
          const value = info.getValue();
          const rowIndex = info.row.index;
          const isExpanded = expandedRows.has(rowIndex);

          if (value === null || value === undefined) {
            return <span className="text-muted-foreground italic">NULL</span>;
          }

          const stringValue = String(value);

          return (
            <div
              className={cn(
                "max-w-md",
                isExpanded ? "whitespace-pre-wrap break-words" : "truncate"
              )}
              title={!isExpanded ? stringValue : undefined}
            >
              {stringValue}
            </div>
          );
        },
      })),
    ];
  }, [columns, expandedRows]);

  const table = useReactTable({
    data: tableData,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleExportCSV = () => {
    exportToCSV(columns, data, "query_results");
  };

  const handleExportExcel = () => {
    exportToExcel(columns, data, "query_results");
  };

  if (columns.length === 0 || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">No results to display</p>
          <p className="text-xs mt-1">Run a query to see results here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with stats and export buttons */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="text-sm text-muted-foreground">
          {rowCount !== undefined && (
            <span className="mr-4">
              <span className="font-semibold text-foreground">{rowCount.toLocaleString()}</span>{" "}
              {rowCount === 1 ? "row" : "rows"}
            </span>
          )}
          {executionTime !== undefined && (
            <span>
              Executed in{" "}
              <span className="font-semibold text-foreground">
                {executionTime < 1000
                  ? `${executionTime}ms`
                  : `${(executionTime / 1000).toFixed(2)}s`}
              </span>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="font-semibold">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => {
              const isExpanded = expandedRows.has(row.index);
              return (
                <TableRow key={row.id} className={cn(isExpanded && "bg-muted/30")}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "font-mono text-xs",
                        isExpanded ? "align-top py-3" : "align-middle"
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
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
import { Download, FileSpreadsheet } from "lucide-react";
import { exportToCSV, exportToExcel } from "@/lib/export-utils";

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
    return columns.map((col) => ({
      accessorKey: col.name,
      header: () => (
        <div className="flex flex-col">
          <span className="font-semibold">{col.name}</span>
          <span className="text-xs text-muted-foreground font-normal">
            {col.type_text}
          </span>
        </div>
      ),
      cell: (info) => {
        const value = info.getValue();
        if (value === null || value === undefined) {
          return <span className="text-muted-foreground italic">NULL</span>;
        }
        return <span>{String(value)}</span>;
      },
    }));
  }, [columns]);

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
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="font-mono text-xs">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

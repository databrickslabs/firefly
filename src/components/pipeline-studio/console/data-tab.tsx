"use client";

import { useState, useMemo, useEffect } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSampleDataByNode, useNodeSampleDataActions, useSelectedNodeIds } from "@/providers/pipeline-store-provider";
import { Loader2, X, Database, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SampleDataResult } from "@/stores/pipeline-store";

export function DataTab() {
  const sampleDataByNode = useSampleDataByNode();
  const { clearNodeSample, clearAllNodeSamples } = useNodeSampleDataActions();
  const selectedNodeIds = useSelectedNodeIds();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Sync with canvas selection - when a selected node has sample data, show it
  useEffect(() => {
    if (selectedNodeIds.length > 0) {
      const firstSelectedId = selectedNodeIds[0];
      // If the selected node on canvas has sample data, switch to it
      if (sampleDataByNode[firstSelectedId]) {
        setSelectedNodeId(firstSelectedId);
      }
    }
  }, [selectedNodeIds, sampleDataByNode]);

  // Get list of sampled nodes
  const sampledNodes = useMemo(() => {
    return Object.values(sampleDataByNode).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }, [sampleDataByNode]);

  // Auto-select the most recent sample if nothing is selected
  const effectiveSelectedId = selectedNodeId && sampleDataByNode[selectedNodeId]
    ? selectedNodeId
    : sampledNodes[0]?.nodeId ?? null;

  const sampleData: SampleDataResult | null = effectiveSelectedId
    ? sampleDataByNode[effectiveSelectedId] ?? null
    : null;

  // Format cell value for display
  const formatCellValue = (value: unknown): string => {
    if (value === null) return "NULL";
    if (value === undefined) return "";
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  };

  // Truncate long values
  const truncateValue = (value: string, maxLength: number = 100): string => {
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength) + "...";
  };

  // Handle clear for current sample
  const handleClearCurrent = () => {
    if (effectiveSelectedId) {
      clearNodeSample(effectiveSelectedId);
      setSelectedNodeId(null);
    }
  };

  if (sampledNodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-4">
        <Database className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm text-center">
          No sample data yet.
          <br />
          Click the <strong>Sample</strong> button on a node to preview data.
        </p>
      </div>
    );
  }

  if (!sampleData) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-4">
        <p className="text-sm">Select a node to view sample data</p>
      </div>
    );
  }

  if (sampleData.isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-4">
        <Loader2 className="h-6 w-6 animate-spin mb-2" />
        <p className="text-sm">Sampling data from {sampleData.nodeLabel}...</p>
      </div>
    );
  }

  if (sampleData.error) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-red-600">Error sampling {sampleData.nodeLabel}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClearCurrent}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{sampleData.error}</p>
        </div>
      </div>
    );
  }

  if (sampleData.columns.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-4">
        <p className="text-sm">No data returned from {sampleData.nodeLabel}</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={handleClearCurrent}>
          Clear
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Node selector dropdown */}
          {sampledNodes.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 font-medium text-slate-700">
                  <span>{sampleData.nodeLabel}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({effectiveSelectedId})</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {sampledNodes.map((node) => (
                  <DropdownMenuItem
                    key={node.nodeId}
                    onClick={() => setSelectedNodeId(node.nodeId)}
                    className={node.nodeId === effectiveSelectedId ? "bg-slate-100" : ""}
                  >
                    <div className="flex flex-col flex-1">
                      <span>{node.nodeLabel}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{node.nodeId}</span>
                    </div>
                    <span className="text-xs text-slate-400 ml-2">
                      {node.rowCount} rows
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-slate-700">{sampleData.nodeLabel}</span>
              <span className="text-[10px] text-slate-400 font-mono">({effectiveSelectedId})</span>
            </div>
          )}
          <span className="text-xs text-slate-500">
            {sampleData.rowCount} row{sampleData.rowCount !== 1 ? "s" : ""} &middot;{" "}
            {sampleData.columns.length} column{sampleData.columns.length !== 1 ? "s" : ""}
          </span>
          {sampledNodes.length > 1 && (
            <span className="text-xs text-slate-400">
              ({sampledNodes.length} nodes sampled)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {sampledNodes.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-slate-500 hover:text-red-600"
              onClick={() => clearAllNodeSamples()}
            >
              Clear All
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClearCurrent}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Data table with both horizontal and vertical scrolling - use relative/absolute to break out of flex sizing */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-hidden">
          <ScrollArea className="h-full w-full" type="always">
            <div className="min-w-max">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    {sampleData.columns.map((column, colIndex) => (
                      <TableHead
                        key={`col-${colIndex}-${column}`}
                        className="font-mono text-xs font-semibold text-slate-700 whitespace-nowrap px-3 py-2 sticky top-0 bg-slate-50 z-10"
                      >
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleData.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex} className="hover:bg-slate-50">
                      {sampleData.columns.map((column, colIndex) => {
                        const value = formatCellValue(row[column]);
                        const isNull = row[column] === null;
                        return (
                          <TableCell
                            key={`cell-${rowIndex}-${colIndex}`}
                            className={`font-mono text-xs px-3 py-1.5 whitespace-nowrap ${
                              isNull ? "text-slate-400 italic" : "text-slate-700"
                            }`}
                            title={value}
                          >
                            {truncateValue(value)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { Table } from "@tanstack/react-table";
import { Filter, X, CheckCircle2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface FilterDialogProps<TData> {
  table: Table<TData>;
}

interface ParsedFilter {
  column: string;
  operator: string;
  value: string;
}

export function FilterDialog<TData>({ table }: FilterDialogProps<TData>) {
  const [open, setOpen] = React.useState(false);
  const [filterText, setFilterText] = React.useState("");
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [activeFilterCount, setActiveFilterCount] = React.useState(0);
  const [showColumnSuggestions, setShowColumnSuggestions] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const columns = table.getAllColumns().filter((column) => column.getCanFilter());
  const columnNames = columns.map((col) => col.id);

  // Get filtered column suggestions based on what user is typing
  const getFilteredColumns = () => {
    if (!filterText) return columnNames;

    // Extract the last word being typed
    const words = filterText.split(/\s+/);
    const lastWord = words[words.length - 1].toLowerCase();

    if (!lastWord) return columnNames;

    return columnNames.filter(col =>
      col.toLowerCase().includes(lastWord)
    );
  };

  const filteredColumns = getFilteredColumns();

  // Handle selecting a column suggestion
  const selectColumn = (value: string) => {
    // Replace the last word with the selected column
    const words = filterText.split(/\s+/);
    words[words.length - 1] = value;
    setFilterText(words.join(" ") + " ");
    setShowColumnSuggestions(false);

    // Return focus to input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  // Track active filters
  React.useEffect(() => {
    const columnFilters = table.getState().columnFilters;
    setActiveFilterCount(columnFilters.length);
  }, [table]);

  // Parse SQL-like filter expressions with support for AND/OR and parentheses
  const parseFilters = (text: string): ParsedFilter[] => {
    if (!text.trim()) return [];

    // For now, we'll support AND and OR by splitting on both
    // More complex parsing with parentheses would require a proper parser
    const filters: ParsedFilter[] = [];

    // Split by 'and' or 'or' (case insensitive) but keep track of the logical operator
    const conditions = text.split(/\s+(and|or)\s+/i);

    // Extract just the conditions (skip 'and'/'or' keywords)
    const actualConditions = conditions.filter((_, index) => index % 2 === 0);

    for (const condition of actualConditions) {
      const trimmed = condition.trim().replace(/^\(|\)$/g, ""); // Remove outer parentheses
      if (!trimmed) continue;

      // Match patterns like: column > value, column = value, column contains value
      const operatorRegex = /([\w_]+)\s*(>=|<=|<>|!=|>|<|=|contains|startsWith|endsWith)\s*(.+)/i;
      const match = trimmed.match(operatorRegex);

      if (match) {
        const [, column, operator, value] = match;
        const columnTrimmed = column.trim();
        const valueTrimmed = value.trim().replace(/^["']|["']$/g, ""); // Remove quotes

        // Map operator symbols to internal names
        let internalOperator = operator.toLowerCase();
        switch (operator) {
          case "=":
            internalOperator = "equals";
            break;
          case "!=":
          case "<>":
            internalOperator = "notEquals";
            break;
          case ">":
            internalOperator = "greaterThan";
            break;
          case "<":
            internalOperator = "lessThan";
            break;
          case ">=":
            internalOperator = "greaterThanOrEqual";
            break;
          case "<=":
            internalOperator = "lessThanOrEqual";
            break;
        }

        filters.push({
          column: columnTrimmed,
          operator: internalOperator,
          value: valueTrimmed,
        });
      }
    }

    return filters;
  };

  const applyFilters = () => {
    try {
      const parsedFilters = parseFilters(filterText);

      // Validate columns exist
      for (const filter of parsedFilters) {
        if (!columnNames.includes(filter.column)) {
          setParseError(`Column "${filter.column}" does not exist`);
          return;
        }
      }

      setParseError(null);

      // Clear existing filters first
      table.resetColumnFilters();

      // Apply each filter using column filter state
      const newFilters = parsedFilters.map((filter) => ({
        id: filter.column,
        value: {
          operator: filter.operator,
          filterValue: filter.value,
        },
      }));

      table.setColumnFilters(newFilters);
      setOpen(false);
    } catch {
      setParseError("Invalid filter syntax");
    }
  };

  const clearAllFilters = () => {
    setFilterText("");
    setParseError(null);
    table.resetColumnFilters();
  };

  // Get current active filters as text
  const getActiveFiltersText = (): string => {
    const columnFilters = table.getState().columnFilters;
    if (columnFilters.length === 0) return "";

    return columnFilters
      .map((filter) => {
        const value = filter.value as { operator: string; filterValue: string };
        let operatorSymbol = value.operator;

        // Convert internal operator names to symbols
        switch (value.operator) {
          case "equals":
            operatorSymbol = "=";
            break;
          case "notEquals":
            operatorSymbol = "!=";
            break;
          case "greaterThan":
            operatorSymbol = ">";
            break;
          case "lessThan":
            operatorSymbol = "<";
            break;
          case "greaterThanOrEqual":
            operatorSymbol = ">=";
            break;
          case "lessThanOrEqual":
            operatorSymbol = "<=";
            break;
        }

        return `${filter.id} ${operatorSymbol} ${value.filterValue}`;
      })
      .join(" and ");
  };

  // Update filter text when popover opens
  React.useEffect(() => {
    if (open) {
      const columnFilters = table.getState().columnFilters;
      if (columnFilters.length === 0) {
        setFilterText("");
      } else {
        const currentFiltersText = columnFilters
          .map((filter) => {
            const value = filter.value as { operator: string; filterValue: string };
            let operatorSymbol = value.operator;

            switch (value.operator) {
              case "equals":
                operatorSymbol = "=";
                break;
              case "notEquals":
                operatorSymbol = "!=";
                break;
              case "greaterThan":
                operatorSymbol = ">";
                break;
              case "lessThan":
                operatorSymbol = "<";
                break;
              case "greaterThanOrEqual":
                operatorSymbol = ">=";
                break;
              case "lessThanOrEqual":
                operatorSymbol = "<=";
                break;
            }

            return `${filter.id} ${operatorSymbol} ${value.filterValue}`;
          })
          .join(" and ");
        setFilterText(currentFiltersText);
      }
      setParseError(null);
    }
  }, [open, table]);

  const hasActiveFilters = activeFilterCount > 0;

  const handleClearClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAllFilters();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-0.5">
        <PopoverTrigger asChild>
          <Button
            variant={hasActiveFilters ? "default" : "outline"}
            size="sm"
            className={`h-8 gap-2 text-xs ${hasActiveFilters ? "rounded-r-none" : ""}`}
          >
            <Filter className="h-3.5 w-3.5" />
            {hasActiveFilters ? `Filtered (${activeFilterCount})` : "Filter"}
          </Button>
        </PopoverTrigger>
        {hasActiveFilters && (
          <Button
            variant="default"
            size="sm"
            className="h-8 w-8 p-0 rounded-l-none border-l border-primary-foreground/20"
            onClick={handleClearClick}
            title="Clear filters"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <PopoverContent className="w-[500px] p-0" align="end">
        <div className="space-y-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Add filter</div>
              <div className="text-xs text-muted-foreground">
                Use SQL-like syntax to filter your data
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Filter input with dropdown autocomplete */}
            <div className="space-y-2">
              <Popover open={showColumnSuggestions} onOpenChange={setShowColumnSuggestions}>
                <PopoverTrigger asChild>
                  <Input
                    ref={inputRef}
                    placeholder="Example: trip_distance > 5 and fare_amount < 100"
                    value={filterText}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFilterText(value);
                      setParseError(null);
                      setShowColumnSuggestions(value.length > 0 && filteredColumns.length > 0);
                    }}
                    onFocus={() => {
                      if (filterText.length > 0 && filteredColumns.length > 0) {
                        setShowColumnSuggestions(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !showColumnSuggestions) {
                        e.preventDefault();
                        applyFilters();
                      } else if (e.key === "Escape") {
                        setShowColumnSuggestions(false);
                      } else if (e.key === "ArrowDown" && filteredColumns.length > 0) {
                        e.preventDefault();
                        setShowColumnSuggestions(true);
                      } else if (e.key === "Tab" && showColumnSuggestions && filteredColumns.length > 0) {
                        e.preventDefault();
                        selectColumn(filteredColumns[0]);
                      }
                    }}
                    className="h-9 text-xs font-mono"
                  />
                </PopoverTrigger>
                <PopoverContent
                  className="w-[452px] p-0"
                  align="start"
                  side="bottom"
                  sideOffset={4}
                  onOpenAutoFocus={(e) => {
                    // Prevent popover from stealing focus, let Command handle it
                    e.preventDefault();
                  }}
                >
                  <Command shouldFilter={false} className="max-h-[300px]">
                    <CommandList>
                      <CommandEmpty>No column suggestions</CommandEmpty>
                      <CommandGroup heading="Available Columns">
                        {filteredColumns.slice(0, 8).map((col) => (
                          <CommandItem
                            key={col}
                            value={col}
                            onSelect={selectColumn}
                            className="text-xs font-mono"
                          >
                            {col}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Parse error */}
              {parseError && (
                <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Valid syntax indicator */}
              {!parseError && filterText && (
                <div className="flex items-start gap-2 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Valid filter syntax</span>
                </div>
              )}
            </div>

            {/* Help text */}
            <div className="space-y-2 text-xs text-muted-foreground">
              <div>
                <div className="font-medium mb-1">Supported operators:</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                  <div>= (equals)</div>
                  <div>!= or &lt;&gt; (not equals)</div>
                  <div>&gt; (greater than)</div>
                  <div>&lt; (less than)</div>
                  <div>&gt;= (greater or equal)</div>
                  <div>&lt;= (less or equal)</div>
                  <div>contains</div>
                  <div>startsWith</div>
                  <div>endsWith</div>
                </div>
              </div>

              <div>
                <div className="font-medium mb-1">Logical operators:</div>
                <div className="font-mono">
                  <span className="font-semibold">and</span>, <span className="font-semibold">or</span> - Use parentheses () to group conditions
                </div>
                <div className="text-[11px] mt-0.5 italic">
                  Example: (price &gt; 5 and price &lt; 10) or status = active
                </div>
              </div>

              <div>
                <div className="font-medium mb-1">Tips:</div>
                <div className="text-[11px] space-y-0.5">
                  <div>• Use <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-semibold">↑</kbd> <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-semibold">↓</kbd> arrows to navigate column suggestions</div>
                  <div>• Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-semibold">Enter</kbd> to select a column or apply filter</div>
                  <div>• Start typing to filter column suggestions</div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={clearAllFilters}
              disabled={!hasActiveFilters}
            >
              Clear filters
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={applyFilters}
              disabled={!filterText.trim()}
            >
              Apply filter
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

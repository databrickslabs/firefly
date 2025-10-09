"use client";

import * as React from "react";
import { Table } from "@tanstack/react-table";
import { Settings2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ColumnToggleProps<TData> {
  table: Table<TData>;
}

export function ColumnToggle<TData>({ table }: ColumnToggleProps<TData>) {
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const columns = table.getAllColumns().filter((column) => column.getCanHide());

  const filteredColumns = React.useMemo(() => {
    if (!search) return columns;
    return columns.filter((column) =>
      column.id.toLowerCase().includes(search.toLowerCase())
    );
  }, [columns, search]);

  const visibleCount = columns.filter((col) => col.getIsVisible()).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 text-xs"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Columns
          {visibleCount < columns.length && (
            <span className="ml-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium">
              {visibleCount}/{columns.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="end">
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-semibold">Toggle columns</div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Search */}
          <div className="px-3">
            <Input
              placeholder="Search for column"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Column list */}
          <div className="max-h-[300px] overflow-y-auto px-3 pb-3">
            <div className="space-y-2">
              {filteredColumns.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No columns found
                </div>
              ) : (
                filteredColumns.map((column) => {
                  const isVisible = column.getIsVisible();
                  return (
                    <div
                      key={column.id}
                      className="flex items-center space-x-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`column-${column.id}`}
                        checked={isVisible}
                        onCheckedChange={(checked) =>
                          column.toggleVisibility(!!checked)
                        }
                      />
                      <Label
                        htmlFor={`column-${column.id}`}
                        className="flex-1 text-xs font-normal cursor-pointer"
                      >
                        {column.id}
                      </Label>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer actions */}
          {columns.length > 0 && (
            <div className="border-t px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={() => {
                  table.toggleAllColumnsVisible(true);
                }}
              >
                Show all columns
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Warehouse {
  id: string;
  name: string;
  state: "RUNNING" | "STOPPED" | "STARTING" | "STOPPING" | "DELETED";
  cluster_size: string;
  num_clusters?: number;
  warehouse_type?: string;
}

interface WarehousesResponse {
  warehouses: Warehouse[];
}

interface WarehouseSelectorProps {
  value?: string;
  onValueChange: (warehouseId: string) => void;
  refreshTrigger?: number; // Add trigger prop to force refresh on query execution
  onWarehouseStateChange?: (state: Warehouse["state"] | undefined) => void; // Callback for state changes
}

export function WarehouseSelector({ value, onValueChange, refreshTrigger, onWarehouseStateChange }: WarehouseSelectorProps) {
  const [open, setOpen] = React.useState(false);

  const { data: warehousesData, isLoading, refetch } = useQuery<WarehousesResponse>({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/warehouses");
      if (!response.ok) {
        throw new Error("Failed to fetch warehouses");
      }
      return response.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Refresh warehouses whenever refreshTrigger changes (when a query is executed)
  React.useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      refetch();
    }
  }, [refreshTrigger, refetch]);

  const warehouses = warehousesData?.warehouses || [];
  const selectedWarehouse = warehouses.find((w) => w.id === value);

  // Notify parent of warehouse state changes
  React.useEffect(() => {
    onWarehouseStateChange?.(selectedWarehouse?.state);
  }, [selectedWarehouse?.state, onWarehouseStateChange]);

  const getStateBadgeColor = (state: Warehouse["state"]) => {
    switch (state) {
      case "RUNNING":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "STOPPED":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
      case "STARTING":
      case "STOPPING":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "DELETED":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[400px] justify-between"
        >
          {selectedWarehouse ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Database className="h-4 w-4 shrink-0" />
              <span className="truncate">{selectedWarehouse.name}</span>
              <span
                className={cn(
                  "ml-auto px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                  getStateBadgeColor(selectedWarehouse.state)
                )}
              >
                {selectedWarehouse.state}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {isLoading ? "Loading warehouses..." : "Select warehouse..."}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Search warehouses..." />
          <CommandList>
            <CommandEmpty>No warehouse found.</CommandEmpty>
            <CommandGroup>
              {warehouses.map((warehouse) => (
                <CommandItem
                  key={warehouse.id}
                  value={warehouse.name}
                  onSelect={() => {
                    onValueChange(warehouse.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === warehouse.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Database className="h-4 w-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{warehouse.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {warehouse.cluster_size}
                        {warehouse.num_clusters && ` • ${warehouse.num_clusters} cluster${warehouse.num_clusters > 1 ? 's' : ''}`}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "ml-auto px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
                        getStateBadgeColor(warehouse.state)
                      )}
                    >
                      {warehouse.state}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

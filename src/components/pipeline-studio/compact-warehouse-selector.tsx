"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Database, Loader2 } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { loadWarehouse, saveWarehouse } from "@/lib/warehouse-storage";

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

interface CompactWarehouseSelectorProps {
  className?: string;
  onWarehouseChange?: (warehouseId: string | null) => void;
}

export function CompactWarehouseSelector({
  className,
  onWarehouseChange,
}: CompactWarehouseSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [warehouseId, setWarehouseId] = React.useState<string | null>(null);

  // Load warehouse from storage on mount
  React.useEffect(() => {
    const stored = loadWarehouse();
    if (stored) {
      setWarehouseId(stored.warehouseId);
    }
  }, []);

  const { data: warehousesData, isLoading } = useQuery<WarehousesResponse>({
    queryKey: ["sso-spn-warehouses"],
    queryFn: async () => {
      const response = await fetch("/api/sso-spn/warehouses");
      if (!response.ok) {
        throw new Error("Failed to fetch warehouses");
      }
      return response.json();
    },
    refetchInterval: 15000, // Refresh every 15 seconds
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const warehouses = warehousesData?.warehouses || [];
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);

  const handleSelect = (id: string) => {
    setWarehouseId(id);
    saveWarehouse({ warehouseId: id, timestamp: Date.now() });
    onWarehouseChange?.(id);
    setOpen(false);
  };

  const getStateBadgeColor = (state: Warehouse["state"]) => {
    switch (state) {
      case "RUNNING":
        return "bg-green-500";
      case "STOPPED":
        return "bg-gray-400";
      case "STARTING":
      case "STOPPING":
        return "bg-yellow-500";
      case "DELETED":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  const getStateTextColor = (state: Warehouse["state"]) => {
    switch (state) {
      case "RUNNING":
        return "text-green-600";
      case "STOPPED":
        return "text-gray-500";
      case "STARTING":
      case "STOPPING":
        return "text-yellow-600";
      case "DELETED":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                "h-8 justify-between gap-1.5 px-2 text-xs font-normal min-w-[140px] max-w-[200px]",
                className
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
                  <span className="text-slate-500 truncate">Loading...</span>
                </>
              ) : selectedWarehouse ? (
                <>
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        getStateBadgeColor(selectedWarehouse.state)
                      )}
                    />
                    <span className="truncate">{selectedWarehouse.name}</span>
                  </div>
                </>
              ) : (
                <>
                  <Database className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="text-slate-500 truncate">Select warehouse</span>
                </>
              )}
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {selectedWarehouse ? (
            <div className="text-xs">
              <div className="font-medium">{selectedWarehouse.name}</div>
              <div className={cn("text-[10px]", getStateTextColor(selectedWarehouse.state))}>
                {selectedWarehouse.state} • {selectedWarehouse.cluster_size}
              </div>
            </div>
          ) : (
            <p>Select a warehouse for sampling</p>
          )}
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search warehouses..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs py-4">No warehouse found.</CommandEmpty>
            <CommandGroup>
              {warehouses.map((warehouse) => (
                <CommandItem
                  key={warehouse.id}
                  value={warehouse.name}
                  onSelect={() => handleSelect(warehouse.id)}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      warehouseId === warehouse.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        getStateBadgeColor(warehouse.state)
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{warehouse.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {warehouse.cluster_size}
                        {warehouse.num_clusters &&
                          ` • ${warehouse.num_clusters} cluster${
                            warehouse.num_clusters > 1 ? "s" : ""
                          }`}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-medium shrink-0",
                        getStateTextColor(warehouse.state)
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

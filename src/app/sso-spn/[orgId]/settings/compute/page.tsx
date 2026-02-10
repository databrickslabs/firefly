"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Cpu,
  Server,
  Database,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Types matching the Neon DB schema
interface ManagedWarehouse {
  id: number;
  organizationId: string;
  warehouseId: string;
  name: string;
  clusterSize: string;
  warehouseType: string;
  enableServerlessCompute: boolean;
  enablePhoton: boolean;
  autoStopMins: number;
  minNumClusters: number;
  maxNumClusters: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WarehouseListResponse {
  warehouses: ManagedWarehouse[];
  defaultWarehouseSize: string;
  accessGroup: string | null;
}

const CLUSTER_SIZES = [
  "2X-Small",
  "X-Small",
  "Small",
  "Medium",
  "Large",
  "X-Large",
  "2X-Large",
  "3X-Large",
  "4X-Large",
];

export default function ComputeSettingsPage() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Create warehouse form state - defaults set after data loads
  const [newWarehouse, setNewWarehouse] = useState({
    name: "",
    cluster_size: "",
    auto_stop_mins: 120,
    max_num_clusters: 1,
  });

  // Fetch warehouses from Neon
  const {
    data: warehousesResponse,
    isLoading: warehousesLoading,
    refetch: refetchWarehouses,
    isRefetching: warehousesRefetching,
  } = useQuery<{ data: WarehouseListResponse }>({
    queryKey: ["compute-warehouses"],
    queryFn: async () => {
      const response = await fetch("/api/sso-spn/compute/warehouses");
      if (!response.ok) throw new Error("Failed to fetch warehouses");
      return response.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Create warehouse mutation
  const createWarehouseMutation = useMutation({
    mutationFn: async (warehouseConfig: {
      name: string;
      cluster_size: string;
      auto_stop_mins: number;
      max_num_clusters: number;
    }) => {
      const response = await fetch("/api/sso-spn/compute/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warehouseConfig),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create warehouse");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Warehouse created successfully");
      setCreateDialogOpen(false);
      setNewWarehouse({
        name: "",
        cluster_size: "",
        auto_stop_mins: 120,
        max_num_clusters: 1,
      });
      queryClient.invalidateQueries({ queryKey: ["compute-warehouses"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Set default warehouse mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (warehouseId: string) => {
      const response = await fetch("/api/sso-spn/compute/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to set default warehouse");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Default warehouse updated");
      queryClient.invalidateQueries({ queryKey: ["compute-warehouses"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete warehouse mutation
  const deleteWarehouseMutation = useMutation({
    mutationFn: async (warehouseId: string) => {
      const response = await fetch("/api/sso-spn/compute/warehouses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to remove warehouse");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Warehouse removed");
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["compute-warehouses"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const warehouses = [...(warehousesResponse?.data?.warehouses || [])].sort((a, b) => a.name.localeCompare(b.name));
  const defaultWarehouseSize = warehousesResponse?.data?.defaultWarehouseSize || "Small";
  const accessGroup = warehousesResponse?.data?.accessGroup || null;
  const defaultWarehouse = warehouses.find((w) => w.isDefault);

  return (
    <div className="p-8">
      <div className="max-w-4xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Compute</h1>
          <p className="text-muted-foreground">
            Manage clusters and SQL warehouses for your organization.
          </p>
        </div>

        {/* Clusters - Coming Soon */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-emerald-600" />
              Clusters
            </CardTitle>
            <CardDescription>
              All-purpose compute clusters for notebooks and jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Server className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Cluster Management</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Configure default cluster policies, autoscaling limits, and compute
                quotas for your organization.
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </div>
          </CardContent>
        </Card>

        {/* SQL Warehouses */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-emerald-600" />
                  SQL Warehouses
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Serverless or classic SQL compute for queries and dashboards
                </CardDescription>
                <p className="text-xs text-muted-foreground mt-1">
                  Default warehouse size: <span className="font-mono font-medium">{defaultWarehouseSize}</span>
                </p>
                {accessGroup && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Access group: <span className="font-mono font-medium">{accessGroup}</span>
                  </p>
                )}
              </div>
              {warehouses.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchWarehouses()}
                    disabled={warehousesLoading || warehousesRefetching}
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4 mr-2",
                        warehousesRefetching && "animate-spin"
                      )}
                    />
                    Refresh
                  </Button>
                  <Button size="sm" onClick={() => {
                    setNewWarehouse({
                      name: "",
                      cluster_size: defaultWarehouseSize,
                      auto_stop_mins: 120,
                      max_num_clusters: 1,
                    });
                    setCreateDialogOpen(true);
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Warehouse
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {warehousesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="h-6 w-6 text-emerald-600" />
              </div>
            ) : warehouses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Database className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No SQL Warehouses</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-4">
                  Create a SQL warehouse to get started with queries and dashboards.
                </p>
                <Button onClick={() => {
                  setNewWarehouse({
                    name: "",
                    cluster_size: defaultWarehouseSize,
                    auto_stop_mins: 120,
                    max_num_clusters: 1,
                  });
                  setCreateDialogOpen(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Warehouse
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Default warehouse indicator */}
                {defaultWarehouse && (
                  <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-emerald-600 fill-emerald-600" />
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        Default Warehouse: {defaultWarehouse.name}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({defaultWarehouse.warehouseId})
                      </span>
                    </div>
                  </div>
                )}

                {/* Warehouses table */}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Warehouse ID</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Auto Stop</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warehouses.map((warehouse) => (
                        <TableRow key={warehouse.warehouseId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{warehouse.name}</span>
                              {warehouse.isDefault && (
                                <Star className="h-3.5 w-3.5 text-emerald-600 fill-emerald-600" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground">
                              {warehouse.warehouseId}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {warehouse.clusterSize}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {warehouse.enableServerlessCompute ? "Serverless" : warehouse.warehouseType === "PRO" ? "Pro" : "Classic"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {warehouse.autoStopMins === 0
                              ? "Never"
                              : `${warehouse.autoStopMins} min`}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!warehouse.isDefault && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setDefaultMutation.mutate(warehouse.warehouseId)
                                  }
                                  disabled={setDefaultMutation.isPending}
                                >
                                  <Star className="h-3.5 w-3.5 mr-1" />
                                  Set Default
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => setDeleteConfirmId(warehouse.warehouseId)}
                                disabled={deleteWarehouseMutation.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compute Policies - Coming Soon */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-emerald-600" />
              Compute Policies
            </CardTitle>
            <CardDescription>
              Define and enforce compute resource policies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Cpu className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Policy Management</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Create policies to control instance types, spot instances, and
                resource limits.
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Warehouse Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create SQL Warehouse</DialogTitle>
            <DialogDescription>
              Creates a serverless Pro warehouse in Databricks and registers it for this organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="warehouse-name">Name</Label>
              <Input
                id="warehouse-name"
                placeholder="My Warehouse"
                value={newWarehouse.name}
                onChange={(e) =>
                  setNewWarehouse((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cluster Size</Label>
                <Select
                  value={newWarehouse.cluster_size || defaultWarehouseSize}
                  onValueChange={(value) =>
                    setNewWarehouse((prev) => ({ ...prev, cluster_size: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLUSTER_SIZES.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Default: {defaultWarehouseSize}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-stop">Auto Stop (minutes)</Label>
                <Input
                  id="auto-stop"
                  type="number"
                  min={0}
                  value={newWarehouse.auto_stop_mins}
                  onChange={(e) =>
                    setNewWarehouse((prev) => ({
                      ...prev,
                      auto_stop_mins: parseInt(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  0 = never auto-stop, min 10
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-clusters">Max Clusters</Label>
              <Input
                id="max-clusters"
                type="number"
                min={1}
                max={40}
                value={newWarehouse.max_num_clusters}
                onChange={(e) =>
                  setNewWarehouse((prev) => ({
                    ...prev,
                    max_num_clusters: parseInt(e.target.value) || 1,
                  }))
                }
              />
            </div>

            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-xs text-muted-foreground">
                Warehouse will be created as <strong>Serverless Pro</strong> with Photon enabled.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createWarehouseMutation.mutate({
                ...newWarehouse,
                cluster_size: newWarehouse.cluster_size || defaultWarehouseSize,
              })}
              disabled={
                !newWarehouse.name.trim() || createWarehouseMutation.isPending
              }
            >
              {createWarehouseMutation.isPending ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  Creating...
                </>
              ) : (
                "Create Warehouse"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Warehouse</DialogTitle>
            <DialogDescription>
              This will delete the warehouse in Databricks and remove the record from this organization.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId) {
                  deleteWarehouseMutation.mutate(deleteConfirmId);
                }
              }}
              disabled={deleteWarehouseMutation.isPending}
            >
              {deleteWarehouseMutation.isPending ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  Removing...
                </>
              ) : (
                "Remove"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

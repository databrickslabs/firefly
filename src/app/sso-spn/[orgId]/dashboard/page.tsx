"use client";

import { useEffect, useState } from "react";
import { useSession, authClient } from "@/lib/auth-client";
import { Building2 } from "lucide-react";

interface Warehouse {
  id: string;
  name: string;
  state: string;
  cluster_size: string;
  min_num_clusters?: number;
  max_num_clusters?: number;
  auto_stop_mins?: number;
  creator_name?: string;
  enable_photon?: boolean;
  enable_serverless_compute?: boolean;
  warehouse_type?: string;
}

interface WarehouseListResponse {
  warehouses?: Warehouse[];
}

export default function SsoSpnDashboard() {
  const { data: session, isPending } = useSession();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debug session
  useEffect(() => {
    console.log("=== SPN DASHBOARD DEBUG ===");
    console.log("Dashboard - Session:", session);
    console.log("Dashboard - Is Pending:", isPending);
    console.log("Dashboard - Active Org:", activeOrg);

    // Check if redirecting needed
    if (!isPending && !session) {
      console.log("No session found - should redirect to login");
    }
  }, [session, isPending, activeOrg]);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch SQL warehouses using SPN token
        const response = await fetch("/api/sso-spn/warehouses");

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch SQL warehouses");
        }

        const data: WarehouseListResponse = await response.json();
        setWarehouses(data.warehouses || []);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    if (!isPending && session) {
      fetchData();
    }
  }, [session, isPending]);

  const getStateColor = (state: string) => {
    switch (state.toUpperCase()) {
      case "RUNNING":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "PENDING":
      case "RESTARTING":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "TERMINATED":
      case "TERMINATING":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
      case "ERROR":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Organization Context */}
        {activeOrg && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                  Viewing: {activeOrg.name} (SPN Access)
                </p>
                {(activeOrg as { workspaceUrl?: string }).workspaceUrl && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-mono">
                    {(activeOrg as { workspaceUrl?: string }).workspaceUrl}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SQL Warehouses Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">SQL Warehouses</h2>
            {!loading && !error && (
              <span className="text-sm text-muted-foreground">
                {warehouses.length} {warehouses.length === 1 ? "warehouse" : "warehouses"} found
              </span>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center p-12 border-2 border-dashed rounded-xl">
              <div className="text-center space-y-4">
                <div className="animate-spin w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-muted-foreground">Loading SQL warehouses...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-6 bg-red-100 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-800 rounded-xl">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-200">Failed to load SQL warehouses</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && warehouses.length === 0 && (
            <div className="p-12 border-2 border-dashed rounded-xl text-center space-y-4">
              <svg className="w-16 h-16 mx-auto text-muted-foreground opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              <div>
                <p className="text-lg font-semibold">No SQL warehouses found</p>
                <p className="text-sm text-muted-foreground">
                  Create your first SQL warehouse in the Databricks workspace
                </p>
              </div>
            </div>
          )}

          {/* Warehouses Grid */}
          {!loading && !error && warehouses.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {warehouses.map((warehouse) => (
                <div
                  key={warehouse.id}
                  className="p-6 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl bg-white dark:bg-slate-900 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
                >
                  <div className="space-y-4">
                    {/* Warehouse Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-foreground">
                          {warehouse.name}
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono mt-1">
                          {warehouse.id}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full ${getStateColor(
                          warehouse.state
                        )}`}
                      >
                        {warehouse.state}
                      </span>
                    </div>

                    {/* Warehouse Details */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        <span className="font-medium">Size:</span>
                        <span>{warehouse.cluster_size}</span>
                      </div>
                      {warehouse.warehouse_type && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          <span className="font-medium">Type:</span>
                          <span className="capitalize">{warehouse.warehouse_type}</span>
                        </div>
                      )}
                      {(warehouse.min_num_clusters !== undefined || warehouse.max_num_clusters !== undefined) && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                          </svg>
                          <span className="font-medium">Clusters:</span>
                          <span>
                            {warehouse.min_num_clusters || 0}-{warehouse.max_num_clusters || 0}
                          </span>
                        </div>
                      )}
                      {warehouse.auto_stop_mins !== undefined && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-medium">Auto-stop:</span>
                          <span>{warehouse.auto_stop_mins} min</span>
                        </div>
                      )}
                      {warehouse.enable_photon && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">Photon Enabled</span>
                        </div>
                      )}
                      {warehouse.enable_serverless_compute && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                          </svg>
                          <span className="font-medium text-teal-600 dark:text-teal-400">Serverless</span>
                        </div>
                      )}
                      {warehouse.creator_name && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="font-medium">Creator:</span>
                          <span>{warehouse.creator_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

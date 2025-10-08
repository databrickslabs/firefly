"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";

interface Cluster {
  cluster_id: string;
  cluster_name: string;
  state: string;
  spark_version: string;
  node_type_id: string;
  driver_node_type_id?: string;
  num_workers?: number;
  autoscale?: {
    min_workers: number;
    max_workers: number;
  };
  creator_user_name?: string;
  start_time?: number;
  state_message?: string;
}

interface ClusterListResponse {
  clusters?: Cluster[];
}

export default function DatabricksIdpDashboard() {
  const { data: session, isPending } = useSession();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClusters() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/databricks/clusters");

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch clusters");
        }

        const data: ClusterListResponse = await response.json();
        setClusters(data.clusters || []);
      } catch (err) {
        console.error("Error fetching clusters:", err);
        setError(err instanceof Error ? err.message : "Failed to load clusters");
      } finally {
        setLoading(false);
      }
    }

    if (!isPending && session) {
      fetchClusters();
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
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Clusters Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Compute Clusters</h2>
            {!loading && !error && (
              <span className="text-sm text-muted-foreground">
                {clusters.length} {clusters.length === 1 ? "cluster" : "clusters"} found
              </span>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center p-12 border-2 border-dashed rounded-xl">
              <div className="text-center space-y-4">
                <div className="animate-spin w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-muted-foreground">Loading clusters...</p>
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
                  <p className="font-semibold text-red-800 dark:text-red-200">Failed to load clusters</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && clusters.length === 0 && (
            <div className="p-12 border-2 border-dashed rounded-xl text-center space-y-4">
              <svg className="w-16 h-16 mx-auto text-muted-foreground opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              <div>
                <p className="text-lg font-semibold">No clusters found</p>
                <p className="text-sm text-muted-foreground">
                  Create your first cluster in the Databricks workspace
                </p>
              </div>
            </div>
          )}

          {/* Clusters Grid */}
          {!loading && !error && clusters.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {clusters.map((cluster) => (
                <div
                  key={cluster.cluster_id}
                  className="p-6 border-2 border-purple-200 dark:border-purple-800 rounded-xl bg-white dark:bg-slate-900 shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
                >
                  <div className="space-y-4">
                    {/* Cluster Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-foreground">
                          {cluster.cluster_name}
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono mt-1">
                          {cluster.cluster_id}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full ${getStateColor(
                          cluster.state
                        )}`}
                      >
                        {cluster.state}
                      </span>
                    </div>

                    {/* Cluster Details */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="font-medium">Spark:</span>
                        <span>{cluster.spark_version}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        <span className="font-medium">Node:</span>
                        <span>{cluster.node_type_id}</span>
                      </div>
                      {cluster.autoscale ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                          </svg>
                          <span className="font-medium">Workers:</span>
                          <span>
                            {cluster.autoscale.min_workers}-{cluster.autoscale.max_workers} (autoscaling)
                          </span>
                        </div>
                      ) : cluster.num_workers !== undefined ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span className="font-medium">Workers:</span>
                          <span>{cluster.num_workers}</span>
                        </div>
                      ) : null}
                      {cluster.creator_user_name && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="font-medium">Creator:</span>
                          <span>{cluster.creator_user_name}</span>
                        </div>
                      )}
                    </div>

                    {/* State Message */}
                    {cluster.state_message && (
                      <div className="pt-3 border-t">
                        <p className="text-xs text-muted-foreground">{cluster.state_message}</p>
                      </div>
                    )}
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

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateDestinationSQL, type FireflyMetadata } from "@/lib/pipeline-to-sql";
import { loadWarehouse } from "@/lib/warehouse-storage";
import type { PipelineNode } from "@/stores/pipeline-store";
import type { Edge } from "@xyflow/react";

interface DeployAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: PipelineNode[];
  edges: Edge[];
  onLog: (level: "info" | "warn" | "error" | "success", message: string) => void;
  fireflyMetadata?: FireflyMetadata;
}

interface DeploymentNode {
  id: string;
  label: string;
  tableName: string; // Full table path: catalog.schema.table
  subtype: string;
  dependsOn: string[]; // IDs of destinations this depends on
  status: "pending" | "running" | "success" | "error";
  error?: string;
  startTime?: number;
  endTime?: number;
}

type DeploymentWave = DeploymentNode[];

function formatElapsedTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function DeployAllDialog({
  open,
  onOpenChange,
  nodes,
  edges,
  onLog,
  fireflyMetadata,
}: DeployAllDialogProps) {
  const [deploymentNodes, setDeploymentNodes] = useState<DeploymentNode[]>([]);
  const [deploymentWaves, setDeploymentWaves] = useState<DeploymentWave[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [currentWaveIndex, setCurrentWaveIndex] = useState(-1);
  const [overallStartTime, setOverallStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get all destination nodes (MVs and views) - memoized to avoid infinite loops
  const destinationNodes = useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.data.category === "destination" &&
          (n.data.subtype === "materialized-view" || n.data.subtype === "view")
      ),
    [nodes]
  );

  // Build dependency graph and deployment order when dialog opens
  useEffect(() => {
    if (!open) return;

    // Build a map of node ID to upstream destination IDs
    const getUpstreamDestinations = (nodeId: string): Set<string> => {
      const visited = new Set<string>();
      const upstreamDests = new Set<string>();
      const queue = [nodeId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        // Find incoming edges
        const incoming = edges.filter((e) => e.target === currentId);
        for (const edge of incoming) {
          const sourceNode = nodes.find((n) => n.id === edge.source);
          if (sourceNode) {
            // If source is a destination (MV/view), it's a dependency
            if (
              sourceNode.data.category === "destination" &&
              (sourceNode.data.subtype === "materialized-view" ||
                sourceNode.data.subtype === "view")
            ) {
              upstreamDests.add(sourceNode.id);
              // Don't traverse further - we stop at destinations
            } else {
              // Continue traversing
              queue.push(edge.source);
            }
          }
        }
      }

      return upstreamDests;
    };

    // Build deployment nodes with dependencies
    const depNodes: DeploymentNode[] = destinationNodes.map((node) => {
      const upstreamDests = getUpstreamDestinations(node.id);
      // Extract table name from config
      const config = node.data.config as { catalog?: string; schema?: string; table?: string };
      const tableName = config.catalog && config.schema && config.table
        ? `${config.catalog}.${config.schema}.${config.table}`
        : "(not configured)";
      return {
        id: node.id,
        label: node.data.label,
        tableName,
        subtype: node.data.subtype,
        dependsOn: Array.from(upstreamDests),
        status: "pending",
      };
    });

    // Topological sort into waves (parallel execution within each wave)
    const waves: DeploymentWave[] = [];
    const deployed = new Set<string>();
    const remaining = new Set(depNodes.map((n) => n.id));

    while (remaining.size > 0) {
      // Find all nodes whose dependencies are all deployed
      const wave: DeploymentNode[] = [];
      for (const node of depNodes) {
        if (remaining.has(node.id)) {
          const allDepsDeployed = node.dependsOn.every((depId) =>
            deployed.has(depId)
          );
          if (allDepsDeployed) {
            wave.push(node);
          }
        }
      }

      if (wave.length === 0 && remaining.size > 0) {
        // Circular dependency or error - add remaining as last wave
        for (const node of depNodes) {
          if (remaining.has(node.id)) {
            wave.push(node);
          }
        }
      }

      for (const node of wave) {
        remaining.delete(node.id);
        deployed.add(node.id);
      }

      if (wave.length > 0) {
        waves.push(wave);
      }
    }

    setDeploymentNodes(depNodes);
    setDeploymentWaves(waves);
    setCurrentWaveIndex(-1);
    setIsDeploying(false);
    setOverallStartTime(null);
    setElapsedTime(0);
  }, [open, nodes, edges, destinationNodes]);

  // Update elapsed time during deployment
  useEffect(() => {
    if (isDeploying && overallStartTime) {
      intervalRef.current = setInterval(() => {
        setElapsedTime(Date.now() - overallStartTime);
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isDeploying, overallStartTime]);

  // Deploy a single node
  const deploySingleNode = useCallback(
    async (nodeId: string): Promise<boolean> => {
      const warehouseData = loadWarehouse();
      if (!warehouseData?.warehouseId) {
        throw new Error("No warehouse selected");
      }

      // Update status to running
      setDeploymentNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, status: "running", startTime: Date.now() } : n
        )
      );

      // Generate SQL with firefly metadata for table properties
      const sqlResult = generateDestinationSQL(
        nodeId,
        nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
        edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        })),
        fireflyMetadata
      );

      if (!sqlResult.isValid) {
        const errorMsg = sqlResult.errors.join("; ");
        setDeploymentNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? { ...n, status: "error", error: errorMsg, endTime: Date.now() }
              : n
          )
        );
        return false;
      }

      try {
        // Execute the CREATE statement
        const executeResponse = await fetch("/api/databricks/sql/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            warehouse_id: warehouseData.warehouseId,
            statement: sqlResult.sql,
            wait_timeout: "50s",
            on_wait_timeout: "CONTINUE",
          }),
        });

        if (!executeResponse.ok) {
          const errorData = await executeResponse.json();
          throw new Error(errorData.error || "Failed to deploy");
        }

        const executeData = await executeResponse.json();
        const statementId = executeData.statement_id;

        // Check if we got immediate success
        if (executeData.status?.state === "SUCCEEDED") {
          setDeploymentNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId ? { ...n, status: "success", endTime: Date.now() } : n
            )
          );
          return true;
        }

        // Poll for completion
        const maxPolls = 120;
        let pollCount = 0;

        while (pollCount < maxPolls) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          pollCount++;

          const statusResponse = await fetch(
            `/api/databricks/sql/status/${statementId}`
          );

          if (!statusResponse.ok) {
            const errorData = await statusResponse.json();
            throw new Error(errorData.error || "Failed to get query status");
          }

          const statusData = await statusResponse.json();

          switch (statusData.status.state) {
            case "SUCCEEDED":
              setDeploymentNodes((prev) =>
                prev.map((n) =>
                  n.id === nodeId
                    ? { ...n, status: "success", endTime: Date.now() }
                    : n
                )
              );
              return true;

            case "FAILED":
              throw new Error(
                statusData.status.error?.message || "Deploy failed"
              );

            case "CANCELED":
              throw new Error("Deploy was cancelled");

            case "CLOSED":
              throw new Error("Deploy session closed");

            case "PENDING":
            case "RUNNING":
              // Continue polling
              continue;
          }
        }

        throw new Error("Deploy timed out after 120 seconds");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setDeploymentNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? { ...n, status: "error", error: errorMessage, endTime: Date.now() }
              : n
          )
        );
        return false;
      }
    },
    [nodes, edges, fireflyMetadata]
  );

  // Start deployment
  const handleStartDeploy = useCallback(async () => {
    const warehouseData = loadWarehouse();
    if (!warehouseData?.warehouseId) {
      onLog("error", "No warehouse selected. Please select a warehouse first.");
      return;
    }

    setIsDeploying(true);
    setOverallStartTime(Date.now());
    onLog("info", `Starting deployment of ${destinationNodes.length} destination(s)...`);

    let successCount = 0;
    let errorCount = 0;

    // Deploy wave by wave
    for (let waveIdx = 0; waveIdx < deploymentWaves.length; waveIdx++) {
      setCurrentWaveIndex(waveIdx);
      const wave = deploymentWaves[waveIdx];

      onLog(
        "info",
        `Wave ${waveIdx + 1}/${deploymentWaves.length}: Deploying ${wave.length} destination(s) in parallel...`
      );

      // Deploy all nodes in this wave in parallel
      const results = await Promise.allSettled(
        wave.map((node) => deploySingleNode(node.id))
      );

      // Count results
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          successCount++;
        } else {
          errorCount++;
        }
      }
    }

    setIsDeploying(false);
    setCurrentWaveIndex(-1);

    const totalTime = Date.now() - (overallStartTime || Date.now());
    if (errorCount === 0) {
      onLog(
        "success",
        `Deployed ${successCount} destination(s) in ${formatElapsedTime(totalTime)}`
      );
    } else if (successCount > 0) {
      onLog(
        "warn",
        `Deployed ${successCount} destination(s), ${errorCount} failed in ${formatElapsedTime(totalTime)}`
      );
    } else {
      onLog(
        "error",
        `Failed to deploy all ${errorCount} destination(s)`
      );
    }
  }, [deploymentWaves, destinationNodes.length, deploySingleNode, onLog, overallStartTime]);

  // Get node status icon
  const getStatusIcon = (status: DeploymentNode["status"]) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-slate-400" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const allComplete = deploymentNodes.every(
    (n) => n.status === "success" || n.status === "error"
  );
  const hasErrors = deploymentNodes.some((n) => n.status === "error");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Deploy All Destinations
          </DialogTitle>
          <DialogDescription>
            {deploymentWaves.length > 1
              ? `${destinationNodes.length} destinations will be deployed in ${deploymentWaves.length} waves based on dependencies.`
              : `${destinationNodes.length} destination(s) will be deployed.`}
          </DialogDescription>
        </DialogHeader>

        {/* Elapsed time */}
        {(isDeploying || allComplete) && overallStartTime && (
          <div className="flex items-center justify-between text-sm text-slate-600 border-b pb-2">
            <span>Total elapsed time:</span>
            <span className="font-mono font-medium">
              {formatElapsedTime(allComplete ? elapsedTime : Date.now() - overallStartTime)}
            </span>
          </div>
        )}

        {/* Deployment waves */}
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-4">
            {deploymentWaves.map((wave, waveIdx) => (
              <div key={waveIdx} className="space-y-2">
                <div
                  className={cn(
                    "text-xs font-medium uppercase tracking-wide",
                    currentWaveIndex === waveIdx
                      ? "text-blue-600"
                      : currentWaveIndex > waveIdx
                        ? "text-green-600"
                        : "text-slate-400"
                  )}
                >
                  Wave {waveIdx + 1}
                  {wave.length > 1 && " (parallel)"}
                  {currentWaveIndex === waveIdx && " — deploying..."}
                </div>

                {wave.map((node) => {
                  const depNode = deploymentNodes.find((n) => n.id === node.id);
                  if (!depNode) return null;

                  return (
                    <div
                      key={node.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-md border",
                        depNode.status === "running" && "border-blue-200 bg-blue-50",
                        depNode.status === "success" && "border-green-200 bg-green-50",
                        depNode.status === "error" && "border-red-200 bg-red-50",
                        depNode.status === "pending" && "border-slate-200 bg-slate-50"
                      )}
                    >
                      {getStatusIcon(depNode.status)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {depNode.label}
                        </div>
                        <div className="text-xs text-slate-600 font-mono break-all">
                          {depNode.tableName}
                        </div>
                        <div className="text-xs text-slate-400 capitalize">
                          {depNode.subtype.replace("-", " ")}
                        </div>
                        {depNode.dependsOn.length > 0 && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            <span className="flex items-center gap-1">
                              <ArrowRight className="h-3 w-3 flex-shrink-0" />
                              Depends on:
                            </span>
                            <span className="font-mono break-all ml-4">
                              {depNode.dependsOn
                                .map((depId) => {
                                  const depDest = deploymentNodes.find(
                                    (n) => n.id === depId
                                  );
                                  return depDest?.tableName || depId;
                                })
                                .join(", ")}
                            </span>
                          </div>
                        )}
                        {depNode.error && (
                          <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {depNode.error}
                          </div>
                        )}
                      </div>
                      {depNode.status === "running" && depNode.startTime && (
                        <div className="text-xs font-mono text-blue-600">
                          {formatElapsedTime(Date.now() - depNode.startTime)}
                        </div>
                      )}
                      {(depNode.status === "success" || depNode.status === "error") &&
                        depNode.startTime &&
                        depNode.endTime && (
                          <div
                            className={cn(
                              "text-xs font-mono",
                              depNode.status === "success"
                                ? "text-green-600"
                                : "text-red-600"
                            )}
                          >
                            {formatElapsedTime(depNode.endTime - depNode.startTime)}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          {!isDeploying && !allComplete && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleStartDeploy} disabled={destinationNodes.length === 0}>
                <Rocket className="h-4 w-4 mr-2" />
                Start Deploy
              </Button>
            </>
          )}
          {isDeploying && (
            <Button variant="outline" disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Deploying...
            </Button>
          )}
          {allComplete && (
            <Button onClick={() => onOpenChange(false)}>
              {hasErrors ? "Close" : "Done"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cpu, Server, Database } from "lucide-react";

export default function ComputeSettingsPage() {
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

        {/* Clusters */}
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
                Configure default cluster policies, autoscaling limits, and compute quotas for your organization.
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </div>
          </CardContent>
        </Card>

        {/* SQL Warehouses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-600" />
              SQL Warehouses
            </CardTitle>
            <CardDescription>
              Serverless or classic SQL compute for queries and dashboards
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Database className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">SQL Warehouse Configuration</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Set default warehouse sizes, auto-stop timers, and query routing rules.
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </div>
          </CardContent>
        </Card>

        {/* Compute Policies */}
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
                Create policies to control instance types, spot instances, and resource limits.
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { authClient } from "@/lib/auth-client";
import { Building2 } from "lucide-react";

export default function FederationDashboard() {
  const { data: activeOrg } = authClient.useActiveOrganization();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Organization Context */}
        {activeOrg && (
          <div className="p-4 bg-purple-50 dark:bg-purple-950/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                  Viewing: {activeOrg.name}
                </p>
                {(activeOrg as { workspaceUrl?: string }).workspaceUrl && (
                  <p className="text-xs text-purple-700 dark:text-purple-300 font-mono">
                    {(activeOrg as { workspaceUrl?: string }).workspaceUrl}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Federation Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="font-semibold mb-2">Workspaces</h3>
            <p className="text-sm text-muted-foreground">
              Manage your Databricks workspaces
            </p>
          </div>
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="font-semibold mb-2">Organizations</h3>
            <p className="text-sm text-muted-foreground">
              View and manage organizations
            </p>
          </div>
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="font-semibold mb-2">Settings</h3>
            <p className="text-sm text-muted-foreground">
              Configure your preferences
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useSession, authClient } from "@/lib/auth-client";
import { Building2 } from "lucide-react";
import { EmbeddedDashboard } from "@/components/embedded-dashboard";

/**
 * Page for displaying an embedded Databricks AI/BI dashboard.
 *
 * This page demonstrates embedding a Databricks dashboard using:
 * - Service principal authentication (M2M)
 * - Scoped OAuth tokens for secure browser access
 * - Row-level security via external viewer parameters
 */
export default function EmbeddedDashboardPage() {
  const { data: session, isPending } = useSession();
  const { data: activeOrg } = authClient.useActiveOrganization();

  // Generate external viewer ID and value
  // In production, these should be based on the actual user identity
  const externalViewerId = session?.user?.id || "anonymous-viewer";
  const externalValue = activeOrg?.id || "default-org";

  if (isPending) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="animate-spin w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4">
      {/* Organization Context */}
      {activeOrg && (
        <div className="flex-shrink-0 p-3 bg-purple-50 dark:bg-purple-950/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
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

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Embedded Dashboard</h2>
        <span className="text-sm text-muted-foreground">
          Powered by Databricks AI/BI (No Login Needed)
        </span>
      </div>

      {/* Dashboard Container - fills remaining space */}
      <div className="flex-1 min-h-0 border-2 border-purple-200 dark:border-purple-800 rounded-xl bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
        <EmbeddedDashboard
          externalViewerId={externalViewerId}
          externalValue={externalValue}
          className="h-full"
        />
      </div>
    </div>
  );
}

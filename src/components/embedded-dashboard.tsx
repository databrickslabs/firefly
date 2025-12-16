"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

interface EmbeddedDashboardProps {
  /**
   * External viewer ID used for row-level security and user identification.
   * This can be any unique identifier for the current user.
   */
  externalViewerId: string;
  /**
   * External value used for additional context in row-level security.
   * This value is passed to the dashboard for filtering/permissions.
   */
  externalValue: string;
  /**
   * Optional CSS class name for the container
   */
  className?: string;
}

interface EmbedTokenResponse {
  token: string;
  instanceUrl: string;
  workspaceId: string;
  dashboardId: string;
}

interface DatabricksDashboardClass {
  new (config: {
    instanceUrl: string;
    workspaceId: string;
    dashboardId: string;
    token: string;
    container: HTMLElement;
  }): {
    initialize: () => void;
    destroy?: () => void;
  };
}

// Extend the Window interface to include the Databricks SDK
declare global {
  interface Window {
    DatabricksDashboard?: DatabricksDashboardClass;
  }
}

const SDK_URL = "https://cdn.jsdelivr.net/npm/@databricks/aibi-client@0.0.0-alpha.7/+esm";

/**
 * EmbeddedDashboard component for rendering Databricks AI/BI dashboards.
 *
 * This component handles:
 * - Fetching a scoped OAuth token from the backend
 * - Loading the Databricks dashboard SDK from CDN
 * - Rendering the dashboard in a container
 *
 * Usage:
 * ```tsx
 * <EmbeddedDashboard
 *   externalViewerId="user-123"
 *   externalValue="org-456"
 * />
 * ```
 */
export function EmbeddedDashboard({
  externalViewerId,
  externalValue,
  className = "",
}: EmbeddedDashboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<{ destroy?: () => void } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<EmbedTokenResponse | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Load the Databricks SDK script
  useEffect(() => {
    // Check if SDK is already loaded
    if (window.DatabricksDashboard) {
      setSdkLoaded(true);
      return;
    }

    // Create and load the script
    const script = document.createElement("script");
    script.type = "module";
    script.innerHTML = `
      import { DatabricksDashboard } from "${SDK_URL}";
      window.DatabricksDashboard = DatabricksDashboard;
      window.dispatchEvent(new CustomEvent('databricks-sdk-loaded'));
    `;

    const handleSdkLoaded = () => {
      setSdkLoaded(true);
    };

    window.addEventListener("databricks-sdk-loaded", handleSdkLoaded);
    document.head.appendChild(script);

    return () => {
      window.removeEventListener("databricks-sdk-loaded", handleSdkLoaded);
    };
  }, []);

  // Fetch the embed token from our API
  useEffect(() => {
    async function fetchToken() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/databricks/dashboards/embed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            externalViewerId,
            externalValue,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch embed token");
        }

        const data: EmbedTokenResponse = await response.json();
        setTokenData(data);
      } catch (err) {
        console.error("Error fetching embed token:", err);
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
        setIsLoading(false);
      }
    }

    fetchToken();
  }, [externalViewerId, externalValue]);

  // Initialize the dashboard once we have the token and SDK
  useEffect(() => {
    if (!tokenData || !containerRef.current || !sdkLoaded) return;

    try {
      const DatabricksDashboard = window.DatabricksDashboard;
      if (!DatabricksDashboard) {
        throw new Error("Databricks SDK not loaded");
      }

      if (!containerRef.current) return;

      const dashboard = new DatabricksDashboard({
        instanceUrl: tokenData.instanceUrl,
        workspaceId: tokenData.workspaceId,
        dashboardId: tokenData.dashboardId,
        token: tokenData.token,
        container: containerRef.current,
      });

      dashboard.initialize();
      dashboardRef.current = dashboard;
      setIsLoading(false);
    } catch (err) {
      console.error("Error initializing dashboard:", err);
      setError(
        err instanceof Error ? err.message : "Failed to initialize dashboard"
      );
      setIsLoading(false);
    }

    // Cleanup function
    return () => {
      if (dashboardRef.current?.destroy) {
        dashboardRef.current.destroy();
      }
    };
  }, [tokenData, sdkLoaded]);

  const handleRetry = () => {
    setError(null);
    setTokenData(null);
    setIsLoading(true);

    // Re-fetch token
    fetch("/api/databricks/dashboards/embed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        externalViewerId,
        externalValue,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((errorData) => {
            throw new Error(errorData.error || "Failed to fetch embed token");
          });
        }
        return response.json();
      })
      .then((data: EmbedTokenResponse) => {
        setTokenData(data);
      })
      .catch((err) => {
        console.error("Error fetching embed token:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
        setIsLoading(false);
      });
  };

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full min-h-[400px] bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 ${className}`}
      >
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Failed to Load Dashboard
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 text-center max-w-md">
          {error}
        </p>
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`relative h-full min-h-[400px] ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Loading dashboard...
          </p>
        </div>
      )}
      <div
        ref={containerRef}
        className={`h-full w-full ${isLoading ? "invisible" : "visible"}`}
      />
    </div>
  );
}

export default EmbeddedDashboard;

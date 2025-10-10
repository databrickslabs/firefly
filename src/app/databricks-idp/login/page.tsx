"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

function DatabricksLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const orgId = searchParams.get("org");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgInfo, setOrgInfo] = useState<{
    name: string;
    workspaceUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!email || !orgId) {
      router.push("/databricks-idp");
      return;
    }

    async function initiateOIDCFlow() {
      try {
        setIsLoading(true);
        setError(null);

        // Get organization details first
        const response = await fetch(`/api/databricks/organizations/${orgId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch organization details");
        }

        const org = await response.json();
        setOrgInfo({
          name: org.name,
          workspaceUrl: org.workspaceUrl,
        });

        // Small delay to show the UI before redirecting
        await new Promise((resolve) => setTimeout(resolve, 1500));

        console.log("Attempting OAuth sign-in for organization:", org);

        // Set httpOnly cookie with the orgId via server endpoint
        const setOrgResponse = await fetch("/api/oauth/set-org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: orgId }),
        });

        if (!setOrgResponse.ok) {
          throw new Error("Failed to set organization cookie");
        }

        console.log("Set oauth_org_id cookie for organization:", orgId);

        // Initiate OAuth sign-in using Better Auth generic OAuth
        // Use dynamic provider ID format: databricks-workspace-{orgId}
        // The proxy will read the orgId from the httpOnly cookie
        try {
          const providerId = `databricks-workspace-${orgId}`;
          console.log("Using provider ID:", providerId);

          const result = await authClient.signIn.oauth2({
            providerId,
            callbackURL: "/databricks-idp/dashboard",
          });

          console.log("OAuth sign-in initiated:", result);
        } catch (oauthError) {
          console.error("OAuth sign-in error:", oauthError);
          throw new Error(
            `Failed to initiate OAuth authentication for ${org.name}. Please try again.`
          );
        }
      } catch (err) {
        console.error("Failed to initiate SSO flow:", err);
        setError(err instanceof Error ? err.message : "Failed to initiate login");
        setIsLoading(false);
      }
    }

    initiateOIDCFlow();
  }, [email, orgId, router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
        <div className="max-w-2xl mx-auto w-full space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-red-600 dark:text-red-400">
              Authentication Error
            </h1>
            <p className="text-xl text-muted-foreground">
              Failed to initiate Databricks authentication
            </p>
          </div>

          <div className="p-10 border-2 border-red-400 dark:border-red-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
            <div className="text-center space-y-6">
              <svg className="w-20 h-20 mx-auto text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-lg font-semibold text-foreground mb-2">Error Details</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <div className="flex gap-4 justify-center pt-4">
                <Link
                  href="/databricks-idp"
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold"
                >
                  Try Again
                </Link>
                <Link
                  href="/"
                  className="px-6 py-3 border-2 border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-semibold"
                >
                  Go Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
      <div className="max-w-2xl mx-auto w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Connecting to Workspace
          </h1>
          {orgInfo && (
            <p className="text-xl text-muted-foreground">
              Redirecting to <span className="font-semibold text-foreground">{orgInfo.name}</span>
            </p>
          )}
        </div>

        <div className="p-10 border-2 border-purple-200 dark:border-purple-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
          <div className="text-center space-y-8">
            {/* Animated Logo */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg animate-pulse">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                {/* Spinning Ring */}
                <div className="absolute inset-0 border-4 border-purple-300 dark:border-purple-700 border-t-purple-600 dark:border-t-purple-400 rounded-2xl animate-spin"></div>
              </div>
            </div>

            {/* Status Message */}
            <div className="space-y-3">
              <p className="text-lg font-semibold text-foreground">
                Preparing secure connection...
              </p>
              {email && (
                <p className="text-sm text-muted-foreground">
                  Authenticating as <span className="font-mono">{email}</span>
                </p>
              )}
              {orgInfo?.workspaceUrl && (
                <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-1 rounded inline-block">
                  {orgInfo.workspaceUrl}
                </p>
              )}
            </div>

            {/* Progress Steps */}
            <div className="pt-6 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-muted-foreground">Organization identified</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-muted-foreground">Workspace configured</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 animate-pulse flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
                <span className="text-foreground font-medium">Redirecting to authentication...</span>
              </div>
            </div>

            {/* Security Notice */}
            <div className="pt-6 border-t">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Secured with OAuth 2.0 PKCE
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DatabricksLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
          <div className="text-center space-y-4">
            <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <DatabricksLoginContent />
    </Suspense>
  );
}

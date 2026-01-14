"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";

function SsoSpnLoginContent() {
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
      router.push("/sso-spn");
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

        console.log("Attempting OAuth sign-in for SPN organization:", org);

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

        // Initiate OAuth sign-in using databricks-spn-mapping provider
        try {
          const result = await authClient.signIn.oauth2({
            providerId: "databricks-spn-mapping",
            callbackURL: `/sso-spn/${orgId}/dashboard`,
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
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
        <div className="max-w-2xl mx-auto w-full space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-red-600 dark:text-red-400">
              Authentication Error
            </h1>
            <p className="text-xl text-muted-foreground">
              Failed to initiate SPN authentication
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
                  href="/sso-spn"
                  className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
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
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
      <div className="max-w-2xl mx-auto w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            Connecting to Workspace
          </h1>
          {orgInfo && (
            <p className="text-xl text-muted-foreground">
              Redirecting to <span className="font-semibold text-foreground">{orgInfo.name}</span>
            </p>
          )}
        </div>

        <div className="p-10 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
          <div className="text-center space-y-8">
            {/* Animated Logo */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg animate-pulse">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                {/* Spinning Ring */}
                <div className="absolute inset-0 border-4 border-emerald-300 dark:border-emerald-700 border-t-emerald-600 dark:border-t-emerald-400 rounded-2xl animate-spin"></div>
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
                <span className="text-muted-foreground">SPN workspace configured</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 animate-pulse flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
                <span className="text-foreground font-medium">Redirecting to authentication...</span>
              </div>
            </div>

            {/* Security Notice */}
            <div className="pt-6 border-t">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Secured with OAuth 2.0 + SPN
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SsoSpnLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
          <div className="text-center space-y-4">
            <Spinner className="w-12 h-12 text-emerald-600 mx-auto" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <SsoSpnLoginContent />
    </Suspense>
  );
}

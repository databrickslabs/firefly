"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface Organization {
  id: string;
  name: string;
  slug: string | null;
  workspaceUrl: string | null;
  logo: string | null;
}

function SelectOrgContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  const handleSelectOrg = useCallback(async (orgId: string) => {
    try {
      // First, try to switch using existing OAuth token
      const response = await fetch("/api/oauth/switch-org", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const data = await response.json();

      if (data.hasToken && data.success) {
        // Token exists, redirect to dashboard
        console.log("Switched to organization using existing token");
        router.push(`/sso-spn/${orgId}/dashboard`);
        return;
      }

      // No token found, need to authenticate via login page
      console.log("No token found for org, redirecting to login");
      router.push(`/sso-spn/login?email=${encodeURIComponent(email!)}&org=${orgId}`);
    } catch (err) {
      console.error("Failed to select organization:", err);
      setError(err instanceof Error ? err.message : "Failed to select organization");
    }
  }, [email, router]);

  useEffect(() => {
    if (!email) {
      router.push("/sso-spn");
      return;
    }

    async function fetchOrganizations() {
      try {
        setIsLoading(true);
        const response = await fetch("/api/databricks/hrd/lookup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch organizations");
        }

        const data = await response.json();
        setOrganizations(data.organizations);

        if (data.organizations.length === 0) {
          setError("No organizations found for this email");
        } else if (data.organizations.length === 1) {
          // Auto-select if only one organization
          const org = data.organizations[0];
          await handleSelectOrg(org.id);
        }
      } catch (err) {
        console.error("Failed to fetch organizations:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch organizations");
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrganizations();
  }, [email, router, handleSelectOrg]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <Link href="/sso-spn" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            &larr; Change email
          </Link>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            Select Organization
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose which workspace you want to access with SPN
          </p>
          {email && (
            <p className="text-sm text-muted-foreground">
              Signing in as <span className="font-semibold text-foreground">{email}</span>
            </p>
          )}
        </div>

        {/* Main Content */}
        <div className="max-w-3xl mx-auto">
          {/* Loading State */}
          {isLoading && (
            <div className="p-12 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
              <div className="text-center space-y-4">
                <Spinner className="w-12 h-12 text-emerald-600 mx-auto" />
                <p className="text-muted-foreground">Loading organizations...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="p-12 border-2 border-red-400 dark:border-red-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
              <div className="text-center space-y-4">
                <svg className="w-16 h-16 mx-auto text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-lg font-semibold text-red-800 dark:text-red-200">Error</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
                </div>
                <Link
                  href="/sso-spn"
                  className="inline-block mt-4 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Try Again
                </Link>
              </div>
            </div>
          )}

          {/* Organizations List */}
          {!isLoading && !error && organizations.length > 0 && (
            <div className="space-y-4">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSelectOrg(org.id)}
                  onMouseEnter={() => setSelectedOrg(org.id)}
                  onMouseLeave={() => setSelectedOrg(null)}
                  className={`w-full p-6 border-2 rounded-2xl bg-white dark:bg-slate-900 shadow-lg transition-all duration-200 text-left ${
                    selectedOrg === org.id
                      ? "border-emerald-500 scale-[1.02] shadow-2xl"
                      : "border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 hover:scale-[1.01]"
                  }`}
                >
                  <div className="flex items-center gap-6">
                    {/* Organization Logo/Icon */}
                    <div className="flex-shrink-0">
                      {org.logo ? (
                        <img
                          src={org.logo}
                          alt={org.name}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                          <Building2 className="w-8 h-8 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Organization Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-foreground truncate">
                          {org.name}
                        </h3>
                        {org.slug && (
                          <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                            {org.slug}
                          </span>
                        )}
                      </div>
                      {org.workspaceUrl && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <ExternalLink className="w-4 h-4 flex-shrink-0" />
                          <span className="font-mono truncate">{org.workspaceUrl}</span>
                        </div>
                      )}
                      {!org.workspaceUrl && (
                        <p className="text-sm text-yellow-600 dark:text-yellow-400">
                          Workspace URL not configured
                        </p>
                      )}
                    </div>

                    {/* Arrow Icon */}
                    <div className="flex-shrink-0">
                      <svg
                        className={`w-6 h-6 transition-transform ${
                          selectedOrg === org.id ? "translate-x-1" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Info Box */}
          {!isLoading && !error && organizations.length > 0 && (
            <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-emerald-800 dark:text-emerald-200">
                  <p className="font-semibold mb-1">What happens next?</p>
                  <p>
                    After selecting an organization, you&apos;ll authenticate with your identity provider. Your access will use the mapped service principal credentials.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SelectOrgPage() {
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
      <SelectOrgContent />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";

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
      // Navigate to login page with the org ID
      // The login page will use SSO sign-in with the registered provider
      router.push(`/databricks-idp/login?email=${encodeURIComponent(email!)}&org=${orgId}`);
    } catch (err) {
      console.error("Failed to navigate to login:", err);
      setError(err instanceof Error ? err.message : "Failed to prepare login");
    }
  }, [email, router]);

  useEffect(() => {
    if (!email) {
      router.push("/databricks-idp");
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
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <Link href="/databricks-idp" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Change email
          </Link>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Select Organization
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose which Databricks workspace you want to access
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
            <div className="p-12 border-2 border-purple-200 dark:border-purple-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
              <div className="text-center space-y-4">
                <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
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
                  href="/databricks-idp"
                  className="inline-block mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
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
                      ? "border-purple-500 scale-[1.02] shadow-2xl"
                      : "border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600 hover:scale-[1.01]"
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
                        <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
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
                          ⚠️ Workspace URL not configured
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
            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-semibold mb-1">What happens next?</p>
                  <p>
                    After selecting an organization, you&apos;ll be redirected to that workspace&apos;s login page to complete authentication with your Databricks credentials.
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
          <div className="text-center space-y-4">
            <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <SelectOrgContent />
    </Suspense>
  );
}

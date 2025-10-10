"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";

function DatabricksHrdContent() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setError("Please enter your email address");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Call API to lookup organizations for this email
      const response = await fetch("/api/databricks/hrd/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to lookup organizations");
      }

      const data = await response.json();

      if (data.organizations.length === 0) {
        setError("No organizations found for this email address");
        return;
      }

      if (data.organizations.length === 1) {
        // Single org - redirect directly to OIDC flow
        router.push(`/databricks-idp/login?email=${encodeURIComponent(email)}&org=${data.organizations[0].id}`);
      } else {
        // Multiple orgs - show selection page
        router.push(`/databricks-idp/select-org?email=${encodeURIComponent(email)}`);
      }
    } catch (err) {
      console.error("Failed to lookup organizations:", err);
      setError(err instanceof Error ? err.message : "Failed to lookup organizations. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Databricks Workspace Login
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Enter your email to connect to your Databricks workspace
          </p>
        </div>

        {/* Main Login Card */}
        <div className="max-w-2xl mx-auto">
          <div className="p-10 border-2 border-purple-200 dark:border-purple-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl space-y-8">
            {/* Databricks Logo/Icon */}
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>

            {/* Description */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">Home Realm Discovery</h2>
              <p className="text-muted-foreground">
                Enter your email address to find your organization&apos;s workspace
              </p>
            </div>

            {/* Email Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@company.com"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 border-2 border-purple-200 dark:border-purple-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-slate-800 text-foreground"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-100 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-800 rounded-xl text-red-800 dark:text-red-200 flex items-start gap-3">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold">Error</p>
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full px-8 py-5 text-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl transition-all duration-200 shadow-xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Looking up organizations...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    Continue
                  </span>
                )}
              </button>
            </form>

            {/* Info Text */}
            <div className="pt-4 border-t space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Secured with OAuth 2.0 PKCE flow
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Your credentials are never stored by this application
              </div>
            </div>
          </div>
        </div>

        {/* Login Flow Steps */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-center text-lg font-semibold mb-6">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold text-purple-600 dark:text-purple-400">1</span>
              </div>
              <h4 className="font-semibold">Enter Email</h4>
              <p className="text-sm text-muted-foreground">
                We&apos;ll find all organizations associated with your email
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold text-purple-600 dark:text-purple-400">2</span>
              </div>
              <h4 className="font-semibold">Select Organization</h4>
              <p className="text-sm text-muted-foreground">
                Choose which workspace you want to access
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold text-purple-600 dark:text-purple-400">3</span>
              </div>
              <h4 className="font-semibold">Authenticate</h4>
              <p className="text-sm text-muted-foreground">
                Complete authentication with your workspace credentials
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DatabricksIdpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
          <div className="text-center space-y-4">
            <Spinner className="w-12 h-12 text-purple-600 mx-auto" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <DatabricksHrdContent />
    </Suspense>
  );
}

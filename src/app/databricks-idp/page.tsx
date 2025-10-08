"use client";

import { authClient } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";

export default function DatabricksIdpPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    // Redirect to dashboard if already logged in
    if (!isPending && session) {
      router.push("/databricks-idp/dashboard");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    // Check if there's an error from callback
    const errorParam = searchParams.get("error");
    if (errorParam === "auth_failed") {
      setError("Authentication failed. Please try again.");
    }
  }, [searchParams]);

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);

      await authClient.signIn.oauth2({
        providerId: "databricks-u2m",
        callbackURL: "/databricks-idp/dashboard",
        errorCallbackURL: "/databricks-idp?error=auth_failed",
      });
    } catch (err) {
      console.error("Failed to initiate Databricks OAuth:", err);
      setError("Failed to start sign-in process. Please try again.");
      setIsLoading(false);
    }
  };

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

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
            Connect to your Databricks workspace using OAuth 2.0 authentication
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
              <h2 className="text-2xl font-semibold">Secure Workspace Access</h2>
              <p className="text-muted-foreground">
                Authenticate with your Databricks workspace credentials. You'll be securely redirected to complete the login process.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-100 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-800 rounded-xl text-red-800 dark:text-red-200 flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-semibold">Authentication Error</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* Login Button */}
            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="w-full px-8 py-5 text-lg font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl transition-all duration-200 shadow-xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting to Databricks...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign in with Databricks
                </span>
              )}
            </button>

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
              <h4 className="font-semibold">Click Sign In</h4>
              <p className="text-sm text-muted-foreground">
                You'll be redirected to your Databricks workspace login page
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold text-purple-600 dark:text-purple-400">2</span>
              </div>
              <h4 className="font-semibold">Authenticate</h4>
              <p className="text-sm text-muted-foreground">
                Log in with your Databricks workspace credentials
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold text-purple-600 dark:text-purple-400">3</span>
              </div>
              <h4 className="font-semibold">Access Dashboard</h4>
              <p className="text-sm text-muted-foreground">
                You'll be returned here and taken to your personalized dashboard
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

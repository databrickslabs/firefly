"use client";

import { useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";
import { Key, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SsoSpnLoginPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [hasInitiated, setHasInitiated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addDebug = (message: string) => {
    console.log(message);
  };

  useEffect(() => {
    // Wait for session to load
    if (isPending) {
      addDebug("[SPN Login] Session is loading...");
      return;
    }

    addDebug(`[SPN Login] Session loaded: ${JSON.stringify(session)}`);

    // Automatically redirect to Databricks SPN mapping OAuth
    const initiateLogin = async () => {
      if (hasInitiated) return;
      setHasInitiated(true);

      addDebug("[SPN Login] Initiating Databricks SPN mapping OAuth flow");

      // If there's an existing session, sign out first
      if (session?.user) {
        addDebug("[SPN Login] Existing session detected, signing out first");
        try {
          await authClient.signOut({
            fetchOptions: {
              onSuccess: () => {
                addDebug("[SPN Login] Sign out successful");
              },
            },
          });
          // Wait for sign out to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          const errorMsg = `Sign out error: ${error}`;
          addDebug(errorMsg);
          setError(errorMsg);
        }
      }

      try {
        addDebug(`[SPN Login] authClient.signIn methods: ${Object.keys(authClient.signIn).join(", ")}`);
        addDebug(`[SPN Login] oauth2 method type: ${typeof authClient.signIn.oauth2}`);

        if (typeof authClient.signIn.oauth2 !== 'function') {
          const errorMsg = "oauth2 method does not exist on authClient.signIn!";
          addDebug(errorMsg);
          setError(errorMsg);
          throw new Error(errorMsg);
        }

        addDebug("[SPN Login] Calling authClient.signIn.oauth2...");
        const result = await authClient.signIn.oauth2({
          providerId: "databricks-spn-mapping",
          callbackURL: "/sso-spn",
        });
        addDebug(`[SPN Login] OAuth sign-in result: ${JSON.stringify(result)}`);
      } catch (error) {
        const errorMsg = `OAuth sign-in error: ${error instanceof Error ? error.message : String(error)}`;
        addDebug(errorMsg);
        setError(errorMsg);
        throw error;
      }
    };

    initiateLogin().catch(err => {
      const errorMsg = `Fatal error in login flow: ${err instanceof Error ? err.message : String(err)}`;
      addDebug(errorMsg);
      setError(errorMsg);
    });
  }, [session, isPending, hasInitiated, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
      <div className="max-w-md mx-auto w-full space-y-8">
        {/* Error Display */}
        {error && (
          <div className="p-6 border-2 border-red-500 rounded-xl bg-red-50 dark:bg-red-950/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
                  Login Error
                </h2>
                <p className="text-red-800 dark:text-red-200 mb-4 font-mono text-sm">
                  {error}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg mx-auto">
            <Key className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            SPN Login
          </h1>
          <p className="text-xl text-muted-foreground">
            Redirecting to Databricks authentication...
          </p>
        </div>

        <div className="p-10 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center animate-pulse">
                  <Key className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="absolute inset-0 border-4 border-emerald-300 dark:border-emerald-700 border-t-emerald-600 dark:border-t-emerald-400 rounded-full animate-spin"></div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Authenticating with Service Principal
              </p>
              <p className="text-xs text-muted-foreground">
                Please wait while we redirect you...
              </p>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Key className="w-4 h-4" />
                SPN-based authentication via Databricks
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

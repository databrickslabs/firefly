"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

export default function FederationPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    // Redirect to dashboard if already logged in
    if (!isPending && session) {
      router.push("/federation/dashboard");
    }
  }, [session, isPending, router]);

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Custom Federation
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Multi-tenant authentication with your custom identity provider
          </p>
        </div>

        <div className="max-w-2xl mx-auto p-10 border-2 border-blue-200 dark:border-blue-800 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
          <div className="text-center space-y-6">
            <p className="text-muted-foreground">
              Federation authentication coming soon. Configure your custom identity provider to enable multi-tenant authentication.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

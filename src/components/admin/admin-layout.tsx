"use client";

import { ReactNode, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { isAdmin } from "@/lib/admin-utils";
import { AdminSidebar } from "./admin-sidebar";
import { ShieldAlert } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    console.log("[AdminLayout] Rendered - session:", session, "isPending:", isPending);
    if (!isPending && !session) {
      console.log("[AdminLayout] No session detected, redirecting to /");
      router.push("/");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Spinner className="w-12 h-12 text-purple-600 mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const userIsAdmin = isAdmin(session.user.email);

  if (!userIsAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-xl border-2 border-red-400 dark:border-red-800 p-8 text-center">
          <ShieldAlert className="h-16 w-16 text-red-600 dark:text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            This page is only accessible to users with @databricks.com email addresses.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Your email: <span className="font-medium">{session.user.email}</span>
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-background">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

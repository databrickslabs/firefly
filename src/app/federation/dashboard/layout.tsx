"use client";

import { ReactNode, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { Sidebar } from "@/components/sidebar";

export default function FederationAuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/federation");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top Navigation */}
      <TopNav
        user={session.user}
        title="Welcome to Databricks"
        basePath="/federation"
      />

      {/* Main Layout with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar basePath="/federation" />

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}

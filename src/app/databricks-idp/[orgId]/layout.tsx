"use client";

import { ReactNode, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter, useParams } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { Sidebar } from "@/components/sidebar";
import { UserStoreInitializer } from "@/components/user-store-initializer";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";

export default function OrgLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const params = useParams();
  const orgId = params.orgId as string;

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/databricks-idp");
    }
  }, [session, isPending, router]);

  // Show loading
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

  // Redirect if no session
  if (!session) {
    return null;
  }

  const basePath = `/databricks-idp/${orgId}`;

  // Authenticated layout with sidebar
  return (
    <UserStoreInitializer orgId={orgId}>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Top Navigation */}
        <TopNav
          user={session.user}
          title="FireFly Analytics"
          basePath={basePath}
        />

        {/* Main Layout with Sidebar */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          <Sidebar basePath={basePath} userEmail={session.user.email} />

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </div>
      <Toaster />
    </UserStoreInitializer>
  );
}

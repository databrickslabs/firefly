"use client";

import { ReactNode, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter, usePathname } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { Sidebar } from "@/components/sidebar";
import { UserStoreInitializer } from "@/components/user-store-initializer";

export default function DatabricksIdpLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Routes that don't need auth
  const publicRoutes = ["/databricks-idp", "/databricks-idp/login", "/databricks-idp/select-org"];
  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    if (!isPending && !session && !isPublicRoute) {
      router.push("/databricks-idp");
    }
  }, [session, isPending, router, isPublicRoute]);

  // Public routes render without layout
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Show loading for authenticated routes
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if no session on protected routes
  if (!session) {
    return null;
  }

  // Authenticated layout with sidebar
  return (
    <UserStoreInitializer>
      <div className="h-screen flex flex-col">
        {/* Top Navigation */}
        <TopNav
          user={session.user}
          title="Welcome to Databricks"
          basePath="/databricks-idp"
        />

        {/* Main Layout with Sidebar */}
        <div className="flex-1 flex overflow-hidden">
          <Sidebar basePath="/databricks-idp" userEmail={session.user.email} />

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </UserStoreInitializer>
  );
}

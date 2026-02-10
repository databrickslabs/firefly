"use client";

import { ReactNode, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter, useParams } from "next/navigation";
import { SsoSpnTopNav } from "@/components/sso-spn-top-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SsoSpnUserStoreInitializer } from "@/components/sso-spn-user-store-initializer";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { Separator } from "@/components/ui/separator";

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
      router.push("/sso-spn");
    }
  }, [session, isPending, router]);

  // Show loading
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Spinner className="w-12 h-12 text-emerald-600 mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if no session
  if (!session) {
    return null;
  }

  const basePath = `/sso-spn/${orgId}`;

  // Authenticated layout with sidebar
  return (
    <SsoSpnUserStoreInitializer orgId={orgId}>
      <SidebarProvider>
        <div className="h-screen flex w-full">
          <AppSidebar basePath={basePath} userEmail={session.user.email} userRole={session.user.role} />
          <SidebarInset className="flex flex-col h-screen flex-1">
            {/* Top Navigation with Trigger */}
            <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <SsoSpnTopNav
                user={session.user}
                title="FireFly Analytics"
                basePath={basePath}
              />
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-background h-full">
              {children}
            </main>
          </SidebarInset>
        </div>
        <Toaster position="top-right" />
      </SidebarProvider>
    </SsoSpnUserStoreInitializer>
  );
}

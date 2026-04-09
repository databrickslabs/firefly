"use client";

import { ReactNode, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter, usePathname } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

export default function SsoSpnLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Routes that don't need auth
  const publicRoutes = ["/sso-spn", "/sso-spn/login", "/sso-spn/select-org"];
  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    if (!isPending && !session && !isPublicRoute) {
      router.push("/sso-spn");
    }
    // Guest users on public routes (like /sso-spn) should go to their dashboard
    if (!isPending && session?.user?.role === 'guest' && isPublicRoute && pathname === '/sso-spn') {
      const orgId = session.session?.activeOrganizationId;
      if (orgId) {
        router.push(`/sso-spn/${orgId}/dashboard`);
      }
    }
  }, [session, isPending, router, isPublicRoute, pathname]);

  // Public routes render without layout
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Show loading for authenticated routes
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

  // Redirect if no session on protected routes
  if (!session) {
    return null;
  }

  // Child routes (like [orgId]) handle their own layout
  return <>{children}</>;
}

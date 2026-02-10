import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { middlewareAuth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle login pages - redirect to dashboard if already logged in
  // IMPORTANT: Don't redirect if coming from OAuth callback to avoid loops
  if (pathname === "/databricks-idp" || pathname === "/federation") {
    // Skip session check if there's an error parameter (coming from failed OAuth)
    const searchParams = request.nextUrl.searchParams;
    const hasError = searchParams.has("error");

    if (hasError) {
      // Let the login page show the error
      return NextResponse.next();
    }

    try {
      // Check if user has a session
      const session = await middlewareAuth.api.getSession({
        headers: request.headers,
      });

      if (session) {
        // Redirect to dashboard if logged in
        let dashboardUrl: string;

        if (pathname === "/databricks-idp") {
          // Get active organization ID from session
          const activeOrgId = session.session.activeOrganizationId;

          if (activeOrgId) {
            dashboardUrl = `/databricks-idp/${activeOrgId}/dashboard`;
          } else {
            // No active org, redirect to org selection
            dashboardUrl = "/databricks-idp/select-org";
          }
        } else {
          dashboardUrl = "/federation/dashboard";
        }

        return NextResponse.redirect(new URL(dashboardUrl, request.url));
      }
    } catch (error) {
      // If there's an error checking session, continue to the login page
      console.error("Error checking session in middleware:", error);
    }
  }

  // Allow /admin-login for everyone (public login page)
  if (pathname === "/admin-login") {
    return NextResponse.next();
  }

  // Protect /sso-spn-admin routes - require @databricks.com email
  if (pathname.startsWith("/sso-spn-admin")) {
    try {
      const session = await middlewareAuth.api.getSession({
        headers: request.headers,
      });

      if (!session) {
        console.log("[Middleware] No session found for /sso-spn-admin route");
      } else {
        const email = session.user?.email;
        if (!email || !email.toLowerCase().endsWith("@databricks.com")) {
          console.log("[Middleware] Non-admin email detected for sso-spn-admin:", email);
        } else {
          console.log("[Middleware] SPN Admin access granted for:", email);
        }
      }
    } catch (error) {
      console.error("[Middleware] Error checking sso-spn-admin access:", error);
    }
  }

  // Protect /admin routes - require @databricks.com email
  if (pathname.startsWith("/admin")) {

    try {
      const session = await middlewareAuth.api.getSession({
        headers: request.headers,
      });

      if (!session) {
        // Not logged in - log but don't redirect
        console.log("[Middleware] No session found for /admin route");
        // return NextResponse.redirect(new URL("/admin/login", request.url));
      } else {
        // Check if user has @databricks.com email
        const email = session.user?.email;
        console.log("[Middleware] Session found:", JSON.stringify(session, null, 2));
        console.log("[Middleware] Checking admin access for email:", email);

        if (!email || !email.toLowerCase().endsWith("@databricks.com")) {
          // Not an admin - log but don't redirect
          console.log("[Middleware] Non-admin email detected:", email);
          // return NextResponse.redirect(new URL("/?error=unauthorized", request.url));
        } else {
          console.log("[Middleware] Admin access granted for:", email);
        }
      }
    } catch (error) {
      console.error("[Middleware] Error checking admin access:", error);
      // return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  const response = NextResponse.next();

  // Apply COOP/COEP headers for notebooks page for SharedArrayBuffer support
  if (pathname.includes("/notebooks")) {
    response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    response.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  }

  return response;
}

export const config = {
  matcher: ["/databricks-idp/:path*", "/federation", "/admin/:path*", "/admin-login", "/sso-spn-admin/:path*"],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only handle login pages
  if (pathname === "/databricks-idp" || pathname === "/federation") {
    try {
      // Check if user has a session
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (session) {
        // Redirect to dashboard if logged in
        const dashboardUrl = pathname === "/databricks-idp"
          ? "/databricks-idp/dashboard"
          : "/federation/dashboard";

        return NextResponse.redirect(new URL(dashboardUrl, request.url));
      }
    } catch (error) {
      // If there's an error checking session, continue to the login page
      console.error("Error checking session in middleware:", error);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/databricks-idp", "/federation"],
};

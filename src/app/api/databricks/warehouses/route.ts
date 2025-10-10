import { NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get the session from Better Auth
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - No active session" },
        { status: 401 }
      );
    }

    // Get workspace URL from active organization
    if (!session.session.activeOrganizationId) {
      return NextResponse.json(
        { error: "No active organization set in session" },
        { status: 400 }
      );
    }

    // Use Better Auth's getAccessToken to retrieve the Databricks access token
    // This will automatically refresh the token if it's expired
    const tokenResponse = await auth.api.getAccessToken({
      headers: await headers(),
      body: {
        providerId: `databricks-workspace-${session.session.activeOrganizationId}`,
      },
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      return NextResponse.json(
        { error: "No Databricks access token found. Please sign in with Databricks." },
        { status: 401 }
      );
    }

    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, session.session.activeOrganizationId))
      .limit(1);

    if (!org) {
      return NextResponse.json(
        { error: "Active organization not found in database" },
        { status: 404 }
      );
    }

    const workspaceUrl = org.workspaceUrl;

    if (!workspaceUrl) {
      return NextResponse.json(
        {
          error: "No Databricks workspace URL configured for this organization",
          organizationId: org.id,
          organizationName: org.name,
        },
        { status: 400 }
      );
    }

    // Debug logging
    const apiUrl = `${workspaceUrl}/api/2.0/sql/warehouses/`;
    const tokenPreview = tokenResponse.accessToken.substring(0, 20) + "..." + tokenResponse.accessToken.substring(tokenResponse.accessToken.length - 10);
    console.log("=== DATABRICKS WAREHOUSES API DEBUG ===");
    console.log("API URL:", apiUrl);
    console.log("Token Preview:", tokenPreview);
    console.log("Token Length:", tokenResponse.accessToken.length);
    console.log("Active Organization ID:", session.session.activeOrganizationId);
    console.log("Workspace URL:", workspaceUrl);

    // Call Databricks API to list SQL warehouses
    const databricksResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenResponse.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Response Status:", databricksResponse.status);
    console.log("Response Status Text:", databricksResponse.statusText);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      console.error("Full error details:", {
        status: databricksResponse.status,
        statusText: databricksResponse.statusText,
        apiUrl,
        workspaceUrl,
        activeOrgId: session.session.activeOrganizationId,
      });
      return NextResponse.json(
        {
          error: "Failed to fetch SQL warehouses from Databricks",
          details: errorText,
          debugInfo: {
            status: databricksResponse.status,
            apiUrl,
            workspaceUrl,
          },
        },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching SQL warehouses:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

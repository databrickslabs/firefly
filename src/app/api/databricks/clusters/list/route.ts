import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

const CLUSTERS_CACHE_TAG = "databricks-clusters";

export async function GET() {
  try {
    // Get the session from Better Auth
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - No active session" },
        { status: 401 }
      );
    }

    // Use Better Auth's getAccessToken to retrieve the Databricks access token
    const tokenResponse = await auth.api.getAccessToken({
      headers: await headers(),
      body: {
        providerId: "databricks-workspace",
      },
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      return NextResponse.json(
        { error: "No Databricks access token found. Please sign in with Databricks." },
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

    // Use unstable_cache for caching
    const getClusters = unstable_cache(
      async (token: string, wsUrl: string) => {
        const apiUrl = `${wsUrl}/api/2.0/clusters/list`;

        console.log("=== DATABRICKS CLUSTERS API DEBUG ===");
        console.log("API URL:", apiUrl);
        console.log("Workspace URL:", wsUrl);

        const databricksResponse = await fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        console.log("Response Status:", databricksResponse.status);

        if (!databricksResponse.ok) {
          const errorText = await databricksResponse.text();
          console.error("Databricks API error:", errorText);
          throw new Error(`Failed to fetch clusters: ${errorText}`);
        }

        return databricksResponse.json();
      },
      [`clusters-${org.id}`],
      {
        tags: [CLUSTERS_CACHE_TAG],
        revalidate: 30 // Cache for 30 seconds
      }
    );

    const data = await getClusters(tokenResponse.accessToken, workspaceUrl);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching clusters:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

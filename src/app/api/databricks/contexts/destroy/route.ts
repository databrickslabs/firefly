import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - No active session" },
        { status: 401 }
      );
    }

    const tokenResponse = await auth.api.getAccessToken({
      headers: await headers(),
      body: {
        providerId: "databricks-workspace",
      },
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      return NextResponse.json(
        { error: "No Databricks access token found" },
        { status: 401 }
      );
    }

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

    if (!org || !org.workspaceUrl) {
      return NextResponse.json(
        { error: "Workspace URL not configured" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { cluster_id, context_id } = body;

    if (!cluster_id || !context_id) {
      return NextResponse.json(
        { error: "cluster_id and context_id are required" },
        { status: 400 }
      );
    }

    // Destroy execution context
    const apiUrl = `${org.workspaceUrl}/api/1.2/contexts/destroy`;

    console.log("=== DESTROYING EXECUTION CONTEXT ===");
    console.log("API URL:", apiUrl);
    console.log("Cluster ID:", cluster_id);
    console.log("Context ID:", context_id);

    const databricksResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResponse.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clusterId: cluster_id,
        contextId: context_id,
      }),
    });

    console.log("Response Status:", databricksResponse.status);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        { error: "Failed to destroy execution context", details: errorText },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error destroying execution context:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ commandId: string }> }
) {
  try {
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

    if (!session.session.activeOrganizationId) {
      return NextResponse.json(
        { error: "No active organization set in session" },
        { status: 400 }
      );
    }

    const tokenResponse = await auth.api.getAccessToken({
      headers: await headers(),
      body: {
        providerId: `databricks-workspace-${session.session.activeOrganizationId}`,
      },
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      return NextResponse.json(
        { error: "No Databricks access token found" },
        { status: 401 }
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

    const { commandId } = await params;
    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get("cluster_id");
    const contextId = searchParams.get("context_id");

    if (!clusterId || !contextId) {
      return NextResponse.json(
        { error: "cluster_id and context_id are required" },
        { status: 400 }
      );
    }

    // Get command status
    const apiUrl = `${org.workspaceUrl}/api/1.2/commands/status?clusterId=${clusterId}&contextId=${contextId}&commandId=${commandId}`;

    console.log("=== CHECKING COMMAND STATUS ===");
    console.log("API URL:", apiUrl);
    console.log("Command ID:", commandId);

    const databricksResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenResponse.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Response Status:", databricksResponse.status);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        { error: "Failed to get command status", details: errorText },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();

    // Log the complete response for debugging
    console.log("=== COMMAND STATUS RESPONSE ===");
    console.log("Status:", data.status);
    console.log("Results:", JSON.stringify(data.results, null, 2));

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error getting command status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

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
    // This will automatically refresh the token if it's expired
    const tokenResponse = await auth.api.getAccessToken({
      headers: await headers(),
      body: {
        providerId: "databricks-u2m",
      },
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      return NextResponse.json(
        { error: "No Databricks access token found. Please sign in with Databricks." },
        { status: 401 }
      );
    }

    const workspaceUrl = process.env.DATABRICKS_u2M_URL;
    if (!workspaceUrl) {
      return NextResponse.json(
        { error: "Databricks workspace URL not configured" },
        { status: 500 }
      );
    }

    // Call Databricks API to list clusters
    const databricksResponse = await fetch(
      `${workspaceUrl}/api/2.0/clusters/list`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenResponse.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks API error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to fetch clusters from Databricks",
          details: errorText,
        },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching clusters:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

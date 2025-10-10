import { NextResponse } from "next/server";
import { getDatabricksAccountToken } from "@/lib/databricks-account-token";

export const dynamic = "force-dynamic";

interface DatabricksWorkspace {
  workspace_id: number;
  workspace_name: string;
  deployment_name: string;
  workspace_status: string;
  workspace_status_message?: string;
  creation_time?: number;
  account_id: string;
  pricing_tier?: string;
  aws_region?: string;
  location?: string;
  cloud?: string;
}

interface WorkspacesListResponse {
  workspaces?: DatabricksWorkspace[];
}

export async function GET() {
  try {
    const tokenResult = await getDatabricksAccountToken();

    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error.error, details: tokenResult.error.details },
        { status: tokenResult.error.status }
      );
    }

    const { accessToken, accountId } = tokenResult.data;

    // Construct the Databricks Account API URL for listing workspaces
    const apiUrl = `https://accounts.cloud.databricks.com/api/2.0/accounts/${accountId}/workspaces`;

    console.log("=== DATABRICKS ACCOUNT API DEBUG ===");
    console.log("API URL:", apiUrl);
    console.log("Account ID:", accountId);

    // Call Databricks Account API to list workspaces
    const databricksResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Response Status:", databricksResponse.status);
    console.log("Response Status Text:", databricksResponse.statusText);

    if (!databricksResponse.ok) {
      const errorText = await databricksResponse.text();
      console.error("Databricks Account API error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to fetch workspaces from Databricks Account API",
          details: errorText,
          status: databricksResponse.status,
        },
        { status: databricksResponse.status }
      );
    }

    const data = await databricksResponse.json();
    console.log("Response data:", JSON.stringify(data, null, 2));

    // The API might return an array directly or wrapped in a workspaces property
    const workspacesList = Array.isArray(data) ? data : (data.workspaces || []);
    console.log("Workspaces list:", workspacesList);

    // Transform the response to include workspace URLs
    const workspacesWithUrls = workspacesList.map((workspace: DatabricksWorkspace) => {
      // Construct workspace URL based on cloud provider and deployment name
      let workspaceUrl = "";

      if (workspace.deployment_name) {
        if (workspace.cloud === "aws" || workspace.aws_region) {
          workspaceUrl = `https://${workspace.deployment_name}.cloud.databricks.com`;
        } else if (workspace.cloud === "gcp" || workspace.location) {
          workspaceUrl = `https://${workspace.deployment_name}.gcp.databricks.com`;
        } else if (workspace.cloud === "azure") {
          workspaceUrl = `https://${workspace.deployment_name}.azuredatabricks.net`;
        }
      }

      return {
        ...workspace,
        workspace_url: workspaceUrl,
      };
    });

    return NextResponse.json({ workspaces: workspacesWithUrls });
  } catch (error) {
    console.error("Error fetching workspaces from account:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";

export interface DatabricksTokenInfo {
  accessToken: string;
  workspaceUrl: string;
  activeOrganizationId: string;
  userEmail: string;
}

export interface TokenError {
  error: string;
  status: number;
  details?: unknown;
}

/**
 * Gets Databricks access token and workspace URL for the current session
 * Returns either token info or error with status code
 */
export async function getDatabricksToken(): Promise<
  { success: true; data: DatabricksTokenInfo } | { success: false; error: TokenError }
> {
  try {
    // Get the session from Better Auth
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return {
        success: false,
        error: {
          error: "Unauthorized - No active session",
          status: 401,
        },
      };
    }

    // Get workspace URL from active organization
    if (!session.session.activeOrganizationId) {
      return {
        success: false,
        error: {
          error: "No active organization set in session",
          status: 400,
        },
      };
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
      return {
        success: false,
        error: {
          error: "No Databricks access token found. Please sign in with Databricks.",
          status: 401,
        },
      };
    }

    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, session.session.activeOrganizationId))
      .limit(1);

    if (!org) {
      return {
        success: false,
        error: {
          error: "Active organization not found in database",
          status: 404,
        },
      };
    }

    const workspaceUrl = org.workspaceUrl;

    if (!workspaceUrl) {
      return {
        success: false,
        error: {
          error: "No Databricks workspace URL configured for this organization",
          status: 400,
          details: {
            organizationId: org.id,
            organizationName: org.name,
          },
        },
      };
    }

    // Decode JWT to get user email
    const decoded = decodeJwt(tokenResponse.accessToken);
    const userEmail = (decoded.email as string) || (decoded.sub as string);

    return {
      success: true,
      data: {
        accessToken: tokenResponse.accessToken,
        workspaceUrl,
        activeOrganizationId: session.session.activeOrganizationId,
        userEmail,
      },
    };
  } catch (error) {
    console.error("Error getting Databricks token:", error);
    return {
      success: false,
      error: {
        error: "Internal server error",
        status: 500,
        details: String(error),
      },
    };
  }
}

import { NextResponse } from "next/server";
import { getDatabricksSpnToken } from "@/lib/databricks-spn-authtoken";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { headers } from "next/headers";
import { db } from "@/db";
import { organization, account, userSpns } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { decodeJwt, JWTPayload } from "jose";

export const dynamic = "force-dynamic";

interface DecodedTokenInfo {
  raw: string;
  decoded: JWTPayload;
}

interface AccountInfoResponse {
  provider: string;
  userEmail: string;
  clientId: string;
  clientSecretPreview: string;
  oktaToken: DecodedTokenInfo | null;
  workspaceToken: DecodedTokenInfo | null;
  organizationName: string;
  workspaceUrl: string;
}

/**
 * Returns account information for the current SPN-authenticated user
 * All sensitive data is sanitized on the backend before being sent to the frontend
 */
export async function GET() {
  try {
    // Get the current session
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized - No active session" },
        { status: 401 }
      );
    }

    if (!session.session?.activeOrganizationId) {
      return NextResponse.json(
        { error: "No active organization in session" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userEmail = session.user.email;
    const activeOrgId = session.session.activeOrganizationId;

    // Fetch the organization
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, activeOrgId))
      .limit(1);

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (!org.workspaceUrl) {
      return NextResponse.json(
        { error: "No workspace URL configured for this organization" },
        { status: 400 }
      );
    }

    // Get the Okta account (databricks-spn-mapping provider)
    const [oktaAccount] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, "databricks-spn-mapping")
        )
      )
      .limit(1);

    // Get the SPN credentials for this user
    const [spnRecord] = await db
      .select()
      .from(userSpns)
      .where(eq(userSpns.email, userEmail))
      .limit(1);

    // Get the workspace token
    // Pass userEmail to avoid duplicate session lookup
    const workspaceUrl = org.workspaceUrl.replace(/\/$/, '');
    const tokenResult = await getDatabricksSpnToken(workspaceUrl, undefined, userEmail);

    // Prepare Okta token info (if available)
    let oktaTokenInfo: DecodedTokenInfo | null = null;
    if (oktaAccount?.accessToken) {
      try {
        const decoded = decodeJwt(oktaAccount.accessToken);
        oktaTokenInfo = {
          raw: oktaAccount.accessToken,
          decoded,
        };
      } catch (e) {
        console.error("Failed to decode Okta token:", e);
      }
    }

    // Prepare workspace token info (if available)
    let workspaceTokenInfo: DecodedTokenInfo | null = null;
    if (tokenResult.success) {
      try {
        const decoded = decodeJwt(tokenResult.data.accessToken);
        workspaceTokenInfo = {
          raw: tokenResult.data.accessToken,
          decoded,
        };
      } catch (e) {
        console.error("Failed to decode workspace token:", e);
      }
    }

    // Mask the client secret — show first 3 and last 3 chars only (6 total).
    // Random asterisk count (8–16) avoids leaking the actual secret length.
    const randomAsterisks = "*".repeat(Math.floor(Math.random() * 9) + 8);
    const clientSecretPreview = spnRecord?.clientSecret
      ? spnRecord.clientSecret.length > 6
        ? `${spnRecord.clientSecret.substring(0, 3)}${randomAsterisks}${spnRecord.clientSecret.slice(-3)}`
        : `${spnRecord.clientSecret.substring(0, 3)}${randomAsterisks}`
      : "Not configured";

    const response: AccountInfoResponse = {
      provider: "databricks-spn-mapping (Okta)",
      userEmail: userEmail,
      clientId: spnRecord?.clientId || "Not configured",
      clientSecretPreview,
      oktaToken: oktaTokenInfo,
      workspaceToken: workspaceTokenInfo,
      organizationName: org.name,
      workspaceUrl: workspaceUrl,
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error("Error getting account info:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

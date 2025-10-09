import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization, oauthFlowMapping } from "@/db/schema/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * OAuth Token Proxy (SSO Plugin Compatible)
 *
 * This endpoint proxies token exchange requests to the correct Databricks workspace.
 * Can extract organization ID from either database (using code) or query parameter (_orgId).
 *
 * Flow:
 * 1. Better Auth SSO calls this token endpoint with authorization code
 * 2. Extract orgId from query parameter (_orgId in SSO provider config)
 * 3. Look up workspace URL from organization table
 * 4. Proxy the token request to the actual workspace token endpoint
 * 5. Return tokens to Better Auth
 */
export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgIdParam = searchParams.get("_orgId");

    // Parse the form data from Better Auth
    const formData = await request.formData();
    const code = formData.get("code") as string;
    const redirectUri = formData.get("redirect_uri") as string;
    const clientId = formData.get("client_id") as string;
    const clientSecret = formData.get("client_secret") as string;
    const grantType = formData.get("grant_type") as string;
    const codeVerifier = formData.get("code_verifier") as string;

    console.log("[OAuth Proxy] Token exchange request:", {
      code: code?.substring(0, 20) + "...",
      redirectUri,
      orgIdParam,
    });

    let organizationHint: string;

    // Prefer orgId from query parameter (SSO plugin flow)
    if (orgIdParam) {
      organizationHint = orgIdParam;
      console.log("[OAuth Proxy] Using organization ID from query parameter:", organizationHint);
    } else {
      // Fallback: Look up organization ID from database using authorization code
      const [flowMapping] = await db
        .select()
        .from(oauthFlowMapping)
        .where(eq(oauthFlowMapping.key, code))
        .limit(1);

      if (!flowMapping) {
        console.error("[OAuth Proxy] No organization mapping found for code");
        return NextResponse.json(
          { error: "Authorization code not found or expired. Please initiate OAuth through the proper flow." },
          { status: 400 }
        );
      }

      organizationHint = flowMapping.organizationId;
      console.log("[OAuth Proxy] Organization from database:", organizationHint);
    }

    // Look up the organization to get the workspace URL
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, organizationHint))
      .limit(1);

    if (!org || !org.workspaceUrl) {
      console.error("[OAuth Proxy] Organization not found or missing workspace URL:", organizationHint);
      return NextResponse.json(
        { error: "Organization not found or workspace URL not configured" },
        { status: 404 }
      );
    }

    console.log("[OAuth Proxy] Exchanging token with workspace:", org.workspaceUrl);

    // Build the token request to the actual workspace
    const tokenUrl = `${org.workspaceUrl}/oidc/v1/token`;

    const tokenFormData = new URLSearchParams();
    tokenFormData.append("grant_type", grantType || "authorization_code");
    tokenFormData.append("code", code);
    tokenFormData.append("redirect_uri", redirectUri); // Use redirect URI as-is (no cleaning needed)
    tokenFormData.append("client_id", clientId);
    tokenFormData.append("client_secret", clientSecret);

    if (codeVerifier) {
      tokenFormData.append("code_verifier", codeVerifier);
    }

    console.log("[OAuth Proxy] Token request:", {
      tokenUrl,
      redirectUri,
      hasCodeVerifier: !!codeVerifier,
    });

    // Make the token exchange request to the actual workspace
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenFormData.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[OAuth Proxy] Token exchange failed:", errorText);
      return NextResponse.json(
        { error: "Token exchange failed", details: errorText },
        { status: tokenResponse.status }
      );
    }

    const tokens = await tokenResponse.json();
    console.log("[OAuth Proxy] Token exchange successful");

    // DEBUG: Do NOT delete the flow mapping for debugging purposes
    // await db.delete(oauthFlowMapping).where(eq(oauthFlowMapping.key, code));
    console.log("[OAuth Proxy] DEBUG: Keeping flow mapping in database for debugging");

    // Return the tokens to Better Auth
    return NextResponse.json(tokens);
  } catch (error) {
    console.error("[OAuth Proxy] Token exchange error:", error);
    return NextResponse.json(
      { error: "Failed to proxy token request" },
      { status: 500 }
    );
  }
}

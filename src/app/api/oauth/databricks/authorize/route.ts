import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organization, oauthFlowMapping } from "@/db/schema/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * OAuth Authorization Proxy (Generic OAuth with Embedded Org ID)
 *
 * This endpoint acts as a proxy between Better Auth and Databricks workspace OIDC endpoints.
 * It extracts the organization ID from the callbackURL parameter, looks up the workspace,
 * and redirects to the appropriate Databricks workspace OIDC endpoint.
 *
 * Flow:
 * 1. Better Auth redirects here with OAuth params including redirect_uri with embedded orgId
 * 2. Extract orgId from redirect_uri query parameter (format: ?...&orgId=xxx)
 * 3. Store Better Auth's state → org mapping in database for callback phase
 * 4. Look up workspace URL from organization table
 * 5. Redirect to actual workspace OIDC authorization endpoint
 * 6. Clean up redirect_uri by removing orgId before sending to Databricks
 *
 * NO COOKIES - orgId embedded in callbackURL by client, extracted and cleaned by proxy
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Extract OAuth parameters from Better Auth
    const clientId = searchParams.get("client_id");
    const redirectUri = searchParams.get("redirect_uri");
    const state = searchParams.get("state");
    const scope = searchParams.get("scope");
    const responseType = searchParams.get("response_type");
    const codeChallenge = searchParams.get("code_challenge");
    const codeChallengeMethod = searchParams.get("code_challenge_method");

    // Get all cookies
    const allCookies = request.cookies.getAll();

    console.log("[OAuth Proxy] Authorization request received:", {
      clientId,
      redirectUri,
      state: state?.substring(0, 16) + "...",
      scope,
      allCookies: allCookies.map(c => ({ name: c.name, value: c.value })),
      cookieCount: allCookies.length,
    });

    if (!state) {
      console.error("[OAuth Proxy] No state parameter found");
      return NextResponse.json(
        { error: "State parameter is required. Please initiate OAuth through the proper flow." },
        { status: 400 }
      );
    }

    if (!redirectUri) {
      console.error("[OAuth Proxy] No redirect_uri found");
      return NextResponse.json(
        { error: "redirect_uri is required" },
        { status: 400 }
      );
    }

    // Extract orgId from cookie
    const orgId = request.cookies.get("oauth_org_id")?.value;

    if (!orgId) {
      console.error("[OAuth Proxy] No oauth_org_id cookie found");
      return NextResponse.json(
        { error: "Organization ID cookie not found. Please initiate OAuth through the proper flow." },
        { status: 400 }
      );
    }

    console.log("[OAuth Proxy] Extracted organization ID from cookie:", orgId);

    // Store Better Auth's state with the org (this is what will be used in callback)
    await db.insert(oauthFlowMapping).values({
      key: state,
      organizationId: orgId,
    }).onConflictDoUpdate({
      target: oauthFlowMapping.key,
      set: {
        organizationId: orgId,
        createdAt: new Date(),
      },
    });

    console.log("[OAuth Proxy] Stored Better Auth state -> org mapping for callback phase");

    // Look up the organization to get the workspace URL
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);

    if (!org || !org.workspaceUrl) {
      console.error("[OAuth Proxy] Organization not found or missing workspace URL:", orgId);
      return NextResponse.json(
        { error: "Organization not found or workspace URL not configured" },
        { status: 404 }
      );
    }

    console.log("[OAuth Proxy] Found organization:", org.name, "workspace:", org.workspaceUrl);

    // Build the authorization URL for the actual workspace
    const authUrl = new URL(`${org.workspaceUrl}/oidc/v1/authorize`);
    authUrl.searchParams.set("client_id", clientId!);
    authUrl.searchParams.set("redirect_uri", redirectUri); // Use redirect URI as-is
    authUrl.searchParams.set("response_type", responseType || "code");
    authUrl.searchParams.set("scope", scope || "all-apis offline_access");

    // Pass the state UNCHANGED - Better Auth manages this
    authUrl.searchParams.set("state", state);

    // Add PKCE parameters if present
    if (codeChallenge) {
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", codeChallengeMethod || "S256");
    }

    console.log("[OAuth Proxy] Redirecting to workspace OIDC:", authUrl.toString());

    // Redirect to the actual workspace OIDC authorization endpoint
    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error("[OAuth Proxy] Authorization error:", error);
    return NextResponse.json(
      { error: "Failed to proxy authorization request" },
      { status: 500 }
    );
  }
}

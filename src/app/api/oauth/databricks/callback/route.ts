import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { oauthFlowMapping } from "@/db/schema/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * OAuth Callback Interceptor
 *
 * This endpoint intercepts the OAuth callback from Databricks and forwards it to Better Auth.
 * The state parameter is passed through UNCHANGED.
 * Organization context is stored in database keyed by authorization code.
 *
 * Flow:
 * 1. Databricks redirects here with code and state
 * 2. Store code-to-org mapping in database
 * 3. Forward to Better Auth's OAuth callback with UNCHANGED parameters
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    console.log("[OAuth Callback] Received callback:", {
      code: code?.substring(0, 20) + "...",
      hasState: !!state,
      error,
    });

    // Handle OAuth errors
    if (error) {
      console.error("[OAuth Callback] OAuth error:", error, errorDescription);
      return NextResponse.redirect(
        new URL(`/api/auth/error?error=${error}&description=${encodeURIComponent(errorDescription || "")}`, request.url)
      );
    }

    if (!state || !code) {
      console.error("[OAuth Callback] Missing required parameters");
      return NextResponse.json(
        { error: "Missing required OAuth parameters" },
        { status: 400 }
      );
    }

    // Look up org using state parameter
    const [flowMapping] = await db
      .select()
      .from(oauthFlowMapping)
      .where(eq(oauthFlowMapping.key, state))
      .limit(1);

    if (flowMapping) {
      // Delete old state entry
      await db.delete(oauthFlowMapping).where(eq(oauthFlowMapping.key, state));

      // Insert new code entry with same org
      await db.insert(oauthFlowMapping).values({
        key: code,
        organizationId: flowMapping.organizationId,
      }).onConflictDoUpdate({
        target: oauthFlowMapping.key,
        set: {
          organizationId: flowMapping.organizationId,
          createdAt: new Date(),
        },
      });

      console.log("[OAuth Callback] Updated flow mapping from state to code for org:", flowMapping.organizationId);
    } else {
      console.warn("[OAuth Callback] State not found in database - this shouldn't happen");
    }

    // Forward to Better Auth's OAuth callback with UNCHANGED state
    const betterAuthCallback = new URL(
      "/api/auth/oauth2/callback/databricks-workspace",
      request.url
    );
    betterAuthCallback.searchParams.set("code", code);
    betterAuthCallback.searchParams.set("state", state);

    console.log("[OAuth Callback] Forwarding to Better Auth callback");

    return NextResponse.redirect(betterAuthCallback.toString());
  } catch (error) {
    console.error("[OAuth Callback] Callback processing error:", error);
    return NextResponse.json(
      { error: "Failed to process OAuth callback" },
      { status: 500 }
    );
  }
}

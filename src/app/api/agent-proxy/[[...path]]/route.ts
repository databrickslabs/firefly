import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuthInstance } from "@/lib/auth-dynamic";
import { getDatabricksSpnToken } from "@/lib/databricks-spn-authtoken";
import { db } from "@/db";
import { organization } from "@/db/schema";

// Vercel-native reverse proxy for the managed-memory agent Databricks App.
//
// Mirrors what the stock Go proxy does (inject a bearer, strip forwarded
// headers, relax frame headers) but resolves the token from the *current
// user's* mapped SPN (guest / BYOD supported) via getDatabricksSpnToken, so a
// guest never sees the Databricks OAuth wall. The agent iframe loads
// /api/agent-proxy/ (same origin) and every asset/api request is caught by this
// catch-all and forwarded to the App with the injected token.
//
// The agent chat UI (built with base:"./" + the fetch shim) emits relative
// asset URLs and prefixes /api/ calls with /api/agent-proxy, so both static
// assets and the streaming /api/chat SSE route back through here.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Chat responses stream via SSE; allow a long-running function.
export const maxDuration = 300;

const AGENT_APP_URL = (process.env.DATABRICKS_AGENT_APP_URL ?? "").replace(
  /\/$/,
  "",
);

// Request headers we must not forward upstream.
const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
  "authorization",
  "connection",
  "content-length",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
]);

// Response headers we must not pass back (Node fetch already decoded the body,
// and we set our own framing policy).
const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "content-security-policy",
  "x-frame-options",
]);

async function resolveToken(): Promise<
  | { ok: true; token: string }
  | { ok: false; status: number; body: unknown }
> {
  const auth = await getAuthInstance();
  const session = await auth.api.getSession({ headers: await headers() });

  const activeOrgId = session?.session?.activeOrganizationId;
  if (!session || !activeOrgId) {
    return {
      ok: false,
      status: 401,
      body: { error: "No active organization in session" },
    };
  }

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, activeOrgId))
    .limit(1);

  if (!org?.workspaceUrl) {
    return {
      ok: false,
      status: 400,
      body: { error: "No workspace URL configured for this organization" },
    };
  }

  const workspaceUrl = org.workspaceUrl.replace(/\/$/, "");
  const tokenResult = await getDatabricksSpnToken(
    workspaceUrl,
    undefined,
    session.user.email,
    activeOrgId,
  );

  if (!tokenResult.success) {
    return {
      ok: false,
      status: tokenResult.error.status,
      body: {
        error: tokenResult.error.error,
        details: tokenResult.error.details,
      },
    };
  }

  return { ok: true, token: tokenResult.data.accessToken };
}

async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  if (!AGENT_APP_URL) {
    return NextResponse.json(
      { error: "DATABRICKS_AGENT_APP_URL is not configured" },
      { status: 503 },
    );
  }

  const auth = await resolveToken();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const { path } = await context.params;
  const suffix = (path ?? []).join("/");
  const search = req.nextUrl.search;
  const targetUrl = `${AGENT_APP_URL}/${suffix}${search}`;

  // Copy inbound headers minus the ones we strip, then inject the bearer.
  const outboundHeaders = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      outboundHeaders.set(key, value);
    }
  });
  outboundHeaders.set("Authorization", `Bearer ${auth.token}`);

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: outboundHeaders,
    redirect: "manual",
  };
  if (hasBody) {
    init.body = req.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err) {
    return NextResponse.json(
      { error: "Upstream agent app request failed", details: String(err) },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });
  // Same-origin iframe: allow the frontend to embed the proxied app.
  responseHeaders.set("X-Frame-Options", "SAMEORIGIN");
  responseHeaders.set("Content-Security-Policy", "frame-ancestors 'self'");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;

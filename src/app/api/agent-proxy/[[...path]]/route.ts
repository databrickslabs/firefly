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

// The path this proxy is mounted at (matches the [[...path]] route location).
const MOUNT = "/api/agent-proxy";

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
  // Never let the browser revalidate the HTML document upstream: a 304 would
  // return no body, so our per-request HTML rewrites (<base>, force-light)
  // could never reach the client and a stale injected copy would stick.
  // Assets use hashed URLs with long max-age, so losing their 304s is harmless.
  "if-none-match",
  "if-modified-since",
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

  const init: RequestInit = {
    method,
    headers: outboundHeaders,
    redirect: "manual",
  };
  if (hasBody) {
    // Buffer the request body and send it with a fixed Content-Length. Streaming
    // it with duplex:"half" produces a chunked request that the Databricks Apps
    // front door rejects ("Proxy error:"). Chat POST bodies are small; only the
    // RESPONSE needs to stream (SSE), which it still does below.
    const bodyBuffer = await req.arrayBuffer();
    if (bodyBuffer.byteLength > 0) {
      init.body = bodyBuffer;
    }
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

  // The mount (/api/agent-proxy) has no trailing slash (Next strips it), so the
  // app's relative "./assets/..." URLs would resolve against /api/. Inject a
  // <base> so every relative URL resolves under the proxy mount. Also force the
  // chat UI to light mode: it uses next-themes with defaultTheme="system", which
  // follows the OS (dark) and clashes with Firefly's light-only UI. Seeding the
  // next-themes storage key + removing the "dark" class before the app bundle
  // runs pins it to light with no flash. Only the HTML document is
  // buffered+rewritten; assets and the chat SSE stream untouched.
  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const html = await upstream.text();
    const forceLight =
      "<script>try{localStorage.setItem('theme','light');" +
      "var d=document.documentElement;d.classList.remove('dark');" +
      "d.classList.add('light');d.style.colorScheme='light';}catch(e){}</script>";
    const withBase = html.replace(
      /<head(\s[^>]*)?>/i,
      (m) => `${m}<base href="${MOUNT}/">${forceLight}`,
    );
    responseHeaders.delete("content-length");
    // The injected HTML is generated per-request; never cache/revalidate it so
    // future injections always reach the browser (the app's ETag never changes).
    responseHeaders.delete("etag");
    responseHeaders.delete("last-modified");
    responseHeaders.set("Cache-Control", "no-store, must-revalidate");
    return new Response(withBase, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

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

"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

interface ProxyIframeProps {
  toolId: string;
  orgId: string;
  proxyBaseUrl: string;
  title: string;
  sandbox?: string;
  allow?: string;
}

type Status = "pending" | "ready" | "error";

export default function ProxyIframe({
  toolId,
  orgId,
  proxyBaseUrl,
  title,
  sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads",
  allow = "clipboard-write; clipboard-read",
}: ProxyIframeProps) {
  const [status, setStatus] = useState<Status>("pending");
  // Guard against React StrictMode's double-invocation of effects.
  // The ref persists across the fake unmount/remount cycle so the second
  // invocation exits immediately.
  const initCalledRef = useRef(false);

  const proxyUrl = `${proxyBaseUrl}/app-proxy/${toolId}/`;

  useEffect(() => {
    // useRef guard: the ref persists across React StrictMode's fake
    // unmount/remount cycle, so only the first invocation proceeds.
    if (initCalledRef.current) return;
    initCalledRef.current = true;

    async function initSession() {
      try {
        // 1. Fetch a short-lived JWT from better-auth (requires session cookie).
        const tokenResult = await authClient.token();
        if (tokenResult.error || !tokenResult.data?.token) {
          console.error("Failed to obtain JWT:", tokenResult.error);
          setStatus("error");
          return;
        }

        // 2. POST { jwt, toolId, orgId } to the Go proxy /start-session endpoint.
        //    The proxy validates the JWT via JWKS, looks up the tool + SPN in
        //    the database, fetches a Databricks bearer token, and sets the session cookie.
        const res = await fetch(`${proxyBaseUrl}/start-session`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jwt: tokenResult.data.token, toolId, orgId }),
        });

        if (!res.ok) {
          console.error("Failed to init proxy session:", res.status);
          setStatus("error");
          return;
        }

        setStatus("ready");
      } catch (err) {
        console.error("Proxy session init error:", err);
        setStatus("error");
      }
    }

    initSession();
  }, [toolId, orgId, proxyBaseUrl]);

  if (status === "pending") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Connecting...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 font-medium">Failed to connect</p>
          <p className="text-slate-500 text-sm mt-1">
            Could not establish a secure session. Please refresh the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={proxyUrl}
      className="w-full h-full border-0"
      title={title}
      sandbox={sandbox}
      allow={allow}
    />
  );
}

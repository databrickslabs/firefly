"use client";

import { useEffect } from "react";
import { Bot, ChevronLeft, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAgentPanelStore } from "@/stores/agent-panel-store";

// The agent chat UI (managed-memory Databricks App) is embedded via the
// same-origin Vercel proxy route at /api/agent-proxy/. That route mints the
// current user's SPN token (guest/BYOD supported) and injects it as a bearer,
// so a guest never hits the Databricks OAuth wall. No client-side token/tool id
// is needed — the route resolves the org + token from the session cookie.
const AGENT_ENABLED =
  process.env.NEXT_PUBLIC_AGENT_ENABLED?.trim().toLowerCase() === "true";
// Trailing slash matters: the app is built with base:"./", so relative assets
// resolve under /api/agent-proxy/ instead of the site root.
const AGENT_PROXY_SRC = "/api/agent-proxy/";

function agentPanelEnabled() {
  return AGENT_ENABLED;
}

function AgentChatFrame({ orgId: _orgId }: { orgId: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <iframe
          src={AGENT_PROXY_SRC}
          className="h-full w-full border-0"
          title="Firefly Agent"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          allow="clipboard-write; clipboard-read"
        />
      </div>
    </div>
  );
}

interface AgentPanelProps {
  orgId?: string;
}

export function AgentPanel({ orgId }: AgentPanelProps) {
  const { state, hydrated, hydrate, setState } = useAgentPanelStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!agentPanelEnabled() || !hydrated || state === "closed") {
    return null;
  }

  if (state === "minimized") {
    return (
      <div
        className={cn(
          "flex h-full w-12 shrink-0 flex-col items-center border-l bg-muted/30 py-3"
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          title="Expand agent"
          onClick={() => setState("expanded")}
        >
          <Bot className="h-5 w-5" />
        </Button>
        <span
          className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl]"
          aria-hidden
        >
          Agent
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-[min(420px,38vw)] shrink-0 flex-col border-l bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-2">
        <div className="flex items-center gap-2 px-1 text-sm font-medium">
          <Bot className="h-4 w-4 text-primary" />
          Agent
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Minimize"
            onClick={() => setState("minimized")}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Close"
            onClick={() => setState("closed")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {orgId ? (
        <AgentChatFrame orgId={orgId} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
          Select an organization to use the agent.
        </div>
      )}
    </div>
  );
}

export function AgentPanelTrigger() {
  const { state, hydrated, hydrate, toggle, setState } = useAgentPanelStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!agentPanelEnabled()) {
    return null;
  }

  const isOpen = state === "expanded" || state === "minimized";

  return (
    <Button
      variant={isOpen ? "secondary" : "outline"}
      size="sm"
      className="gap-2"
      onClick={() => {
        if (state === "minimized") {
          setState("expanded");
        } else {
          toggle();
        }
      }}
      title="Toggle agent assistant (Powered by Genie)"
    >
      <Bot className="h-4 w-4" />
      <span className="hidden sm:inline">Agent</span>
      {state === "expanded" && <ChevronLeft className="h-3 w-3 opacity-60" />}
    </Button>
  );
}

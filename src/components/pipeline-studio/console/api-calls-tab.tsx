"use client";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { usePipelineApiCalls, usePipelineConsoleActions } from "@/providers/pipeline-store-provider";
import { cn } from "@/lib/utils";

export function ApiCallsTab() {
  const apiCalls = usePipelineApiCalls();
  const { clearApiCalls } = usePipelineConsoleActions();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return "text-green-600";
    if (status >= 400 && status < 500) return "text-amber-600";
    if (status >= 500) return "text-red-600";
    return "text-slate-600";
  };

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      GET: "bg-blue-100 text-blue-700",
      POST: "bg-green-100 text-green-700",
      PUT: "bg-amber-100 text-amber-700",
      PATCH: "bg-purple-100 text-purple-700",
      DELETE: "bg-red-100 text-red-700",
    };
    return colors[method] || "bg-slate-100 text-slate-700";
  };

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-hidden">
          <ScrollArea className="h-full w-full" type="always">
            <div className="p-2 space-y-1 font-mono text-xs">
              {apiCalls.length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  No API calls yet. Interactions with the backend will be logged here.
                </div>
              ) : (
                apiCalls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-slate-400 shrink-0">
                      {formatTime(call.timestamp)}
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0",
                        getMethodColor(call.method)
                      )}
                    >
                      {call.method}
                    </span>
                    <span className="text-slate-700 truncate flex-1">
                      {call.endpoint}
                    </span>
                    <span className={cn("shrink-0 font-medium", getStatusColor(call.status))}>
                      {call.status}
                    </span>
                    <span className="text-slate-400 shrink-0">{call.duration}ms</span>
                  </div>
                ))
              )}
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </div>
      </div>
      {apiCalls.length > 0 && (
        <div className="border-t border-slate-200 p-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearApiCalls}
            className="h-7 text-xs"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear API Calls
          </Button>
        </div>
      )}
    </div>
  );
}

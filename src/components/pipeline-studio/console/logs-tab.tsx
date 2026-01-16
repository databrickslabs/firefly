"use client";

import { useEffect, useRef } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { usePipelineLogs, usePipelineConsoleActions } from "@/providers/pipeline-store-provider";
import { cn } from "@/lib/utils";

const levelStyles = {
  info: "text-blue-600 bg-blue-50",
  success: "text-green-600 bg-green-50",
  warn: "text-amber-600 bg-amber-50",
  error: "text-red-600 bg-red-50",
};

export function LogsTab() {
  const logs = usePipelineLogs();
  const { clearLogs } = usePipelineConsoleActions();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 overflow-hidden">
          <ScrollArea className="h-full w-full" type="always" ref={scrollRef}>
            <div className="p-2 space-y-1 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  No logs yet. Actions will be logged here.
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-slate-400 shrink-0">
                      {formatTime(log.timestamp)}
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase shrink-0",
                        levelStyles[log.level]
                      )}
                    >
                      {log.level}
                    </span>
                    <span className="text-slate-700 whitespace-pre-wrap">{log.message}</span>
                  </div>
                ))
              )}
            </div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </div>
      </div>
      {logs.length > 0 && (
        <div className="border-t border-slate-200 p-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearLogs}
            className="h-7 text-xs"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear Logs
          </Button>
        </div>
      )}
    </div>
  );
}

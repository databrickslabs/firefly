"use client";

import { ConsoleTabs } from "./console/console-tabs";

export function PipelineConsole() {
  return (
    <div className="h-full w-full border-t border-slate-200 bg-white overflow-hidden min-w-0">
      <ConsoleTabs />
    </div>
  );
}

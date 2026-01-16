"use client";

import { MousePointerClick } from "lucide-react";

export function NoSelectionPanel() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <MousePointerClick className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="font-medium text-slate-900 mb-1">No node selected</h3>
      <p className="text-sm text-slate-500">
        Click on a node in the canvas to view and edit its properties
      </p>
    </div>
  );
}

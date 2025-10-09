"use client";

import * as React from "react";
import type { CellOutput as CellOutputType } from "@/lib/notebook-manager";
import { AlertCircle } from "lucide-react";

interface CellOutputProps {
  outputs: CellOutputType[];
}

export function CellOutput({ outputs }: CellOutputProps) {
  if (!outputs || outputs.length === 0) {
    return null;
  }

  return (
    <div className="border-l-4 border-blue-500 bg-muted/30 p-3 space-y-2">
      {outputs.map((output, index) => (
        <OutputRenderer key={index} output={output} />
      ))}
    </div>
  );
}

function OutputRenderer({ output }: { output: CellOutputType }) {
  // Error output
  if (output.output_type === "error") {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-red-600 dark:text-red-400">
              {output.ename || "Error"}
            </div>
            {output.evalue && (
              <div className="text-sm text-red-600 dark:text-red-400 mt-1">
                {output.evalue}
              </div>
            )}
            {output.traceback && output.traceback.length > 0 && (
              <pre className="text-xs text-red-500 dark:text-red-400 mt-2 overflow-x-auto">
                {output.traceback.join("\n")}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Stream output (stdout/stderr)
  if (output.output_type === "stream") {
    const text = Array.isArray(output.text) ? output.text.join("") : output.text || "";
    const isStderr = output.name === "stderr";

    return (
      <pre
        className={`text-sm whitespace-pre-wrap break-words font-mono ${
          isStderr
            ? "text-orange-600 dark:text-orange-400"
            : "text-foreground"
        }`}
      >
        {text}
      </pre>
    );
  }

  // Display data or execute result
  if (output.output_type === "display_data" || output.output_type === "execute_result") {
    const data = output.data || {};

    // Image output (PNG/JPEG)
    if (data["image/png"]) {
      return (
        <div className="my-2 max-h-[600px] overflow-auto">
          <img
            src={`data:image/png;base64,${data["image/png"]}`}
            alt="Output"
            className="max-w-full h-auto rounded border"
          />
        </div>
      );
    }

    if (data["image/jpeg"]) {
      return (
        <div className="my-2 max-h-[600px] overflow-auto">
          <img
            src={`data:image/jpeg;base64,${data["image/jpeg"]}`}
            alt="Output"
            className="max-w-full h-auto rounded border"
          />
        </div>
      );
    }

    // HTML output
    if (data["text/html"]) {
      const html = Array.isArray(data["text/html"])
        ? data["text/html"].join("")
        : data["text/html"];

      // Check if this HTML contains scripts (e.g., Plotly, interactive visualizations)
      // dangerouslySetInnerHTML doesn't execute scripts, so we need to use an iframe
      const containsScripts = typeof html === "string" && html.includes("<script");

      if (containsScripts) {
        // Use iframe with srcdoc to allow script execution
        // This is safe because it's sandboxed
        return (
          <div className="my-2">
            <iframe
              srcDoc={html as string}
              className="w-full border rounded"
              style={{ minHeight: "400px", height: "500px" }}
              sandbox="allow-scripts allow-same-origin"
              title="Interactive visualization"
            />
          </div>
        );
      }

      // For HTML without scripts, use dangerouslySetInnerHTML
      return (
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: html as string }}
        />
      );
    }

    // JSON output
    if (data["application/json"]) {
      return (
        <pre className="text-sm bg-background p-2 rounded border overflow-x-auto">
          {JSON.stringify(data["application/json"], null, 2)}
        </pre>
      );
    }

    // Plain text output (fallback)
    if (data["text/plain"]) {
      const text = Array.isArray(data["text/plain"])
        ? data["text/plain"].join("")
        : data["text/plain"];

      return (
        <pre className="text-sm whitespace-pre-wrap break-words font-mono text-foreground">
          {text}
        </pre>
      );
    }
  }

  // Fallback: show raw output
  return (
    <pre className="text-sm bg-background p-2 rounded border overflow-x-auto">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

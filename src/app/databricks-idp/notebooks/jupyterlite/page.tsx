"use client";

/**
 * Dedicated JupyterLite page - embeds JupyterLite in a simple iframe
 * Route: /databricks-idp/notebooks/jupyterlite
 */
export default function JupyterLitePage() {
  return (
    <div className="h-full w-full">
      <iframe
        src="/jupyterlite/lab/index.html"
        className="w-full h-full border-0"
        title="JupyterLite"
        allow="cross-origin-isolated; clipboard-read; clipboard-write"
      />
    </div>
  );
}

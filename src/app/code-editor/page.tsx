import CodeEditorIframe from "@/components/code-editor-iframe";
import { Suspense } from "react";

/**
 * Code Editor page - Server-side rendered
 *
 * This page uses a server component to fetch the user's Databricks OAuth token
 * and generate an encrypted proxy URL for secure iframe embedding.
 *
 * The token is encrypted in the URL and handled by the Go proxy server.
 */
export default function CodeEditorPage() {
  return (
    <div className="h-screen w-full">
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center bg-slate-100/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading code editor...</p>
            </div>
          </div>
        }
      >
        <CodeEditorIframe />
      </Suspense>
    </div>
  );
}

export const metadata = {
  title: "Code Editor | Databricks",
  description: "Databricks Code Editor with VS Code interface",
};

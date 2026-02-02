import SsoSpnNotebookEditorIframe from "@/components/sso-spn-notebook-editor-iframe";
import { Suspense } from "react";

/**
 * Notebook Editor page - Server-side rendered (SPN Authentication)
 *
 * This page uses a server component to fetch the user's Databricks SPN token
 * and generate an encrypted proxy URL for secure iframe embedding.
 *
 * The token is encrypted in the URL and handled by the Go proxy server.
 */
export default function NotebookEditorPage() {
  return (
    <div className="h-full w-full overflow-hidden">
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center bg-slate-100/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading notebook editor (SPN)...</p>
            </div>
          </div>
        }
      >
        <SsoSpnNotebookEditorIframe />
      </Suspense>
    </div>
  );
}

export const metadata = {
  title: "Notebook Editor | SPN Databricks",
  description: "Databricks Notebook Editor with Marimo interface (SPN Access)",
};

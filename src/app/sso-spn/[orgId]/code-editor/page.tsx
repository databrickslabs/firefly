import SsoSpnCodeEditorIframe from "@/components/sso-spn-code-editor-iframe";
import { Suspense } from "react";

/**
 * Code Editor page - Server-side rendered (SPN Authentication)
 *
 * This page uses a server component to fetch the user's Databricks SPN token
 * and generate an encrypted proxy URL for secure iframe embedding.
 *
 * The token is encrypted in the URL and handled by the Go proxy server.
 */
export default function CodeEditorPage() {
  return (
    <div className="h-full w-full overflow-hidden">
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center bg-slate-100/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading code editor (SPN)...</p>
            </div>
          </div>
        }
      >
        <SsoSpnCodeEditorIframe />
      </Suspense>
    </div>
  );
}

export const metadata = {
  title: "Code Editor | SPN Databricks",
  description: "Databricks Code Editor with VS Code interface (SPN Access)",
};

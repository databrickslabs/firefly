"use client";

import * as React from "react";
import {
  useJupyterLite,
  type UseJupyterLiteReturn,
} from "@/hooks/use-jupyterlite";
import {
  type JupyterLiteConfig,
  type JupyterLiteEventHandlers,
  type JupyterLabCommand,
  buildJupyterLiteUrl,
} from "@/lib/jupyterlite-commands";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface JupyterLiteIframeProps {
  /** JupyterLite configuration */
  config?: JupyterLiteConfig;
  /** Event handlers for JupyterLite messages */
  handlers?: JupyterLiteEventHandlers;
  /** CSS class name */
  className?: string;
  /** Loading message */
  loadingMessage?: string;
  /** Show loading indicator */
  showLoading?: boolean;
}

export interface JupyterLiteIframeRef {
  /** Execute a JupyterLab command */
  executeCommand: (
    command: JupyterLabCommand | string,
    args?: Record<string, unknown>
  ) => Promise<void>;
  /** Load a notebook by path */
  loadNotebook: (path: string) => Promise<void>;
  /** Set the theme */
  setTheme: (theme: "JupyterLab Light" | "JupyterLab Dark") => Promise<void>;
  /** Get the current notebook content */
  getNotebookContent: () => Promise<void>;
  /** Whether JupyterLite is ready */
  isReady: boolean;
  /** Direct access to the iframe element */
  iframe: HTMLIFrameElement | null;
  /** Full API from useJupyterLite hook */
  api: UseJupyterLiteReturn;
}

/**
 * JupyterLite Iframe Component
 *
 * Embeds JupyterLite in an iframe and provides a clean API for communication.
 *
 * @example
 * ```tsx
 * const jupyterRef = useRef<JupyterLiteIframeRef>(null);
 *
 * <JupyterLiteIframe
 *   ref={jupyterRef}
 *   config={{
 *     interface: "lab",
 *     theme: "JupyterLab Dark",
 *     kernel: "python",
 *   }}
 *   handlers={{
 *     onReady: () => console.log("JupyterLite is ready!"),
 *     onError: (msg) => console.error("Error:", msg.error),
 *   }}
 * />
 * ```
 */
export const JupyterLiteIframe = React.forwardRef<
  JupyterLiteIframeRef,
  JupyterLiteIframeProps
>(function JupyterLiteIframe(
  { config, handlers, className, loadingMessage = "Loading JupyterLite...", showLoading = true },
  ref
) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = React.useState(false);

  // Use the JupyterLite hook
  const jupyterLiteApi = useJupyterLite({
    iframeRef,
    handlers,
  });

  const { isReady } = jupyterLiteApi;

  // Build the JupyterLite URL
  const jupyterLiteUrl = React.useMemo(() => {
    return buildJupyterLiteUrl(config);
  }, [config]);

  // Expose API via ref
  React.useImperativeHandle(
    ref,
    () => ({
      executeCommand: jupyterLiteApi.executeCommand,
      loadNotebook: jupyterLiteApi.loadNotebook,
      setTheme: jupyterLiteApi.setTheme,
      getNotebookContent: jupyterLiteApi.getNotebookContent,
      isReady,
      iframe: iframeRef.current,
      api: jupyterLiteApi,
    }),
    [jupyterLiteApi, isReady]
  );

  // Handle iframe load
  const handleIframeLoad = React.useCallback(() => {
    setIframeLoaded(true);
    console.log("[JupyterLiteIframe] Iframe loaded");
  }, []);

  const showLoadingIndicator = showLoading && (!iframeLoaded || !isReady);

  return (
    <div className={cn("relative w-full h-full", className)}>
      {/* Loading Indicator */}
      {showLoadingIndicator && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{loadingMessage}</p>
            {iframeLoaded && !isReady && (
              <p className="text-xs text-muted-foreground">
                Waiting for JupyterLite to initialize...
              </p>
            )}
          </div>
        </div>
      )}

      {/* JupyterLite Iframe */}
      <iframe
        ref={iframeRef}
        src={jupyterLiteUrl}
        className={cn(
          "w-full h-full border-0",
          showLoadingIndicator && "opacity-0"
        )}
        title="JupyterLite"
        onLoad={handleIframeLoad}
        allow="cross-origin-isolated; clipboard-read; clipboard-write; accelerometer; camera; microphone"
      />
    </div>
  );
});

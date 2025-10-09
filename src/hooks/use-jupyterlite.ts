"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IncomingMessage,
  OutgoingMessage,
  JupyterLiteEventHandlers,
  ExecuteCommandMessage,
  LoadNotebookMessage,
  SetThemeMessage,
  GetNotebookContentMessage,
  JupyterLabCommand,
} from "@/lib/jupyterlite-commands";
import { MessageType, createMessage } from "@/lib/jupyterlite-commands";

export interface UseJupyterLiteOptions {
  /** Reference to the iframe element */
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** Event handlers */
  handlers?: JupyterLiteEventHandlers;
  /** Target origin for postMessage (default: window.location.origin) */
  targetOrigin?: string;
}

export interface UseJupyterLiteReturn {
  /** Whether the JupyterLite instance is ready */
  isReady: boolean;
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
  /** Send a raw message */
  sendMessage: (message: OutgoingMessage) => void;
  /** Update event handlers */
  setHandlers: (handlers: JupyterLiteEventHandlers) => void;
}

/**
 * Hook for communicating with JupyterLite iframe via postMessage API
 */
export function useJupyterLite({
  iframeRef,
  handlers: initialHandlers,
  targetOrigin = window.location.origin,
}: UseJupyterLiteOptions): UseJupyterLiteReturn {
  const [isReady, setIsReady] = useState(false);
  const handlersRef = useRef<JupyterLiteEventHandlers>(initialHandlers || {});
  const pendingMessagesRef = useRef<OutgoingMessage[]>([]);

  // Update handlers
  const setHandlers = useCallback((handlers: JupyterLiteEventHandlers) => {
    handlersRef.current = handlers;
  }, []);

  // Send message to iframe
  const sendMessage = useCallback(
    (message: OutgoingMessage) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        console.warn("[useJupyterLite] Iframe not ready, message queued:", message);
        pendingMessagesRef.current.push(message);
        return;
      }

      try {
        iframe.contentWindow.postMessage(message, targetOrigin);
        console.log("[useJupyterLite] Sent message:", message);
      } catch (error) {
        console.error("[useJupyterLite] Failed to send message:", error);
      }
    },
    [iframeRef, targetOrigin]
  );

  // Execute command
  const executeCommand = useCallback(
    async (command: JupyterLabCommand | string, args?: Record<string, unknown>) => {
      const message = createMessage<ExecuteCommandMessage>({
        type: MessageType.EXECUTE_COMMAND,
        command,
        args,
      });
      sendMessage(message);
    },
    [sendMessage]
  );

  // Load notebook
  const loadNotebook = useCallback(
    async (path: string) => {
      const message = createMessage<LoadNotebookMessage>({
        type: MessageType.LOAD_NOTEBOOK,
        path,
      });
      sendMessage(message);
    },
    [sendMessage]
  );

  // Set theme
  const setTheme = useCallback(
    async (theme: "JupyterLab Light" | "JupyterLab Dark") => {
      const message = createMessage<SetThemeMessage>({
        type: MessageType.SET_THEME,
        theme,
      });
      sendMessage(message);
    },
    [sendMessage]
  );

  // Get notebook content
  const getNotebookContent = useCallback(async () => {
    const message = createMessage<GetNotebookContentMessage>({
      type: MessageType.GET_NOTEBOOK_CONTENT,
    });
    sendMessage(message);
  }, [sendMessage]);

  // Handle incoming messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent<IncomingMessage>) => {
      // Validate origin
      if (event.origin !== targetOrigin) {
        console.warn("[useJupyterLite] Message from untrusted origin:", event.origin);
        return;
      }

      const message = event.data;

      // Filter out browser extension messages (Requestly, React DevTools, etc.)
      if (
        message &&
        typeof message === "object" &&
        ("source" in message &&
          (message.source === "requestly:client" ||
           message.source === "react-devtools-bridge" ||
           message.source === "react-devtools-content-script"))
      ) {
        return; // Ignore extension messages
      }

      console.log("[useJupyterLite] Received message:", message);

      // Handle based on message type
      switch (message.type) {
        case MessageType.READY:
          setIsReady(true);
          handlersRef.current.onReady?.();

          // Send any pending messages
          if (pendingMessagesRef.current.length > 0) {
            console.log(
              `[useJupyterLite] Sending ${pendingMessagesRef.current.length} pending messages`
            );
            pendingMessagesRef.current.forEach((msg) => sendMessage(msg));
            pendingMessagesRef.current = [];
          }
          break;

        case MessageType.COMMAND_RESULT:
          handlersRef.current.onCommandResult?.(message);
          break;

        case MessageType.NOTEBOOK_LOADED:
          handlersRef.current.onNotebookLoaded?.(message);
          break;

        case MessageType.NOTEBOOK_CONTENT:
          handlersRef.current.onNotebookContent?.(message);
          break;

        case MessageType.ERROR:
          handlersRef.current.onError?.(message);
          console.error("[useJupyterLite] Error from iframe:", message.error);
          break;

        case MessageType.KERNEL_STATUS:
          handlersRef.current.onKernelStatus?.(message);
          break;

        case MessageType.CELL_EXECUTED:
          handlersRef.current.onCellExecuted?.(message);
          break;

        default:
          console.warn("[useJupyterLite] Unknown message type:", message);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [targetOrigin, sendMessage]);

  // Update handlers ref when handlers change
  useEffect(() => {
    if (initialHandlers) {
      handlersRef.current = initialHandlers;
    }
  }, [initialHandlers]);

  return {
    isReady,
    executeCommand,
    loadNotebook,
    setTheme,
    getNotebookContent,
    sendMessage,
    setHandlers,
  };
}

/**
 * JupyterLite Command API
 *
 * This module provides TypeScript types and utilities for communicating
 * with JupyterLite instances via postMessage API.
 */

/**
 * Standard JupyterLab commands that can be executed via iframe communication
 */
export enum JupyterLabCommand {
  // Application commands
  TOGGLE_LEFT_AREA = "application:toggle-left-area",
  TOGGLE_RIGHT_AREA = "application:toggle-right-area",
  TOGGLE_MODE = "application:toggle-mode",
  CHANGE_THEME = "apputils:change-theme",

  // Notebook commands
  RUN_CELL = "notebook:run-cell",
  RUN_ALL_CELLS = "notebook:run-all-cells",
  RUN_CELL_AND_SELECT_NEXT = "notebook:run-cell-and-select-next",
  RUN_CELL_AND_INSERT_BELOW = "notebook:run-cell-and-insert-below",
  INTERRUPT_KERNEL = "notebook:interrupt-kernel",
  RESTART_KERNEL = "notebook:restart-kernel",
  CHANGE_KERNEL = "notebook:change-kernel",
  SAVE_NOTEBOOK = "docmanager:save",

  // Cell commands
  INSERT_CELL_ABOVE = "notebook:insert-cell-above",
  INSERT_CELL_BELOW = "notebook:insert-cell-below",
  DELETE_CELL = "notebook:delete-cell",
  COPY_CELL = "notebook:copy-cell",
  CUT_CELL = "notebook:cut-cell",
  PASTE_CELL = "notebook:paste-cell",
  CHANGE_CELL_TYPE = "notebook:change-cell-to-code",

  // File browser commands
  OPEN_FILE = "filebrowser:open-path",
  CREATE_NEW_FILE = "filebrowser:create-new-file",
  CREATE_NEW_DIRECTORY = "filebrowser:create-new-directory",
}

/**
 * Message types for iframe communication
 */
export enum MessageType {
  // Outgoing (parent -> iframe)
  EXECUTE_COMMAND = "jupyterlite:execute-command",
  LOAD_NOTEBOOK = "jupyterlite:load-notebook",
  GET_NOTEBOOK_CONTENT = "jupyterlite:get-notebook-content",
  SET_THEME = "jupyterlite:set-theme",

  // Incoming (iframe -> parent)
  READY = "jupyterlite:ready",
  COMMAND_RESULT = "jupyterlite:command-result",
  NOTEBOOK_LOADED = "jupyterlite:notebook-loaded",
  NOTEBOOK_CONTENT = "jupyterlite:notebook-content",
  ERROR = "jupyterlite:error",
  KERNEL_STATUS = "jupyterlite:kernel-status",
  CELL_EXECUTED = "jupyterlite:cell-executed",
}

/**
 * Base message interface
 */
export interface BaseMessage {
  type: MessageType;
  id?: string; // For request-response correlation
}

/**
 * Command execution message (parent -> iframe)
 */
export interface ExecuteCommandMessage extends BaseMessage {
  type: MessageType.EXECUTE_COMMAND;
  command: JupyterLabCommand | string;
  args?: Record<string, unknown>;
}

/**
 * Load notebook message (parent -> iframe)
 */
export interface LoadNotebookMessage extends BaseMessage {
  type: MessageType.LOAD_NOTEBOOK;
  path: string;
}

/**
 * Set theme message (parent -> iframe)
 */
export interface SetThemeMessage extends BaseMessage {
  type: MessageType.SET_THEME;
  theme: "JupyterLab Light" | "JupyterLab Dark" | string;
}

/**
 * Get notebook content message (parent -> iframe)
 */
export interface GetNotebookContentMessage extends BaseMessage {
  type: MessageType.GET_NOTEBOOK_CONTENT;
}

/**
 * Ready message (iframe -> parent)
 */
export interface ReadyMessage extends BaseMessage {
  type: MessageType.READY;
}

/**
 * Command result message (iframe -> parent)
 */
export interface CommandResultMessage extends BaseMessage {
  type: MessageType.COMMAND_RESULT;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Notebook loaded message (iframe -> parent)
 */
export interface NotebookLoadedMessage extends BaseMessage {
  type: MessageType.NOTEBOOK_LOADED;
  path: string;
}

/**
 * Notebook content message (iframe -> parent)
 */
export interface NotebookContentMessage extends BaseMessage {
  type: MessageType.NOTEBOOK_CONTENT;
  content: unknown; // Jupyter notebook JSON structure
}

/**
 * Error message (iframe -> parent)
 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
  details?: unknown;
}

/**
 * Kernel status message (iframe -> parent)
 */
export interface KernelStatusMessage extends BaseMessage {
  type: MessageType.KERNEL_STATUS;
  status: "idle" | "busy" | "starting" | "restarting" | "dead";
}

/**
 * Cell executed message (iframe -> parent)
 */
export interface CellExecutedMessage extends BaseMessage {
  type: MessageType.CELL_EXECUTED;
  cellIndex: number;
  success: boolean;
  executionTime?: number;
}

/**
 * Union type for all outgoing messages (parent -> iframe)
 */
export type OutgoingMessage =
  | ExecuteCommandMessage
  | LoadNotebookMessage
  | SetThemeMessage
  | GetNotebookContentMessage;

/**
 * Union type for all incoming messages (iframe -> parent)
 */
export type IncomingMessage =
  | ReadyMessage
  | CommandResultMessage
  | NotebookLoadedMessage
  | NotebookContentMessage
  | ErrorMessage
  | KernelStatusMessage
  | CellExecutedMessage;

/**
 * Event handlers for incoming messages
 */
export interface JupyterLiteEventHandlers {
  onReady?: () => void;
  onCommandResult?: (message: CommandResultMessage) => void;
  onNotebookLoaded?: (message: NotebookLoadedMessage) => void;
  onNotebookContent?: (message: NotebookContentMessage) => void;
  onError?: (message: ErrorMessage) => void;
  onKernelStatus?: (message: KernelStatusMessage) => void;
  onCellExecuted?: (message: CellExecutedMessage) => void;
}

/**
 * Configuration for JupyterLite iframe
 */
export interface JupyterLiteConfig {
  /** URL path to JupyterLite (default: /jupyterlite) */
  basePath?: string;
  /** Interface to use (lab, notebooks, repl) */
  interface?: "lab" | "notebooks" | "repl" | "consoles";
  /** Default kernel */
  kernel?: string;
  /** Theme */
  theme?: "JupyterLab Light" | "JupyterLab Dark";
  /** Show toolbar */
  toolbar?: boolean;
  /** Additional URL parameters */
  params?: Record<string, string>;
}

/**
 * Utility to build JupyterLite URL
 */
export function buildJupyterLiteUrl(config: JupyterLiteConfig = {}): string {
  const {
    basePath = "/jupyterlite",
    interface: iface = "lab",
    kernel,
    theme,
    toolbar,
    params = {},
  } = config;

  const url = new URL(`${basePath}/${iface}/index.html`, window.location.origin);

  if (kernel) url.searchParams.set("kernel", kernel);
  if (theme) url.searchParams.set("theme", theme);
  if (toolbar !== undefined) url.searchParams.set("toolbar", toolbar ? "1" : "0");

  // Add custom params
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

/**
 * Utility to create a message with unique ID
 */
export function createMessage<T extends OutgoingMessage>(
  message: Omit<T, "id">
): T {
  return {
    ...message,
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  } as T;
}

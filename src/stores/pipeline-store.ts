"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Node, Edge, OnNodesChange, OnEdgesChange, applyNodeChanges, applyEdgeChanges } from "@xyflow/react";

// Node categories and subtypes
export type NodeCategory = "source" | "transform" | "ai" | "destination";

export type SourceSubtype = "table" | "volume" | "stream";
export type TransformSubtype = "sql" | "python" | "join" | "filter";
export type AISubtype = "inference" | "ai-parse";
export type DestinationSubtype = "delta" | "streaming";

export type NodeSubtype =
  | SourceSubtype
  | TransformSubtype
  | AISubtype
  | DestinationSubtype;

// Node data structure
// Index signature makes this compatible with React Flow's Record<string, unknown> constraint
export interface PipelineNodeData extends Record<string, unknown> {
  label: string;
  category: NodeCategory;
  subtype: NodeSubtype;
  config: Record<string, unknown>;
}

// Log entry for console
export interface LogEntry {
  id: string;
  timestamp: Date;
  level: "info" | "success" | "warn" | "error";
  message: string;
}

// API call entry for console
export interface ApiCallEntry {
  id: string;
  timestamp: Date;
  method: string;
  endpoint: string;
  status: number;
  duration: number;
  request?: unknown;
  response?: unknown;
}

// Sample data result for console
export interface SampleDataResult {
  nodeId: string;
  nodeLabel: string;
  timestamp: Date;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  isLoading: boolean;
  error?: string;
}

// Pipeline types
export type PipelineNode = Node<PipelineNodeData>;
export type PipelineEdge = Edge;

// Permission level type for shared pipelines
export type PipelinePermissionLevel = 'CAN_READ' | 'CAN_EDIT' | 'CAN_RUN';

// Pipeline access information
export interface PipelineAccess {
  canRead: boolean;
  canEdit: boolean;
  canRun: boolean;
  isOwner: boolean;
  permissionLevel: PipelinePermissionLevel | null;
}

// Store state interface
export interface PipelineState {
  // Pipeline metadata
  pipelineId: string | null;
  pipelineName: string;
  pipelineDescription: string | null;
  isDirty: boolean;

  // Access control
  isOwner: boolean;
  permissionLevel: PipelinePermissionLevel | null;
  lastSavedAt: Date | null;

  // Canvas state
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  selectedNodeIds: string[];

  // Clipboard state
  copiedNodes: PipelineNode[];
  copiedEdges: PipelineEdge[];

  // UI state
  isLoading: boolean;
  error: string | null;

  // Console state
  logs: LogEntry[];
  apiCalls: ApiCallEntry[];
  sampleData: SampleDataResult | null;
  sampleDataByNode: Record<string, SampleDataResult>;

  // Actions - Nodes
  setNodes: (nodes: PipelineNode[]) => void;
  onNodesChange: OnNodesChange<PipelineNode>;
  addNode: (node: PipelineNode) => void;
  updateNodeData: (nodeId: string, data: Partial<PipelineNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;

  // Actions - Edges
  setEdges: (edges: PipelineEdge[]) => void;
  onEdgesChange: OnEdgesChange<PipelineEdge>;
  addEdge: (edge: PipelineEdge) => void;
  deleteEdge: (edgeId: string) => void;

  // Actions - Selection
  selectNode: (nodeId: string | null) => void;
  selectNodes: (nodeIds: string[]) => void;
  toggleNodeSelection: (nodeId: string) => void;
  clearSelection: () => void;

  // Actions - Clipboard
  copySelectedNodes: () => void;
  pasteNodes: () => void;

  // Actions - Pipeline
  setPipeline: (id: string | null, name: string, description?: string | null) => void;
  setPipelineName: (name: string) => void;
  loadPipelineData: (data: {
    id: string;
    name: string;
    description: string | null;
    nodes: PipelineNode[];
    edges: PipelineEdge[];
    access: PipelineAccess;
  }) => void;
  setPipelineAccess: (access: PipelineAccess) => void;
  setLastSavedAt: (date: Date | null) => void;
  clearPipeline: () => void;
  setDirty: (dirty: boolean) => void;

  // Actions - UI
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Actions - Console
  addLog: (level: LogEntry["level"], message: string) => void;
  clearLogs: () => void;
  addApiCall: (call: Omit<ApiCallEntry, "id" | "timestamp">) => void;
  clearApiCalls: () => void;

  // Actions - Sample Data
  setSampleDataLoading: (nodeId: string, nodeLabel: string) => void;
  setSampleDataResult: (columns: string[], rows: Record<string, unknown>[]) => void;
  setSampleDataError: (error: string) => void;
  clearSampleData: () => void;

  // Actions - Sample Data by Node
  setNodeSampleLoading: (nodeId: string, nodeLabel: string) => void;
  setNodeSampleResult: (nodeId: string, columns: string[], rows: Record<string, unknown>[]) => void;
  setNodeSampleError: (nodeId: string, error: string) => void;
  clearNodeSample: (nodeId: string) => void;
  clearAllNodeSamples: () => void;
  hasNodeSample: (nodeId: string) => boolean;
}

// Initial state values
const initialState = {
  pipelineId: null,
  pipelineName: "Untitled Pipeline",
  pipelineDescription: null as string | null,
  isDirty: false,
  isOwner: true,
  permissionLevel: null as PipelinePermissionLevel | null,
  lastSavedAt: null as Date | null,
  nodes: [] as PipelineNode[],
  edges: [] as PipelineEdge[],
  selectedNodeIds: [] as string[],
  copiedNodes: [] as PipelineNode[],
  copiedEdges: [] as PipelineEdge[],
  isLoading: false,
  error: null,
  logs: [] as LogEntry[],
  apiCalls: [] as ApiCallEntry[],
  sampleData: null as SampleDataResult | null,
  sampleDataByNode: {} as Record<string, SampleDataResult>,
};

// We need to dynamically import applyNodeChanges and applyEdgeChanges
// because they're from @xyflow/react
let applyNodeChangesFunc: typeof applyNodeChanges;
let applyEdgeChangesFunc: typeof applyEdgeChanges;

// Lazy load the functions
const getReactFlowUtils = async () => {
  if (!applyNodeChangesFunc || !applyEdgeChangesFunc) {
    const { applyNodeChanges: anc, applyEdgeChanges: aec } = await import(
      "@xyflow/react"
    );
    applyNodeChangesFunc = anc;
    applyEdgeChangesFunc = aec;
  }
  return { applyNodeChanges: applyNodeChangesFunc, applyEdgeChanges: applyEdgeChangesFunc };
};

/**
 * Factory function to create a pipeline store
 * This pattern prevents hydration issues by ensuring server and client
 * start with the same state
 */
export const createPipelineStore = () => {
  return create<PipelineState>()(
    devtools(
      (set, get) => ({
        ...initialState,

        // Node actions
        setNodes: (nodes) => set({ nodes, isDirty: true }),

        onNodesChange: async (changes) => {
          const { applyNodeChanges } = await getReactFlowUtils();
          set({
            nodes: applyNodeChanges(changes, get().nodes),
            isDirty: true,
          });
        },

        addNode: (node) =>
          set((state) => ({
            nodes: [...state.nodes, node],
            isDirty: true,
          })),

        updateNodeData: (nodeId, data) =>
          set((state) => ({
            nodes: state.nodes.map((node) =>
              node.id === nodeId
                ? { ...node, data: { ...node.data, ...data } }
                : node
            ),
            isDirty: true,
          })),

        deleteNode: (nodeId) =>
          set((state) => ({
            nodes: state.nodes.filter((n) => n.id !== nodeId),
            edges: state.edges.filter(
              (e) => e.source !== nodeId && e.target !== nodeId
            ),
            selectedNodeIds: state.selectedNodeIds.filter((id) => id !== nodeId),
            isDirty: true,
          })),

        deleteNodes: (nodeIds) =>
          set((state) => {
            const nodeIdSet = new Set(nodeIds);
            return {
              nodes: state.nodes.filter((n) => !nodeIdSet.has(n.id)),
              edges: state.edges.filter(
                (e) => !nodeIdSet.has(e.source) && !nodeIdSet.has(e.target)
              ),
              selectedNodeIds: [],
              isDirty: true,
            };
          }),

        // Edge actions
        setEdges: (edges) => set({ edges, isDirty: true }),

        onEdgesChange: async (changes) => {
          const { applyEdgeChanges } = await getReactFlowUtils();
          set({
            edges: applyEdgeChanges(changes, get().edges),
            isDirty: true,
          });
        },

        addEdge: (edge) =>
          set((state) => ({
            edges: [...state.edges, edge],
            isDirty: true,
          })),

        deleteEdge: (edgeId) =>
          set((state) => ({
            edges: state.edges.filter((e) => e.id !== edgeId),
            isDirty: true,
          })),

        // Selection
        selectNode: (nodeId) => set({ selectedNodeIds: nodeId ? [nodeId] : [] }),

        selectNodes: (nodeIds) => set({ selectedNodeIds: nodeIds }),

        toggleNodeSelection: (nodeId) =>
          set((state) => {
            const isSelected = state.selectedNodeIds.includes(nodeId);
            return {
              selectedNodeIds: isSelected
                ? state.selectedNodeIds.filter((id) => id !== nodeId)
                : [...state.selectedNodeIds, nodeId],
            };
          }),

        clearSelection: () => set({ selectedNodeIds: [] }),

        // Clipboard
        copySelectedNodes: () =>
          set((state) => {
            const selectedNodeIdSet = new Set(state.selectedNodeIds);
            const nodesToCopy = state.nodes.filter((n) => selectedNodeIdSet.has(n.id));
            // Also copy edges that connect selected nodes
            const edgesToCopy = state.edges.filter(
              (e) => selectedNodeIdSet.has(e.source) && selectedNodeIdSet.has(e.target)
            );
            return {
              copiedNodes: nodesToCopy,
              copiedEdges: edgesToCopy,
            };
          }),

        pasteNodes: () =>
          set((state) => {
            if (state.copiedNodes.length === 0) return state;

            // Create ID mapping for new nodes
            const idMap = new Map<string, string>();
            const newNodes: PipelineNode[] = state.copiedNodes.map((node) => {
              const newId = `${node.type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
              idMap.set(node.id, newId);
              return {
                ...node,
                id: newId,
                position: {
                  x: node.position.x + 50,
                  y: node.position.y + 50,
                },
                data: {
                  ...node.data,
                  label: `${node.data.label} (copy)`,
                },
                selected: true,
              };
            });

            // Recreate edges with new IDs
            const newEdges: PipelineEdge[] = state.copiedEdges.map((edge) => ({
              ...edge,
              id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              source: idMap.get(edge.source) || edge.source,
              target: idMap.get(edge.target) || edge.target,
            }));

            return {
              nodes: [...state.nodes, ...newNodes],
              edges: [...state.edges, ...newEdges],
              selectedNodeIds: newNodes.map((n) => n.id),
              isDirty: true,
            };
          }),

        // Pipeline actions
        setPipeline: (id, name, description) =>
          set({
            pipelineId: id,
            pipelineName: name,
            pipelineDescription: description ?? null,
            isDirty: false,
          }),

        setPipelineName: (name) =>
          set({
            pipelineName: name,
            isDirty: true,
          }),

        loadPipelineData: (data) =>
          set({
            pipelineId: data.id,
            pipelineName: data.name,
            pipelineDescription: data.description,
            nodes: data.nodes,
            edges: data.edges,
            isOwner: data.access.isOwner,
            permissionLevel: data.access.permissionLevel,
            isDirty: false,
            lastSavedAt: new Date(),
          }),

        setPipelineAccess: (access) =>
          set({
            isOwner: access.isOwner,
            permissionLevel: access.permissionLevel,
          }),

        setLastSavedAt: (date) => set({ lastSavedAt: date }),

        clearPipeline: () =>
          set({
            ...initialState,
          }),

        setDirty: (dirty) => set({ isDirty: dirty }),

        // UI actions
        setLoading: (loading) => set({ isLoading: loading }),
        setError: (error) => set({ error }),

        // Console actions
        addLog: (level, message) =>
          set((state) => ({
            logs: [
              ...state.logs,
              {
                id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                timestamp: new Date(),
                level,
                message,
              },
            ],
          })),

        clearLogs: () => set({ logs: [] }),

        addApiCall: (call) =>
          set((state) => ({
            apiCalls: [
              ...state.apiCalls,
              {
                ...call,
                id: `api-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                timestamp: new Date(),
              },
            ],
          })),

        clearApiCalls: () => set({ apiCalls: [] }),

        // Sample data actions
        setSampleDataLoading: (nodeId, nodeLabel) =>
          set({
            sampleData: {
              nodeId,
              nodeLabel,
              timestamp: new Date(),
              columns: [],
              rows: [],
              rowCount: 0,
              isLoading: true,
            },
          }),

        setSampleDataResult: (columns, rows) =>
          set((state) => ({
            sampleData: state.sampleData
              ? {
                  ...state.sampleData,
                  columns,
                  rows,
                  rowCount: rows.length,
                  isLoading: false,
                  error: undefined,
                }
              : null,
          })),

        setSampleDataError: (error) =>
          set((state) => ({
            sampleData: state.sampleData
              ? {
                  ...state.sampleData,
                  isLoading: false,
                  error,
                }
              : null,
          })),

        clearSampleData: () => set({ sampleData: null }),

        // Sample data by node actions
        setNodeSampleLoading: (nodeId, nodeLabel) =>
          set((state) => ({
            sampleDataByNode: {
              ...state.sampleDataByNode,
              [nodeId]: {
                nodeId,
                nodeLabel,
                timestamp: new Date(),
                columns: [],
                rows: [],
                rowCount: 0,
                isLoading: true,
              },
            },
          })),

        setNodeSampleResult: (nodeId, columns, rows) =>
          set((state) => {
            const existing = state.sampleDataByNode[nodeId];
            if (!existing) return state;
            return {
              sampleDataByNode: {
                ...state.sampleDataByNode,
                [nodeId]: {
                  ...existing,
                  columns,
                  rows,
                  rowCount: rows.length,
                  isLoading: false,
                  error: undefined,
                },
              },
            };
          }),

        setNodeSampleError: (nodeId, error) =>
          set((state) => {
            const existing = state.sampleDataByNode[nodeId];
            if (!existing) return state;
            return {
              sampleDataByNode: {
                ...state.sampleDataByNode,
                [nodeId]: {
                  ...existing,
                  isLoading: false,
                  error,
                },
              },
            };
          }),

        clearNodeSample: (nodeId) =>
          set((state) => {
            const { [nodeId]: _, ...rest } = state.sampleDataByNode;
            return { sampleDataByNode: rest };
          }),

        clearAllNodeSamples: () => set({ sampleDataByNode: {} }),

        hasNodeSample: (nodeId) => {
          const state = get();
          return nodeId in state.sampleDataByNode;
        },
      }),
      { name: "PipelineStore" }
    )
  );
};

export type PipelineStore = ReturnType<typeof createPipelineStore>;

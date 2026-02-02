"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { createPipelineStore, type PipelineStore } from "@/stores/pipeline-store";

const PipelineStoreContext = createContext<PipelineStore | null>(null);

export interface PipelineStoreProviderProps {
  children: ReactNode;
}

/**
 * Provider component that initializes the pipeline Zustand store
 * This ensures no hydration mismatches between server and client
 */
export function PipelineStoreProvider({ children }: PipelineStoreProviderProps) {
  const storeRef = useRef<PipelineStore | undefined>(undefined);

  // Initialize store only once
  if (!storeRef.current) {
    storeRef.current = createPipelineStore();
  }

  return (
    <PipelineStoreContext.Provider value={storeRef.current}>
      {children}
    </PipelineStoreContext.Provider>
  );
}

/**
 * Hook to access the full pipeline store
 * Use this when you need multiple properties or actions
 */
export function usePipelineStore() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineStore must be used within PipelineStoreProvider");
  }
  return useStore(store);
}

/**
 * Optimized hook that only subscribes to nodes
 */
export function usePipelineNodes() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineNodes must be used within PipelineStoreProvider");
  }
  return useStore(store, (state) => state.nodes);
}

/**
 * Optimized hook that only subscribes to edges
 */
export function usePipelineEdges() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineEdges must be used within PipelineStoreProvider");
  }
  return useStore(store, (state) => state.edges);
}

/**
 * Optimized hook for selected node IDs (array)
 */
export function useSelectedNodeIds() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("useSelectedNodeIds must be used within PipelineStoreProvider");
  }
  return useStore(store, (state) => state.selectedNodeIds);
}

/**
 * Hook to get the first selected node object (for single-selection scenarios)
 */
export function useSelectedNode() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("useSelectedNode must be used within PipelineStoreProvider");
  }
  return useStore(store, (state) => {
    if (state.selectedNodeIds.length === 0) return null;
    return state.nodes.find((n) => n.id === state.selectedNodeIds[0]) ?? null;
  });
}

/**
 * Hook to get all selected nodes
 */
export function useSelectedNodes() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("useSelectedNodes must be used within PipelineStoreProvider");
  }
  return useStore(
    store,
    useShallow((state) => {
      const selectedSet = new Set(state.selectedNodeIds);
      return state.nodes.filter((n) => selectedSet.has(n.id));
    })
  );
}

/**
 * Hook for pipeline metadata
 */
export function usePipelineMetadata() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineMetadata must be used within PipelineStoreProvider");
  }
  return useStore(
    store,
    useShallow((state) => ({
      pipelineId: state.pipelineId,
      pipelineName: state.pipelineName,
      pipelineDescription: state.pipelineDescription,
      isDirty: state.isDirty,
      isOwner: state.isOwner,
      permissionLevel: state.permissionLevel,
      lastSavedAt: state.lastSavedAt,
    }))
  );
}

/**
 * Hook for loading and error state
 */
export function usePipelineUIState() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineUIState must be used within PipelineStoreProvider");
  }
  return useStore(
    store,
    useShallow((state) => ({
      isLoading: state.isLoading,
      error: state.error,
    }))
  );
}

/**
 * Hook for console logs
 */
export function usePipelineLogs() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineLogs must be used within PipelineStoreProvider");
  }
  return useStore(store, (state) => state.logs);
}

/**
 * Hook for API calls
 */
export function usePipelineApiCalls() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineApiCalls must be used within PipelineStoreProvider");
  }
  return useStore(store, (state) => state.apiCalls);
}

/**
 * Hook for node actions only
 */
export function usePipelineNodeActions() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineNodeActions must be used within PipelineStoreProvider");
  }
  return useStore(
    store,
    useShallow((state) => ({
      setNodes: state.setNodes,
      onNodesChange: state.onNodesChange,
      addNode: state.addNode,
      updateNodeData: state.updateNodeData,
      deleteNode: state.deleteNode,
      deleteNodes: state.deleteNodes,
      selectNode: state.selectNode,
      selectNodes: state.selectNodes,
      toggleNodeSelection: state.toggleNodeSelection,
      clearSelection: state.clearSelection,
    }))
  );
}

/**
 * Hook for clipboard actions
 */
export function usePipelineClipboard() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineClipboard must be used within PipelineStoreProvider");
  }
  return useStore(
    store,
    useShallow((state) => ({
      copiedNodes: state.copiedNodes,
      copiedEdges: state.copiedEdges,
      copySelectedNodes: state.copySelectedNodes,
      pasteNodes: state.pasteNodes,
    }))
  );
}

/**
 * Hook for edge actions only
 */
export function usePipelineEdgeActions() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineEdgeActions must be used within PipelineStoreProvider");
  }
  return useStore(
    store,
    useShallow((state) => ({
      setEdges: state.setEdges,
      onEdgesChange: state.onEdgesChange,
      addEdge: state.addEdge,
      deleteEdge: state.deleteEdge,
    }))
  );
}

/**
 * Hook for console actions
 */
export function usePipelineConsoleActions() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("usePipelineConsoleActions must be used within PipelineStoreProvider");
  }
  return useStore(
    store,
    useShallow((state) => ({
      addLog: state.addLog,
      clearLogs: state.clearLogs,
      addApiCall: state.addApiCall,
      clearApiCalls: state.clearApiCalls,
    }))
  );
}

/**
 * Hook for sample data state
 */
export function useSampleData() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("useSampleData must be used within PipelineStoreProvider");
  }
  return useStore(store, (state) => state.sampleData);
}

/**
 * Hook for sample data actions
 */
export function useSampleDataActions() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("useSampleDataActions must be used within PipelineStoreProvider");
  }
  return useStore(
    store,
    useShallow((state) => ({
      setSampleDataLoading: state.setSampleDataLoading,
      setSampleDataResult: state.setSampleDataResult,
      setSampleDataError: state.setSampleDataError,
      clearSampleData: state.clearSampleData,
    }))
  );
}

/**
 * Hook for sample data by node (all nodes)
 */
export function useSampleDataByNode() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("useSampleDataByNode must be used within PipelineStoreProvider");
  }
  return useStore(store, (state) => state.sampleDataByNode);
}

/**
 * Hook for sample data for a specific node
 */
export function useNodeSampleData(nodeId: string) {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("useNodeSampleData must be used within PipelineStoreProvider");
  }
  return useStore(store, (state) => state.sampleDataByNode[nodeId] ?? null);
}

/**
 * Hook for node sample data actions
 */
export function useNodeSampleDataActions() {
  const store = useContext(PipelineStoreContext);
  if (!store) {
    throw new Error("useNodeSampleDataActions must be used within PipelineStoreProvider");
  }
  return useStore(
    store,
    useShallow((state) => ({
      setNodeSampleLoading: state.setNodeSampleLoading,
      setNodeSampleResult: state.setNodeSampleResult,
      setNodeSampleError: state.setNodeSampleError,
      clearNodeSample: state.clearNodeSample,
      clearAllNodeSamples: state.clearAllNodeSamples,
    }))
  );
}

"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { NodeCategory, NodeSubtype } from "@/stores/pipeline-store";

interface DragData {
  category: NodeCategory;
  subtype: NodeSubtype;
}

interface DnDContextType {
  dragData: DragData | null;
  setDragData: (category: NodeCategory, subtype: NodeSubtype) => void;
  clearDragData: () => void;
}

const DnDContext = createContext<DnDContextType | null>(null);

export interface DnDProviderProps {
  children: ReactNode;
}

export function DnDProvider({ children }: DnDProviderProps) {
  const [dragData, setDragDataState] = useState<DragData | null>(null);

  const setDragData = useCallback(
    (category: NodeCategory, subtype: NodeSubtype) => {
      setDragDataState({ category, subtype });
    },
    []
  );

  const clearDragData = useCallback(() => {
    setDragDataState(null);
  }, []);

  return (
    <DnDContext.Provider value={{ dragData, setDragData, clearDragData }}>
      {children}
    </DnDContext.Provider>
  );
}

export function useDnD() {
  const context = useContext(DnDContext);
  if (!context) {
    throw new Error("useDnD must be used within a DnDProvider");
  }
  return context;
}

"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type AgentPanelState = "closed" | "minimized" | "expanded";

const STORAGE_KEY = "firefly_agent_panel_state_v2";
const LEGACY_STORAGE_KEY = "firefly_agent_panel_state";

function readStoredState(): AgentPanelState {
  if (typeof window === "undefined") return "expanded";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "minimized" || raw === "expanded" || raw === "closed") return raw;
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return "expanded";
}

function persistState(state: AgentPanelState) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, state);
  }
}

interface AgentPanelStore {
  state: AgentPanelState;
  hydrated: boolean;
  hydrate: () => void;
  setState: (state: AgentPanelState) => void;
  toggle: () => void;
  minimize: () => void;
  close: () => void;
}

export const useAgentPanelStore = create<AgentPanelStore>()(
  devtools(
    (set, get) => ({
      state: "closed",
      hydrated: false,
      hydrate: () => {
        if (get().hydrated) return;
        set({ state: readStoredState(), hydrated: true });
      },
      setState: (state) => {
        persistState(state);
        set({ state });
      },
      toggle: () => {
        const next = get().state === "expanded" ? "closed" : "expanded";
        persistState(next);
        set({ state: next });
      },
      minimize: () => {
        persistState("minimized");
        set({ state: "minimized" });
      },
      close: () => {
        persistState("closed");
        set({ state: "closed" });
      },
    }),
    { name: "AgentPanelStore" }
  )
);

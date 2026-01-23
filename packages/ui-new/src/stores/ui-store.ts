import { create } from "zustand";

export type ViewType = "home" | "versions" | "settings" | "guide" | "instances";

interface UIState {
  // State
  currentView: ViewType;
  showConsole: boolean;
  appVersion: string;

  // Actions
  toggleConsole: () => void;
  setView: (view: ViewType) => void;
  setAppVersion: (version: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  currentView: "home",
  showConsole: false,
  appVersion: "...",

  // Actions
  toggleConsole: () => {
    set((state) => ({ showConsole: !state.showConsole }));
  },

  setView: (view: ViewType) => {
    set({ currentView: view });
  },

  setAppVersion: (version: string) => {
    set({ appVersion: version });
  },
}));

// Provide lowercase alias for compatibility with existing imports.
// Use a function wrapper to ensure the named export exists as a callable value
// at runtime (some bundlers/tree-shakers may remove simple aliases).
export function useUiStore() {
  return useUIStore();
}

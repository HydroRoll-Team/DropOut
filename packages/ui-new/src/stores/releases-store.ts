import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { GithubRelease } from "@/types/bindings/core";

interface ReleasesState {
  // State
  releases: GithubRelease[];
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;

  // Actions
  loadReleases: () => Promise<void>;
  setReleases: (releases: GithubRelease[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsLoaded: (isLoaded: boolean) => void;
  setError: (error: string | null) => void;
}

export const useReleasesStore = create<ReleasesState>((set, get) => ({
  // Initial state
  releases: [],
  isLoading: false,
  isLoaded: false,
  error: null,

  // Actions
  loadReleases: async () => {
    const { isLoaded, isLoading } = get();

    // If already loaded or currently loading, skip to prevent duplicate requests
    if (isLoaded || isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const releases = await invoke<GithubRelease[]>("get_github_releases");
      set({ releases, isLoaded: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error("Failed to load releases:", e);
      set({ error });
    } finally {
      set({ isLoading: false });
    }
  },

  setReleases: (releases) => {
    set({ releases });
  },

  setIsLoading: (isLoading) => {
    set({ isLoading });
  },

  setIsLoaded: (isLoaded) => {
    set({ isLoaded });
  },

  setError: (error) => {
    set({ error });
  },
}));

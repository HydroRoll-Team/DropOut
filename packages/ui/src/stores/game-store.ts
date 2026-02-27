import { toast } from "sonner";
import { create } from "zustand";
import { getVersions } from "@/client";
import type { Version } from "@/types/bindings/manifest";

interface GameState {
  // State
  versions: Version[];
  selectedVersion: string;

  // Computed property
  latestRelease: Version | undefined;

  // Actions
  loadVersions: (instanceId?: string) => Promise<void>;
  startGame: (
    currentAccount: any,
    openLoginModal: () => void,
    activeInstanceId: string | null,
    setView: (view: any) => void,
  ) => Promise<void>;
  setSelectedVersion: (version: string) => void;
  setVersions: (versions: Version[]) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  // Initial state
  versions: [],
  selectedVersion: "",

  // Computed property
  get latestRelease() {
    return get().versions.find((v) => v.type === "release");
  },

  // Actions
  loadVersions: async (instanceId?: string) => {
    console.log("Loading versions for instance:", instanceId);
    try {
      // Ask the backend for known versions (optionally scoped to an instance).
      // The Tauri command `get_versions` is expected to return an array of `Version`.
      const versions = await getVersions();
      set({ versions: versions ?? [] });
    } catch (e) {
      console.error("Failed to load versions:", e);
      // Keep the store consistent on error by clearing versions.
      set({ versions: [] });
    }
  },

  startGame: async (
    currentAccount,
    openLoginModal,
    activeInstanceId,
    setView,
  ) => {
    const { selectedVersion } = get();

    if (!currentAccount) {
      alert("Please login first!");
      openLoginModal();
      return;
    }

    if (!selectedVersion) {
      alert("Please select a version!");
      return;
    }

    if (!activeInstanceId) {
      alert("Please select an instance first!");
      setView("instances");
      return;
    }

    toast.info("Preparing to launch " + selectedVersion + "...");

    try {
      // Note: In production, this would call Tauri invoke
      // const msg = await invoke<string>("start_game", {
      //   instanceId: activeInstanceId,
      //   versionId: selectedVersion,
      // });

      // Simulate success
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Game started successfully!");
    } catch (e) {
      console.error(e);
      toast.error(`Error: ${e}`);
    }
  },

  setSelectedVersion: (version: string) => {
    set({ selectedVersion: version });
  },

  setVersions: (versions: Version[]) => {
    set({ versions });
  },
}));

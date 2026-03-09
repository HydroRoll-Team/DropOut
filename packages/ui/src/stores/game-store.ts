import { toast } from "sonner";
import { create } from "zustand";
import { getVersions, getVersionsOfInstance, startGame as startGameCommand } from "@/client";
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
  ) => Promise<string | null>;
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
      const versions = instanceId
        ? await getVersionsOfInstance(instanceId)
        : await getVersions();
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
  ) => {
    const { selectedVersion } = get();

    if (!currentAccount) {
      toast.info("Please login first!");
      openLoginModal();
      return null;
    }

    if (!selectedVersion) {
      toast.info("Please select a version!");
      return null;
    }

    if (!activeInstanceId) {
      toast.info("Please select an instance first!");
      return null;
    }

    toast.info("Preparing to launch " + selectedVersion + "...");

    try {
      const message = await startGameCommand(activeInstanceId, selectedVersion);
      toast.success(message || "Game started successfully!");
      return message;
    } catch (e) {
      console.error(e);
      toast.error(`Error: ${e}`);
      return null;
    }
  },

  setSelectedVersion: (version: string) => {
    set({ selectedVersion: version });
  },

  setVersions: (versions: Version[]) => {
    set({ versions });
  },
}));

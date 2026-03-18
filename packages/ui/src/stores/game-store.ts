import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { create } from "zustand";
import {
  getVersions,
  getVersionsOfInstance,
  startGame as startGameCommand,
  stopGame as stopGameCommand,
} from "@/client";
import type { Account } from "@/types/bindings/auth";
import type { Version } from "@/types/bindings/manifest";

interface GameExitedEvent {
  instanceId: string;
  versionId: string;
  exitCode: number | null;
  wasStopped: boolean;
}

interface GameState {
  versions: Version[];
  selectedVersion: string;
  runningInstanceId: string | null;
  runningVersionId: string | null;
  launchingInstanceId: string | null;
  stoppingInstanceId: string | null;
  lifecycleUnlisten: UnlistenFn | null;

  latestRelease: Version | undefined;
  isGameRunning: boolean;

  initLifecycle: () => Promise<void>;
  loadVersions: (instanceId?: string) => Promise<void>;
  startGame: (
    currentAccount: Account | null,
    openLoginModal: () => void,
    activeInstanceId: string | null,
    versionId: string | null,
    setView: (view: string) => void,
  ) => Promise<string | null>;
  stopGame: (instanceId?: string | null) => Promise<string | null>;
  setSelectedVersion: (version: string) => void;
  setVersions: (versions: Version[]) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  versions: [],
  selectedVersion: "",
  runningInstanceId: null,
  runningVersionId: null,
  launchingInstanceId: null,
  stoppingInstanceId: null,
  lifecycleUnlisten: null,

  get latestRelease() {
    return get().versions.find((v) => v.type === "release");
  },

  get isGameRunning() {
    return get().runningInstanceId !== null;
  },

  initLifecycle: async () => {
    if (get().lifecycleUnlisten) {
      return;
    }

    const unlisten = await listen<GameExitedEvent>("game-exited", (event) => {
      const { instanceId, versionId, wasStopped } = event.payload;

      set({
        runningInstanceId: null,
        runningVersionId: null,
        launchingInstanceId: null,
        stoppingInstanceId: null,
      });

      if (wasStopped) {
        toast.success(`Stopped Minecraft ${versionId} for instance ${instanceId}`);
      } else {
        toast.info(`Minecraft ${versionId} exited for instance ${instanceId}`);
      }
    });

    set({ lifecycleUnlisten: unlisten });
  },

  loadVersions: async (instanceId?: string) => {
    try {
      const versions = instanceId
        ? await getVersionsOfInstance(instanceId)
        : await getVersions();
      set({ versions: versions ?? [] });
    } catch (e) {
      console.error("Failed to load versions:", e);
      set({ versions: [] });
    }
  },

  startGame: async (
    currentAccount,
    openLoginModal,
    activeInstanceId,
    versionId,
    setView,
  ) => {
    const { isGameRunning } = get();
    const targetVersion = versionId ?? get().selectedVersion;

    if (!currentAccount) {
      toast.info("Please login first");
      openLoginModal();
      return null;
    }

    if (!targetVersion) {
      toast.info("Please select a version first");
      return null;
    }

    if (!activeInstanceId) {
      toast.info("Please select an instance first");
      setView("instances");
      return null;
    }

    if (isGameRunning) {
      toast.info("A game is already running");
      return null;
    }

    set({
      launchingInstanceId: activeInstanceId,
      selectedVersion: targetVersion,
    });
    toast.info(`Preparing to launch ${targetVersion}...`);

    try {
      const message = await startGameCommand(activeInstanceId, targetVersion);
      set({
        launchingInstanceId: null,
        runningInstanceId: activeInstanceId,
        runningVersionId: targetVersion,
      });
      toast.success(message);
      return message;
    } catch (e) {
      console.error(e);
      set({ launchingInstanceId: null });
      toast.error(`Error: ${e}`);
      return null;
    }
  },

  stopGame: async (instanceId) => {
    const { runningInstanceId } = get();

    if (!runningInstanceId) {
      toast.info("No running game found");
      return null;
    }

    if (instanceId && instanceId !== runningInstanceId) {
      toast.info("That instance is not the one currently running");
      return null;
    }

    set({ stoppingInstanceId: runningInstanceId });

    try {
      return await stopGameCommand();
    } catch (e) {
      console.error("Failed to stop game:", e);
      toast.error(`Failed to stop game: ${e}`);
      return null;
    } finally {
      set({ stoppingInstanceId: null });
    }
  },

  setSelectedVersion: (version: string) => {
    set({ selectedVersion: version });
  },

  setVersions: (versions: Version[]) => {
    set({ versions });
  },
}));

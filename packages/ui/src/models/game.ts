import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { create } from "zustand";
import {
  startGame as startGameCommand,
  stopGame as stopGameCommand,
} from "@/client";
import type { GameExitedEvent } from "@/types/bindings/core";

interface GameState {
  runningInstanceId: string | null;
  runningVersionId: string | null;
  launchingInstanceId: string | null;
  stoppingInstanceId: string | null;
  lifecycleUnlisten: UnlistenFn | null;

  isGameRunning: boolean;
  startGame: (instanceId: string, versionId: string) => Promise<string | null>;
  stopGame: (instanceId?: string | null) => Promise<string | null>;
}

export const useGameStore = create<GameState>((set, get) => ({
  runningInstanceId: null,
  runningVersionId: null,
  launchingInstanceId: null,
  stoppingInstanceId: null,
  lifecycleUnlisten: null,

  get isGameRunning() {
    return get().runningInstanceId !== null;
  },

  startGame: async (instanceId, versionId) => {
    const { isGameRunning, lifecycleUnlisten } = get();

    if (isGameRunning) {
      toast.info("A game is already running");
      return null;
    } else {
      lifecycleUnlisten?.();
    }

    set({
      launchingInstanceId: instanceId,
    });
    toast.info(`Preparing to launch ${versionId}...`);

    const unlisten = await listen<GameExitedEvent>("game-exited", (event) => {
      const { instanceId, versionId, wasStopped, exitCode } = event.payload;

      set({
        runningInstanceId: null,
        runningVersionId: null,
        launchingInstanceId: null,
        stoppingInstanceId: null,
      });

      if (wasStopped) {
        toast.success(
          `Stopped Minecraft ${versionId} for instance ${instanceId}`,
        );
      } else {
        toast.info(
          `Minecraft ${versionId} exited with code ${exitCode} for instance ${instanceId}`,
        );
      }
    });

    set({ lifecycleUnlisten: unlisten });

    try {
      const message = await startGameCommand(instanceId, versionId);
      set({
        launchingInstanceId: null,
        runningInstanceId: instanceId,
        runningVersionId: versionId,
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

    if (instanceId !== runningInstanceId) {
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
}));

import { toast } from "sonner";
import { create } from "zustand";
import {
  startGame as startGameCommand,
  stopGame as stopGameCommand,
} from "@/client";
import { listen, type UnlistenFn } from "@/lib/launcher-runtime";
import type { GameExitedEvent } from "@/types/bindings/core";

export type GameLogSource = "launcher" | "stdout" | "stderr";

export interface GameLogEntry {
  id: number;
  source: GameLogSource;
  message: string;
}

interface GameState {
  runningInstanceId: string | null;
  runningVersionId: string | null;
  launchingInstanceId: string | null;
  stoppingInstanceId: string | null;
  lastExit: GameExitedEvent | null;
  lastError: string | null;
  lastErrorInstanceId: string | null;
  recentLogs: GameLogEntry[];
  eventUnlisteners: UnlistenFn[];
  initialization: Promise<void> | null;

  isGameRunning: boolean;
  initialize: () => Promise<void>;
  appendLog: (source: GameLogSource, message: string) => void;
  clearFailure: () => void;
  startGame: (instanceId: string, versionId: string) => Promise<string | null>;
  stopGame: (instanceId?: string | null) => Promise<string | null>;
}

let nextLogId = 1;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const useGameStore = create<GameState>((set, get) => ({
  runningInstanceId: null,
  runningVersionId: null,
  launchingInstanceId: null,
  stoppingInstanceId: null,
  lastExit: null,
  lastError: null,
  lastErrorInstanceId: null,
  recentLogs: [],
  eventUnlisteners: [],
  initialization: null,

  get isGameRunning() {
    return get().runningInstanceId !== null;
  },

  appendLog: (source, message) => {
    const normalized = message.trim();
    if (!normalized) return;

    set((state) => ({
      recentLogs: [
        ...state.recentLogs,
        { id: nextLogId++, source, message: normalized },
      ].slice(-80),
    }));
  },

  initialize: async () => {
    const current = get();
    if (current.eventUnlisteners.length > 0) return;
    if (current.initialization) return current.initialization;

    const initialization = Promise.all([
      listen<GameExitedEvent>("game-exited", (event) => {
        const { instanceId, versionId, wasStopped, exitCode } = event.payload;
        const failed = !wasStopped && exitCode !== 0;

        set({
          runningInstanceId: null,
          runningVersionId: null,
          launchingInstanceId: null,
          stoppingInstanceId: null,
          lastExit: event.payload,
          lastError: failed
            ? `Minecraft ${versionId} exited with code ${exitCode ?? "unknown"}`
            : null,
          lastErrorInstanceId: failed ? instanceId : null,
        });

        get().appendLog(
          failed ? "stderr" : "launcher",
          wasStopped
            ? `Stopped Minecraft ${versionId} for ${instanceId}`
            : `Minecraft ${versionId} exited with code ${exitCode ?? "unknown"}`,
        );
      }),
      listen<string>("launcher-log", (event) => {
        get().appendLog("launcher", event.payload);
      }),
      listen<string>("game-stdout", (event) => {
        get().appendLog("stdout", event.payload);
      }),
      listen<string>("game-stderr", (event) => {
        get().appendLog("stderr", event.payload);
      }),
    ])
      .then((eventUnlisteners) => {
        set({ eventUnlisteners, initialization: null });
      })
      .catch((error) => {
        console.error("Failed to initialize game event listeners:", error);
        set({ initialization: null });
      });

    set({ initialization });
    return initialization;
  },

  clearFailure: () =>
    set({ lastError: null, lastErrorInstanceId: null, lastExit: null }),

  startGame: async (instanceId, versionId) => {
    const { isGameRunning, initialize } = get();
    await initialize();

    if (isGameRunning) {
      toast.info("A game is already running");
      return null;
    }

    set({
      launchingInstanceId: instanceId,
      lastError: null,
      lastErrorInstanceId: null,
      lastExit: null,
      recentLogs: [],
    });
    get().appendLog("launcher", `Preparing Minecraft ${versionId}`);

    try {
      const message = await startGameCommand(instanceId, versionId);
      set({
        launchingInstanceId: null,
        runningInstanceId: instanceId,
        runningVersionId: versionId,
      });
      get().appendLog("launcher", message);
      toast.success(message);
      return message;
    } catch (error) {
      const message = errorMessage(error);
      console.error("Failed to start game:", error);
      set({
        launchingInstanceId: null,
        lastError: message,
        lastErrorInstanceId: instanceId,
      });
      get().appendLog("stderr", message);
      toast.error(`Error: ${message}`);
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
      const message = await stopGameCommand();
      get().appendLog("launcher", message);
      return message;
    } catch (error) {
      const message = errorMessage(error);
      console.error("Failed to stop game:", error);
      set({ lastError: message, lastErrorInstanceId: runningInstanceId });
      get().appendLog("stderr", message);
      toast.error(`Failed to stop game: ${message}`);
      return null;
    } finally {
      set({ stoppingInstanceId: null });
    }
  },
}));

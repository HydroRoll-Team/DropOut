import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { ProgressEvent } from "@/types";

export type DownloadPhase =
  | "idle"
  | "preparing"
  | "downloading"
  | "finalizing"
  | "installing-mod-loader"
  | "completed"
  | "error";

export interface DownloadState {
  /** Whether a download session is active */
  phase: DownloadPhase;

  /** Total number of files to download */
  totalFiles: number;
  /** Number of files completed */
  completedFiles: number;

  /** Current file being downloaded */
  currentFile: string;
  /** Current file status */
  currentFileStatus: string;

  /** Bytes downloaded for current file */
  currentFileDownloaded: number;
  /** Total bytes for current file */
  currentFileTotal: number;

  /** Total bytes downloaded across all files */
  totalDownloadedBytes: number;

  /** Error message if any */
  errorMessage: string | null;

  /** Phase label for display (e.g. "Installing Fabric...") */
  phaseLabel: string;

  // Actions
  init: () => Promise<void>;
  cleanup: () => void;
  reset: () => void;
  setPhase: (phase: DownloadPhase, label?: string) => void;
  setError: (message: string) => void;
}

let unlisteners: UnlistenFn[] = [];
let initialized = false;

// Throttle progress updates to avoid excessive re-renders.
// We buffer the latest event and flush on a timer.
let progressTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProgress: ProgressEvent | null = null;
const PROGRESS_INTERVAL_MS = 50; // ~20 fps

export const useDownloadStore = create<DownloadState>((set, get) => ({
  phase: "idle",
  totalFiles: 0,
  completedFiles: 0,
  currentFile: "",
  currentFileStatus: "",
  currentFileDownloaded: 0,
  currentFileTotal: 0,
  totalDownloadedBytes: 0,
  errorMessage: null,
  phaseLabel: "",

  init: async () => {
    if (initialized) return;
    initialized = true;

    const flushProgress = () => {
      const p = pendingProgress;
      if (!p) return;
      pendingProgress = null;
      set({
        currentFile: p.file,
        currentFileStatus: p.status,
        currentFileDownloaded: Number(p.downloaded),
        currentFileTotal: Number(p.total),
        completedFiles: p.completedFiles,
        totalFiles: p.totalFiles,
        totalDownloadedBytes: Number(p.totalDownloadedBytes),
      });
    };

    const unlistenStart = await listen<number>("download-start", (e) => {
      set({
        phase: "downloading",
        totalFiles: e.payload,
        completedFiles: 0,
        currentFile: "",
        currentFileStatus: "",
        currentFileDownloaded: 0,
        currentFileTotal: 0,
        totalDownloadedBytes: 0,
        errorMessage: null,
        phaseLabel: "Downloading files...",
      });
    });

    const unlistenProgress = await listen<ProgressEvent>(
      "download-progress",
      (e) => {
        pendingProgress = e.payload;
        if (!progressTimer) {
          progressTimer = setTimeout(() => {
            progressTimer = null;
            flushProgress();
          }, PROGRESS_INTERVAL_MS);
        }
      },
    );

    const unlistenComplete = await listen("download-complete", () => {
      // Flush any pending progress before transitioning
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = null;
      }
      if (pendingProgress) {
        const p = pendingProgress;
        pendingProgress = null;
        set({
          currentFile: p.file,
          currentFileStatus: p.status,
          currentFileDownloaded: Number(p.downloaded),
          currentFileTotal: Number(p.total),
          completedFiles: p.completedFiles,
          totalFiles: p.totalFiles,
          totalDownloadedBytes: Number(p.totalDownloadedBytes),
        });
      }

      const { phase } = get();
      // Downloads finished; move to finalizing while we wait for the
      // install command to return and the caller to set the next phase.
      if (phase === "downloading") {
        set({
          phase: "finalizing",
          phaseLabel: "Finalizing installation...",
        });
      }
    });

    unlisteners = [unlistenStart, unlistenProgress, unlistenComplete];
  },

  cleanup: () => {
    if (progressTimer) {
      clearTimeout(progressTimer);
      progressTimer = null;
    }
    pendingProgress = null;
    for (const unlisten of unlisteners) {
      unlisten();
    }
    unlisteners = [];
    initialized = false;
  },

  reset: () => {
    set({
      phase: "idle",
      totalFiles: 0,
      completedFiles: 0,
      currentFile: "",
      currentFileStatus: "",
      currentFileDownloaded: 0,
      currentFileTotal: 0,
      totalDownloadedBytes: 0,
      errorMessage: null,
      phaseLabel: "",
    });
  },

  setPhase: (phase, label) => {
    set({
      phase,
      phaseLabel: label ?? "",
    });
  },

  setError: (message) => {
    set({
      phase: "error",
      errorMessage: message,
      phaseLabel: "Error",
    });
  },
}));

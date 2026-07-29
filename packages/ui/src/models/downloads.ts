import { create } from "zustand";
import { listen, type UnlistenFn } from "@/lib/launcher-runtime";
import type {
  JavaDownloadProgress,
  ProgressEvent,
} from "@/types/bindings/downloader";

interface DownloadState {
  active: boolean;
  kind: "game" | "java" | null;
  currentFile: string | null;
  status: string | null;
  completedFiles: number;
  totalFiles: number;
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
  eventUnlisteners: UnlistenFn[];
  initialization: Promise<void> | null;

  initialize: () => Promise<void>;
  reset: () => void;
}

const initialProgress = {
  active: false,
  kind: null,
  currentFile: null,
  status: null,
  completedFiles: 0,
  totalFiles: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  percentage: 0,
} as const;

function boundedPercentage(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  ...initialProgress,
  eventUnlisteners: [],
  initialization: null,

  initialize: async () => {
    const current = get();
    if (current.eventUnlisteners.length > 0) return;
    if (current.initialization) return current.initialization;

    const initialization = Promise.all([
      listen<number>("download-start", (event) => {
        set({
          ...initialProgress,
          active: true,
          kind: "game",
          status: "Preparing",
          totalFiles: Number(event.payload),
        });
      }),
      listen<ProgressEvent>("download-progress", (event) => {
        const progress = event.payload;
        const completedFiles = Number(progress.completedFiles);
        const totalFiles = Number(progress.totalFiles);
        const downloadedBytes = Number(progress.downloaded);
        const totalBytes = Number(progress.total);
        const currentFileFraction =
          totalBytes > 0 ? downloadedBytes / totalBytes : 0;
        const percentage =
          totalFiles > 0
            ? ((completedFiles + currentFileFraction) / totalFiles) * 100
            : 0;

        set({
          active: true,
          kind: "game",
          currentFile: progress.file,
          status: progress.status,
          completedFiles,
          totalFiles,
          downloadedBytes,
          totalBytes,
          percentage: boundedPercentage(percentage),
        });
      }),
      listen<void>("download-complete", () => {
        set((state) => ({
          active: false,
          status: "Completed",
          completedFiles: state.totalFiles,
          percentage: 100,
        }));
      }),
      listen<JavaDownloadProgress>("java-download-progress", (event) => {
        const progress = event.payload;
        const completed = progress.status.toLowerCase() === "completed";
        set({
          active: !completed,
          kind: "java",
          currentFile: progress.fileName,
          status: progress.status,
          completedFiles: completed ? 1 : 0,
          totalFiles: 1,
          downloadedBytes: Number(progress.downloadedBytes),
          totalBytes: Number(progress.totalBytes),
          percentage: boundedPercentage(progress.percentage),
        });
      }),
    ])
      .then((eventUnlisteners) => {
        set({ eventUnlisteners, initialization: null });
      })
      .catch((error) => {
        console.error("Failed to initialize download listeners:", error);
        set({ initialization: null });
      });

    set({ initialization });
    return initialization;
  },

  reset: () => set(initialProgress),
}));

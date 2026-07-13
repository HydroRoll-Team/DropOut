import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug" | "fatal";
  source: string;
  message: string;
}

// Parse Minecraft/Java log format: [HH:MM:SS] [Thread/LEVEL]: message
// or: [HH:MM:SS] [Thread/LEVEL] [Source]: message
const GAME_LOG_REGEX =
  /^\[[\d:]+\]\s*\[([^\]]+)\/(\w+)\](?:\s*\[([^\]]+)\])?:\s*(.*)$/;

function parseGameLogLevel(levelStr: string): LogEntry["level"] {
  const upper = levelStr.toUpperCase();
  if (upper === "INFO") return "info";
  if (upper === "WARN" || upper === "WARNING") return "warn";
  if (upper === "ERROR" || upper === "SEVERE") return "error";
  if (
    upper === "DEBUG" ||
    upper === "TRACE" ||
    upper === "FINE" ||
    upper === "FINER" ||
    upper === "FINEST"
  )
    return "debug";
  if (upper === "FATAL") return "fatal";
  return "info";
}

interface LogsState {
  // State
  logs: LogEntry[];
  sources: Set<string>;
  nextId: number;
  maxLogs: number;
  initialized: boolean;

  // Actions
  addLog: (level: LogEntry["level"], source: string, message: string) => void;
  addGameLog: (rawLine: string, isStderr: boolean) => void;
  clear: () => void;
  exportLogs: (filteredLogs: LogEntry[]) => string;
  init: () => Promise<void>;
  setLogs: (logs: LogEntry[]) => void;
  setSources: (sources: Set<string>) => void;
}

export const useLogsStore = create<LogsState>((set, get) => ({
  // Initial state
  logs: [],
  sources: new Set(["Launcher"]),
  nextId: 0,
  maxLogs: 5000,
  initialized: false,

  // Actions
  addLog: (level, source, message) => {
    const { nextId, logs, maxLogs, sources } = get();
    const now = new Date();
    const timestamp =
      now.toLocaleTimeString() +
      "." +
      now.getMilliseconds().toString().padStart(3, "0");

    const newLog: LogEntry = {
      id: nextId,
      timestamp,
      level,
      source,
      message,
    };

    const newLogs = [...logs, newLog];
    const newSources = new Set(sources);

    // Track source
    if (!newSources.has(source)) {
      newSources.add(source);
    }

    // Trim logs if exceeding max
    const trimmedLogs =
      newLogs.length > maxLogs ? newLogs.slice(-maxLogs) : newLogs;

    set({
      logs: trimmedLogs,
      sources: newSources,
      nextId: nextId + 1,
    });
  },

  addGameLog: (rawLine, isStderr) => {
    const match = rawLine.match(GAME_LOG_REGEX);

    if (match) {
      const [, thread, levelStr, extraSource, message] = match;
      const level = parseGameLogLevel(levelStr);
      // Use extraSource if available, otherwise use thread name as source hint
      const source = extraSource || `Game/${thread.split("-")[0]}`;
      get().addLog(level, source, message);
    } else {
      // Fallback: couldn't parse, use stderr as error indicator
      const level = isStderr ? "error" : "info";
      get().addLog(level, "Game", rawLine);
    }
  },

  clear: () => {
    set({
      logs: [],
      sources: new Set(["Launcher"]),
    });
    get().addLog("info", "Launcher", "Logs cleared");
  },

  exportLogs: (filteredLogs) => {
    return filteredLogs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.source}/${l.level.toUpperCase()}] ${l.message}`,
      )
      .join("\n");
  },

  init: async () => {
    const { initialized } = get();
    if (initialized) return;

    set({ initialized: true });

    // Initial log
    get().addLog("info", "Launcher", "Logs initialized");

    // General Launcher Logs
    await listen<string>("launcher-log", (e) => {
      get().addLog("info", "Launcher", e.payload);
    });

    // Game Stdout - parse log level
    await listen<string>("game-stdout", (e) => {
      get().addGameLog(e.payload, false);
    });

    // Game Stderr - parse log level, default to error
    await listen<string>("game-stderr", (e) => {
      get().addGameLog(e.payload, true);
    });

    // Download Events (Summarized)
    await listen("download-start", (e: any) => {
      get().addLog(
        "info",
        "Downloader",
        `Starting batch download of ${e.payload} files...`,
      );
    });

    await listen("download-complete", () => {
      get().addLog("info", "Downloader", "All downloads completed.");
    });

    // Listen to file download progress to log finished files
    await listen<any>("download-progress", (e) => {
      const p = e.payload;
      if (p.status === "Finished") {
        if (p.file.endsWith(".jar")) {
          get().addLog("info", "Downloader", `Downloaded ${p.file}`);
        }
      }
    });

    // Java Download
    await listen<any>("java-download-progress", (e) => {
      const p = e.payload;
      if (p.status === "Downloading" && p.percentage === 0) {
        get().addLog(
          "info",
          "JavaInstaller",
          `Downloading Java: ${p.file_name}`,
        );
      } else if (p.status === "Completed") {
        get().addLog("info", "JavaInstaller", `Java installed: ${p.file_name}`);
      } else if (p.status === "Error") {
        get().addLog("error", "JavaInstaller", `Java download error`);
      }
    });
  },

  setLogs: (logs) => {
    set({ logs });
  },

  setSources: (sources) => {
    set({ sources });
  },
}));

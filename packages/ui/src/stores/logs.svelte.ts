import { listen } from "@tauri-apps/api/event";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug" | "fatal";
  source: string;
  message: string;
}

// Parse Minecraft/Java log format: [HH:MM:SS] [Thread/LEVEL]: message
// or: [HH:MM:SS] [Thread/LEVEL] [Source]: message
const GAME_LOG_REGEX = /^\[[\d:]+\]\s*\[([^\]]+)\/(\w+)\](?:\s*\[([^\]]+)\])?:\s*(.*)$/;

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

export class LogsState {
  logs = $state<LogEntry[]>([]);
  private nextId = 0;
  private maxLogs = 5000;

  // Track all unique sources for filtering
  sources = $state<Set<string>>(new Set(["Launcher"]));

  constructor() {
    this.addLog("info", "Launcher", "Logs initialized");
  }

  addLog(level: LogEntry["level"], source: string, message: string) {
    const now = new Date();
    const timestamp =
      now.toLocaleTimeString() + "." + now.getMilliseconds().toString().padStart(3, "0");

    this.logs.push({
      id: this.nextId++,
      timestamp,
      level,
      source,
      message,
    });

    // Track source
    if (!this.sources.has(source)) {
      this.sources = new Set([...this.sources, source]);
    }

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  // Parse game output and extract level/source
  addGameLog(rawLine: string, isStderr: boolean) {
    const match = rawLine.match(GAME_LOG_REGEX);

    if (match) {
      const [, thread, levelStr, extraSource, message] = match;
      const level = parseGameLogLevel(levelStr);
      // Use extraSource if available, otherwise use thread name as source hint
      const source = extraSource || `Game/${thread.split("-")[0]}`;
      this.addLog(level, source, message);
    } else {
      // Fallback: couldn't parse, use stderr as error indicator
      const level = isStderr ? "error" : "info";
      this.addLog(level, "Game", rawLine);
    }
  }

  clear() {
    this.logs = [];
    this.sources = new Set(["Launcher"]);
    this.addLog("info", "Launcher", "Logs cleared");
  }

  // Export with filter support
  exportLogs(filteredLogs: LogEntry[]): string {
    return filteredLogs
      .map((l) => `[${l.timestamp}] [${l.source}/${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
  }

  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // General Launcher Logs
    await listen<string>("launcher-log", (e) => {
      this.addLog("info", "Launcher", e.payload);
    });

    // Game Stdout - parse log level
    await listen<string>("game-stdout", (e) => {
      this.addGameLog(e.payload, false);
    });

    // Game Stderr - parse log level, default to error
    await listen<string>("game-stderr", (e) => {
      this.addGameLog(e.payload, true);
    });

    // Download Events (Summarized)
    await listen("download-start", (e) => {
      this.addLog("info", "Downloader", `Starting batch download of ${e.payload} files...`);
    });

    await listen("download-complete", () => {
      this.addLog("info", "Downloader", "All downloads completed.");
    });

    // Listen to file download progress to log finished files
    await listen<any>("download-progress", (e) => {
      const p = e.payload;
      if (p.status === "Finished") {
        if (p.file.endsWith(".jar")) {
          this.addLog("info", "Downloader", `Downloaded ${p.file}`);
        }
      }
    });

    // Java Download
    await listen<any>("java-download-progress", (e) => {
      const p = e.payload;
      if (p.status === "Downloading" && p.percentage === 0) {
        this.addLog("info", "JavaInstaller", `Downloading Java: ${p.file_name}`);
      } else if (p.status === "Completed") {
        this.addLog("info", "JavaInstaller", `Java installed: ${p.file_name}`);
      } else if (p.status === "Error") {
        this.addLog("error", "JavaInstaller", `Java download error`);
      }
    });
  }
}

export const logsState = new LogsState();

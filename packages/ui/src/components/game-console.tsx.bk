import { Copy, Download, Filter, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLogsStore } from "@/stores/logs-store";
import { useUIStore } from "@/stores/ui-store";

export function GameConsole() {
  const uiStore = useUIStore();
  const logsStore = useLogsStore();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(
    new Set(["info", "warn", "error", "debug", "fatal"]),
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const levelColors: Record<string, string> = {
    info: "text-blue-400",
    warn: "text-amber-400",
    error: "text-red-400",
    debug: "text-purple-400",
    fatal: "text-rose-400",
  };

  const levelBgColors: Record<string, string> = {
    info: "bg-blue-400/10",
    warn: "bg-amber-400/10",
    error: "bg-red-400/10",
    debug: "bg-purple-400/10",
    fatal: "bg-rose-400/10",
  };

  // Filter logs based on search term and selected levels
  const filteredLogs = logsStore.logs.filter((log) => {
    const matchesSearch =
      searchTerm === "" ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.source.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesLevel = selectedLevels.has(log.level);

    return matchesSearch && matchesLevel;
  });

  // Auto-scroll to bottom when new logs arrive or autoScroll is enabled
  useEffect(() => {
    if (autoScroll && consoleEndRef.current && filteredLogs.length > 0) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredLogs, autoScroll]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        // Focus search input
        const searchInput = document.querySelector(
          'input[type="text"]',
        ) as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
      // Escape to close console
      if (e.key === "Escape") {
        uiStore.toggleConsole();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [uiStore.toggleConsole]);

  const toggleLevel = (level: string) => {
    const newLevels = new Set(selectedLevels);
    if (newLevels.has(level)) {
      newLevels.delete(level);
    } else {
      newLevels.add(level);
    }
    setSelectedLevels(newLevels);
  };

  const handleCopyAll = () => {
    const logsText = logsStore.exportLogs(filteredLogs);
    navigator.clipboard.writeText(logsText);
  };

  const handleExport = () => {
    const logsText = logsStore.exportLogs(filteredLogs);
    const blob = new Blob([logsText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dropout_logs_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    logsStore.clear();
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-700 bg-[#252526]">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white">Game Console</h2>
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-400">Logs:</span>
            <span className="text-xs font-medium text-emerald-400">
              {filteredLogs.length}
            </span>
            <span className="text-xs text-zinc-400">/</span>
            <span className="text-xs text-zinc-400">
              {logsStore.logs.length}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => uiStore.toggleConsole()}
          className="p-2 text-zinc-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 border-b border-zinc-700 bg-[#2D2D30]">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500"
            size={16}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-10 pr-4 py-2 bg-[#3E3E42] border border-zinc-600 rounded text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              ×
            </button>
          )}
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-1">
          {Object.entries(levelColors).map(([level, colorClass]) => (
            <button
              type="button"
              key={level}
              onClick={() => toggleLevel(level)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                selectedLevels.has(level)
                  ? `${levelBgColors[level]} ${colorClass}`
                  : "bg-[#3E3E42] text-zinc-400 hover:text-white"
              }`}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyAll}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            title="Copy all logs"
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            title="Export logs"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            title="Clear logs"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Auto-scroll Toggle */}
        <div className="flex items-center gap-2 pl-2 border-l border-zinc-700">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-9 h-5 bg-zinc-700 peer-focus:outline-none peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-2 text-xs text-zinc-400">Auto-scroll</span>
          </label>
        </div>
      </div>

      {/* Logs Container */}
      <div
        ref={logsContainerRef}
        className="flex-1 overflow-y-auto font-mono text-sm bg-[#1E1E1E]"
        style={{ fontFamily: "'Cascadia Code', 'Consolas', monospace" }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-zinc-500">
              <Filter className="mx-auto mb-2" size={24} />
              <p>No logs match the current filters</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-1">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="group hover:bg-white/5 p-2 rounded transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`px-2 py-0.5 rounded text-xs font-medium ${levelBgColors[log.level]} ${levelColors[log.level]}`}
                  >
                    {log.level.toUpperCase()}
                  </div>
                  <div className="text-zinc-400 text-xs shrink-0">
                    {log.timestamp}
                  </div>
                  <div className="text-amber-300 text-xs shrink-0">
                    [{log.source}]
                  </div>
                  <div className="text-gray-300 flex-1">{log.message}</div>
                </div>
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-zinc-700 bg-[#252526] text-xs text-zinc-400">
        <div className="flex items-center gap-4">
          <div>
            <span>Total: </span>
            <span className="text-white">{logsStore.logs.length}</span>
            <span> | Filtered: </span>
            <span className="text-emerald-400">{filteredLogs.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-[#3E3E42] rounded text-xs">
              Ctrl+K
            </kbd>
            <span>to search</span>
          </div>
        </div>
        <div>
          <span>Updated: </span>
          <span>
            {new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      </div>
    </>
  );
}

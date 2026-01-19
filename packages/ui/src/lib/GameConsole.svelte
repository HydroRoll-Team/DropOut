<script lang="ts">
  import { logsState, type LogEntry } from "../stores/logs.svelte";
  import { uiState } from "../stores/ui.svelte";
  import { save } from "@tauri-apps/plugin-dialog";
  import { writeTextFile } from "@tauri-apps/plugin-fs";
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-shell";
  import { onMount, tick } from "svelte";
  import CustomSelect from "../components/CustomSelect.svelte";
  import { ChevronDown, Check } from 'lucide-svelte';

  let consoleElement: HTMLDivElement;
  let autoScroll = $state(true);
  
  // Search & Filter
  let searchQuery = $state("");
  let showInfo = $state(true);
  let showWarn = $state(true);
  let showError = $state(true);
  let showDebug = $state(false);
  
  // Source filter: "all" or specific source name
  let selectedSource = $state("all");

  // Get sorted sources for dropdown
  let sourceOptions = $derived([
    { value: "all", label: "All Sources" },
    ...[...logsState.sources].sort().map(s => ({ value: s, label: s }))
  ]);

  // Derived filtered logs
  let filteredLogs = $derived(logsState.logs.filter((log) => {
    // Source Filter
    if (selectedSource !== "all" && log.source !== selectedSource) return false;

    // Level Filter
    if (!showInfo && log.level === "info") return false;
    if (!showWarn && log.level === "warn") return false;
    if (!showError && (log.level === "error" || log.level === "fatal")) return false;
    if (!showDebug && log.level === "debug") return false;

    // Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.source.toLowerCase().includes(q)
      );
    }
    return true;
  }));

  // Auto-scroll logic
  $effect(() => {
    // Depend on filteredLogs length to trigger scroll
    if (filteredLogs.length && autoScroll && consoleElement) {
        // Use tick to wait for DOM update
        tick().then(() => {
            consoleElement.scrollTop = consoleElement.scrollHeight;
        });
    }
  });

  function handleScroll() {
    if (!consoleElement) return;
    const { scrollTop, scrollHeight, clientHeight } = consoleElement;
    // If user scrolls up (more than 50px from bottom), disable auto-scroll
    if (scrollHeight - scrollTop - clientHeight > 50) {
      autoScroll = false;
    } else {
      autoScroll = true;
    }
  }

  // Export only currently filtered logs
  async function exportLogs() {
    try {
      const content = logsState.exportLogs(filteredLogs);
      const path = await save({
        filters: [{ name: "Log File", extensions: ["txt", "log"] }],
        defaultPath: `dropout-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
      });
      
      if (path) {
        await writeTextFile(path, content);
        logsState.addLog("info", "Console", `Exported ${filteredLogs.length} logs to ${path}`);
      }
    } catch (e) {
      console.error("Export failed", e);
      logsState.addLog("error", "Console", `Export failed: ${e}`);
    }
  }

  // Upload only currently filtered logs
  async function uploadLogs() {
    try {
        const content = logsState.exportLogs(filteredLogs);
        logsState.addLog("info", "Console", `Uploading ${filteredLogs.length} logs...`);
        
        const response = await invoke<{ url: string }>("upload_to_pastebin", { content });
        
        logsState.addLog("info", "Console", `Logs uploaded successfully: ${response.url}`);
        await open(response.url);
    } catch (e) {
        console.error("Upload failed", e);
        logsState.addLog("error", "Console", `Upload failed: ${e}`);
    }
  }

  function highlightText(text: string, query: string) {
    if (!query) return text;
    // Escape regex special chars in query
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return parts.map(part => 
        part.toLowerCase() === query.toLowerCase() 
            ? `<span class="bg-yellow-500/30 text-yellow-200 font-bold">${part}</span>` 
            : part
    ).join("");
  }

  function getLevelColor(level: LogEntry["level"]) {
    switch (level) {
      case "info": return "text-blue-400";
      case "warn": return "text-yellow-400";
      case "error": 
      case "fatal": return "text-red-400";
      case "debug": return "text-purple-400";
      default: return "text-zinc-400";
    }
  }

  function getLevelLabel(level: LogEntry["level"]) {
    switch (level) {
      case "info": return "INFO";
      case "warn": return "WARN";
      case "error": return "ERR";
      case "fatal": return "FATAL";
      case "debug": return "DEBUG";
    }
  }

  function getMessageColor(log: LogEntry) {
    if (log.level === "error" || log.level === "fatal") return "text-red-300";
    if (log.level === "warn") return "text-yellow-200";
    if (log.level === "debug") return "text-purple-200/70";
    if (log.source.startsWith("Game")) return "text-emerald-100/80";
    return "";
  }
</script>

<div class="absolute inset-0 flex flex-col bg-[#1e1e1e] text-zinc-300 font-mono text-xs overflow-hidden">
  <!-- Toolbar -->
  <div class="flex flex-wrap items-center justify-between p-2 bg-[#252526] border-b border-[#3e3e42] gap-2">
    <div class="flex items-center gap-3">
        <h3 class="font-bold text-zinc-100 uppercase tracking-wider px-2">Console</h3>
        
        <!-- Source Dropdown -->
        <CustomSelect
            options={sourceOptions}
            bind:value={selectedSource}
            class="w-36"
        />

        <!-- Level Filters -->
        <div class="flex items-center bg-[#1e1e1e] rounded border border-[#3e3e42] overflow-hidden">
            <button 
                class="px-2 py-1 hover:bg-[#3e3e42] transition-colors {showInfo ? 'text-blue-400' : 'text-zinc-600'}" 
                onclick={() => showInfo = !showInfo} 
                title="Toggle Info"
            >Info</button>
            <div class="w-px h-3 bg-[#3e3e42]"></div>
            <button 
                class="px-2 py-1 hover:bg-[#3e3e42] transition-colors {showWarn ? 'text-yellow-400' : 'text-zinc-600'}" 
                onclick={() => showWarn = !showWarn}
                title="Toggle Warnings"
            >Warn</button>
            <div class="w-px h-3 bg-[#3e3e42]"></div>
            <button 
                class="px-2 py-1 hover:bg-[#3e3e42] transition-colors {showError ? 'text-red-400' : 'text-zinc-600'}" 
                onclick={() => showError = !showError}
                title="Toggle Errors"
            >Error</button>
            <div class="w-px h-3 bg-[#3e3e42]"></div>
            <button 
                class="px-2 py-1 hover:bg-[#3e3e42] transition-colors {showDebug ? 'text-purple-400' : 'text-zinc-600'}" 
                onclick={() => showDebug = !showDebug}
                title="Toggle Debug"
            >Debug</button>
        </div>

        <!-- Search -->
        <div class="relative group">
            <input 
                type="text" 
                bind:value={searchQuery}
                placeholder="Find..." 
                class="bg-[#1e1e1e] border border-[#3e3e42] rounded pl-8 pr-2 py-1 focus:border-indigo-500 focus:outline-none w-40 text-zinc-300 placeholder:text-zinc-600 transition-all focus:w-64"
            />
            <svg class="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            {#if searchQuery}
                <button class="absolute right-2 top-1.5 text-zinc-500 hover:text-white" onclick={() => searchQuery = ""}>✕</button>
            {/if}
        </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
        <!-- Log count indicator -->
        <span class="text-zinc-500 text-[10px] px-2">{filteredLogs.length} / {logsState.logs.length}</span>
        
        <button 
            onclick={() => logsState.clear()}
            class="p-1.5 hover:bg-[#3e3e42] rounded text-zinc-400 hover:text-white transition-colors"
            title="Clear Logs"
        >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
        <button 
            onclick={exportLogs}
            class="p-1.5 hover:bg-[#3e3e42] rounded text-zinc-400 hover:text-white transition-colors"
            title="Export Filtered Logs"
        >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        </button>
        <button 
            onclick={uploadLogs}
            class="p-1.5 hover:bg-[#3e3e42] rounded text-zinc-400 hover:text-white transition-colors"
            title="Upload Filtered Logs"
        >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
        </button>
        <div class="w-px h-4 bg-[#3e3e42] mx-1"></div>
        <button 
            onclick={() => uiState.toggleConsole()}
            class="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded text-zinc-400 transition-colors"
            title="Close"
        >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
    </div>
  </div>

  <!-- Log Area -->
  <div 
    bind:this={consoleElement}
    onscroll={handleScroll}
    class="flex-1 overflow-y-auto overflow-x-hidden p-2 select-text custom-scrollbar"
  >
    {#each filteredLogs as log (log.id)}
        <div class="flex gap-2 leading-relaxed hover:bg-[#2a2d2e] px-1 rounded-sm group">
            <!-- Timestamp -->
            <span class="text-zinc-500 shrink-0 select-none w-20 text-right opacity-50 group-hover:opacity-100">{log.timestamp.split('.')[0]}</span>
            
            <!-- Source & Level -->
            <div class="flex shrink-0 min-w-[140px] gap-1 justify-end font-bold select-none truncate">
                <span class="text-zinc-500 truncate max-w-[90px]" title={log.source}>{log.source}</span>
                <span class={getLevelColor(log.level)}>{getLevelLabel(log.level)}</span>
            </div>

            <!-- Message -->
            <div class="flex-1 break-all whitespace-pre-wrap text-zinc-300 min-w-0 {getMessageColor(log)}">
                {@html highlightText(log.message, searchQuery)}
            </div>
        </div>
    {/each}
    
    {#if filteredLogs.length === 0}
        <div class="text-center text-zinc-600 mt-10 italic select-none">
            {#if logsState.logs.length === 0}
                Waiting for logs...
            {:else}
                No logs match current filters.
            {/if}
        </div>
    {/if}
  </div>
  
  <!-- Auto-scroll status -->
  {#if !autoScroll}
    <button 
        onclick={() => { autoScroll = true; consoleElement.scrollTop = consoleElement.scrollHeight; }}
        class="absolute bottom-4 right-6 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded shadow-lg text-xs font-bold transition-all animate-bounce"
    >
        Resume Auto-scroll ⬇
    </button>
  {/if}
</div>

<style>
    /* Custom Scrollbar for the log area */
    .custom-scrollbar::-webkit-scrollbar {
        width: 10px;
        background-color: #1e1e1e;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background-color: #424242;
        border: 2px solid #1e1e1e; /* padding around thumb */
        border-radius: 0;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background-color: #4f4f4f;
    }
</style>

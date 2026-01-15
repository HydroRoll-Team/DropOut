<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount, onDestroy } from "svelte";

  export let visible = false;

  let logs: {
    type: "stdout" | "stderr" | "launcher";
    line: string;
    timestamp: string;
  }[] = [];

  let consoleElement: HTMLDivElement | undefined;
  let unlistenStdout: () => void;
  let unlistenStderr: () => void;
  let unlistenLauncher: () => void;
  let unlistenGameExited: () => void;

  function getTimestamp(): string {
    const now = new Date();
    return now.toTimeString().split(" ")[0]; // HH:MM:SS
  }

  onMount(async () => {
    // Listen for launcher logs (preparation, downloads, launch status)
    unlistenLauncher = await listen<string>("launcher-log", (event) => {
      addLog("launcher", event.payload);
    });

    // Listen for game stdout
    unlistenStdout = await listen<string>("game-stdout", (event) => {
      addLog("stdout", event.payload);
    });

    // Listen for game stderr
    unlistenStderr = await listen<string>("game-stderr", (event) => {
      addLog("stderr", event.payload);
    });

    // Listen for game exit event
    unlistenGameExited = await listen<number>("game-exited", (event) => {
      addLog("launcher", `Game process exited with code: ${event.payload}`);
    });
  });

  onDestroy(() => {
    if (unlistenLauncher) unlistenLauncher();
    if (unlistenStdout) unlistenStdout();
    if (unlistenStderr) unlistenStderr();
    if (unlistenGameExited) unlistenGameExited();
  });

  function addLog(type: "stdout" | "stderr" | "launcher", line: string) {
    logs = [...logs, { type, line, timestamp: getTimestamp() }];
    if (logs.length > 2000) {
      logs = logs.slice(logs.length - 2000);
    }
    // Auto-scroll
    setTimeout(() => {
      if (consoleElement) {
        consoleElement.scrollTop = consoleElement.scrollHeight;
      }
    }, 0);
  }

  function clearLogs() {
    logs = [];
  }

  function exportLogs() {
    const logText = logs
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.line}`)
      .join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dropout-logs-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

{#if visible}
  <div
    class="fixed bottom-0 left-0 right-0 h-64 bg-zinc-950/95 border-t border-zinc-700 flex flex-col z-50 transition-transform duration-300 transform translate-y-0"
  >
    <div
      class="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50"
    >
      <div class="flex items-center gap-4">
        <span class="text-xs font-bold text-zinc-400 uppercase tracking-widest"
          >Logs</span
        >
        <div class="flex gap-1 text-[10px]">
          <span class="px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-300"
            >LAUNCHER</span
          >
          <span class="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300"
            >GAME</span
          >
          <span class="px-1.5 py-0.5 rounded bg-red-900/50 text-red-300"
            >ERROR</span
          >
        </div>
      </div>
      <div class="flex gap-2">
        <button
          on:click={exportLogs}
          class="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded transition"
          >Export</button
        >
        <button
          on:click={clearLogs}
          class="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded transition"
          >Clear</button
        >
        <button
          on:click={() => (visible = false)}
          class="text-xs text-zinc-500 hover:text-white px-2 py-1 rounded transition"
          >Close</button
        >
      </div>
    </div>
    <div
      bind:this={consoleElement}
      class="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-0.5"
    >
      {#each logs as log}
        <div
          class="flex whitespace-pre-wrap break-all {log.type === 'stderr'
            ? 'text-red-400'
            : log.type === 'launcher'
              ? 'text-indigo-300'
              : 'text-zinc-300'}"
        >
          <span class="text-zinc-600 mr-2 shrink-0">{log.timestamp}</span>
          <span
            class="shrink-0 mr-2 {log.type === 'stderr'
              ? 'text-red-500'
              : log.type === 'launcher'
                ? 'text-indigo-500'
                : 'text-zinc-500'}"
            >[{log.type === "launcher"
              ? "LAUNCHER"
              : log.type === "stderr"
                ? "ERROR"
                : "GAME"}]</span
          >
          <span class="break-all">{log.line}</span>
        </div>
      {/each}
      {#if logs.length === 0}
        <div class="text-zinc-600 italic">
          Waiting for output... Click "Show Logs" and start a game to see logs
          here.
        </div>
      {/if}
    </div>
  </div>
{/if}

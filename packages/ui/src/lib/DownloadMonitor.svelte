<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount, onDestroy } from "svelte";

  export let visible = false;

  interface DownloadEvent {
    file: string;
    downloaded: number; // in bytes
    total: number; // in bytes
    status: string;
    completed_files: number;
    total_files: number;
    total_downloaded_bytes: number;
  }

  let currentFile = "";
  let progress = 0; // percentage 0-100 (current file)
  let totalProgress = 0; // percentage 0-100 (all files)
  let totalFiles = 0;
  let completedFiles = 0;
  let statusText = "Preparing...";
  let unlistenProgress: () => void;
  let unlistenStart: () => void;
  let unlistenComplete: () => void;
  let downloadedBytes = 0;
  let totalBytes = 0;

  // Speed and ETA tracking
  let downloadSpeed = 0; // bytes per second
  let etaSeconds = 0;
  let startTime = 0;
  let totalDownloadedBytes = 0;
  let lastUpdateTime = 0;
  let lastTotalBytes = 0;

  onMount(async () => {
    unlistenStart = await listen<number>("download-start", (event) => {
      visible = true;
      totalFiles = event.payload;
      completedFiles = 0;
      progress = 0;
      totalProgress = 0;
      statusText = "Starting download...";
      currentFile = "";
      // Reset speed tracking
      startTime = Date.now();
      totalDownloadedBytes = 0;
      downloadSpeed = 0;
      etaSeconds = 0;
      lastUpdateTime = Date.now();
      lastTotalBytes = 0;
    });

    unlistenProgress = await listen<DownloadEvent>(
      "download-progress",
      (event) => {
        const payload = event.payload;
        currentFile = payload.file;

        // Current file progress
        downloadedBytes = payload.downloaded;
        totalBytes = payload.total;

        statusText = payload.status;

        if (payload.total > 0) {
          progress = (payload.downloaded / payload.total) * 100;
        }

        // Total progress (all files)
        completedFiles = payload.completed_files;
        totalFiles = payload.total_files;
        if (totalFiles > 0) {
          const currentFileFraction =
            payload.total > 0 ? payload.downloaded / payload.total : 0;
          totalProgress = ((completedFiles + currentFileFraction) / totalFiles) * 100;
        }

        // Calculate download speed (using moving average)
        totalDownloadedBytes = payload.total_downloaded_bytes;
        const now = Date.now();
        const timeDiff = (now - lastUpdateTime) / 1000; // seconds
        
        if (timeDiff >= 0.5) { // Update speed every 0.5 seconds
          const bytesDiff = totalDownloadedBytes - lastTotalBytes;
          const instantSpeed = bytesDiff / timeDiff;
          // Smooth the speed with exponential moving average
          downloadSpeed = downloadSpeed === 0 ? instantSpeed : downloadSpeed * 0.7 + instantSpeed * 0.3;
          lastUpdateTime = now;
          lastTotalBytes = totalDownloadedBytes;
        }

        // Estimate remaining time
        if (downloadSpeed > 0 && completedFiles < totalFiles) {
          const remainingFiles = totalFiles - completedFiles;
          let estimatedRemainingBytes: number;

          if (completedFiles > 0) {
            // Use average size of completed files to estimate remaining files
            const avgBytesPerCompletedFile = totalDownloadedBytes / completedFiles;
            estimatedRemainingBytes = avgBytesPerCompletedFile * remainingFiles;
          } else {
            // No completed files yet: estimate based only on current file's remaining bytes
            estimatedRemainingBytes = Math.max(totalBytes - downloadedBytes, 0);
          }
          etaSeconds = estimatedRemainingBytes / downloadSpeed;
        } else {
          etaSeconds = 0;
        }
      }
    );

    unlistenComplete = await listen("download-complete", () => {
      statusText = "Done!";
      progress = 100;
      totalProgress = 100;
      setTimeout(() => {
        visible = false;
      }, 2000);
    });
  });

  onDestroy(() => {
    if (unlistenProgress) unlistenProgress();
    if (unlistenStart) unlistenStart();
    if (unlistenComplete) unlistenComplete();
  });

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatSpeed(bytesPerSecond: number) {
    if (bytesPerSecond === 0) return "-- /s";
    return formatBytes(bytesPerSecond) + "/s";
  }

  function formatTime(seconds: number) {
    if (seconds <= 0 || !isFinite(seconds)) return "--";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
</script>

{#if visible}
  <div
    class="fixed bottom-28 right-8 z-50 w-80 bg-zinc-900/90  border border-zinc-700 rounded-lg shadow-2xl p-4 animate-in slide-in-from-right-10 fade-in duration-300"
  >
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-white font-bold text-sm">Downloads</h3>
      <span class="text-xs text-zinc-400">{statusText}</span>
    </div>

    <!-- Total Progress Bar -->
    <div class="mb-3">
      <div class="flex justify-between text-[10px] text-zinc-400 mb-1">
        <span>Total Progress</span>
        <span>{completedFiles} / {totalFiles} files</span>
      </div>
      <div class="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
        <div
          class="bg-gradient-to-r from-blue-500 to-cyan-400 h-2.5 rounded-full transition-all duration-200"
          style="width: {totalProgress}%"
        ></div>
      </div>
      <div class="flex justify-between text-[10px] text-zinc-500 font-mono mt-0.5">
        <span>{formatSpeed(downloadSpeed)} · ETA: {formatTime(etaSeconds)}</span>
        <span>{completedFiles < totalFiles ? Math.floor(totalProgress) : 100}%</span>
      </div>
    </div>

    <div class="text-xs text-zinc-300 truncate mb-1" title={currentFile}>
      {currentFile || "Waiting..."}
    </div>

    <!-- Current File Progress Bar -->
    <div class="w-full bg-zinc-800 rounded-full h-2 mb-2 overflow-hidden">
      <div
        class="bg-gradient-to-r from-green-500 to-emerald-400 h-2 rounded-full transition-all duration-200"
        style="width: {progress}%"
      ></div>
    </div>

    <div class="flex justify-between text-[10px] text-zinc-500 font-mono">
      <span>{formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}</span>
      <span>{Math.round(progress)}%</span>
    </div>
  </div>
{/if}

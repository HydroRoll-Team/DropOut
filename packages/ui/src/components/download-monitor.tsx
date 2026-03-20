import { CheckCircle, Download, Loader2, Package, XCircle } from "lucide-react";
import { useDownloadStore } from "@/stores/download-store";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function shortenFileName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Inline progress display for use inside dialogs or pages.
 * Reads from the global download store.
 */
export function DownloadProgress() {
  const {
    phase,
    totalFiles,
    completedFiles,
    currentFile,
    currentFileStatus,
    currentFileDownloaded,
    currentFileTotal,
    totalDownloadedBytes,
    errorMessage,
    phaseLabel,
  } = useDownloadStore();

  if (phase === "idle") return null;

  const overallPercent =
    totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;

  const filePercent =
    currentFileTotal > 0
      ? Math.round((currentFileDownloaded / currentFileTotal) * 100)
      : 0;

  return (
    <div className="space-y-4 min-w-0 overflow-hidden tabular-nums">
      {/* Phase header */}
      <div className="flex items-center gap-2 min-w-0">
        {phase === "preparing" && (
          <Loader2 className="h-4 w-4 shrink-0 text-indigo-400 animate-spin" />
        )}
        {phase === "downloading" && (
          <Download className="h-4 w-4 shrink-0 text-indigo-400 animate-pulse" />
        )}
        {phase === "finalizing" && (
          <Loader2 className="h-4 w-4 shrink-0 text-indigo-400 animate-spin" />
        )}
        {phase === "installing-mod-loader" && (
          <Package className="h-4 w-4 shrink-0 text-indigo-400 animate-pulse" />
        )}
        {phase === "completed" && (
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
        )}
        {phase === "error" && (
          <XCircle className="h-4 w-4 shrink-0 text-red-400" />
        )}
        <span className="text-sm font-medium truncate">{phaseLabel}</span>
      </div>

      {/* Preparing phase — no file counts yet */}
      {phase === "preparing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          <span className="truncate">Resolving version and assets...</span>
        </div>
      )}

      {/* Overall progress */}
      {phase === "downloading" && totalFiles > 0 && (
        <div className="space-y-2 min-w-0">
          {/* Overall bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Overall: {completedFiles} / {totalFiles} files
              </span>
              <span className="shrink-0 ml-2 w-10 text-right">
                {overallPercent}%
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {formatBytes(totalDownloadedBytes)} downloaded
            </div>
          </div>

          {/* Current file — always reserve space to avoid layout shifts */}
          <div className="min-h-[2.5rem] border-t border-border pt-2 min-w-0">
            {currentFile && currentFileStatus !== "Finished" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground truncate w-0 grow">
                    {shortenFileName(currentFile)}
                  </span>
                  <span className="text-muted-foreground shrink-0 w-16 text-right">
                    {currentFileStatus === "Downloading"
                      ? `${filePercent}%`
                      : currentFileStatus}
                  </span>
                </div>
                {currentFileStatus === "Downloading" &&
                  currentFileTotal > 0 && (
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400/60 rounded-full transition-all duration-150"
                        style={{ width: `${filePercent}%` }}
                      />
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Finalizing phase — downloads done, waiting for install to finish */}
      {phase === "finalizing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          <span className="truncate">Verifying installation...</span>
        </div>
      )}

      {/* Mod loader install phase */}
      {phase === "installing-mod-loader" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          <span className="truncate">{phaseLabel}</span>
        </div>
      )}

      {/* Error */}
      {phase === "error" && errorMessage && (
        <div className="text-sm text-red-400 break-words">{errorMessage}</div>
      )}

      {/* Completed */}
      {phase === "completed" && (
        <div className="text-sm text-emerald-400">
          Successfully installed {totalFiles > 0 ? `${totalFiles} files` : ""}
        </div>
      )}
    </div>
  );
}

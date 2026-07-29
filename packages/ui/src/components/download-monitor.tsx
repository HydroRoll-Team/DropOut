import { Download, FileDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useDownloadStore } from "@/models/downloads";

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

export function DownloadMonitor({ className }: { className?: string }) {
  const { t } = useTranslation();
  const download = useDownloadStore();

  if (!download.active && download.totalFiles === 0) return null;

  const percentage = Math.round(download.percentage);

  return (
    <section
      id="download-monitor"
      tabIndex={-1}
      aria-labelledby="download-monitor-title"
      aria-live="polite"
      className={cn(
        "border-border/80 bg-card/90 focus-visible:ring-ring overflow-hidden border shadow-sm backdrop-blur-xl focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      data-testid="download-monitor"
    >
      <div className="border-border/70 flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
            <Download className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="download-monitor-title" className="text-xs font-semibold">
              {t("downloadMonitor.title")}
            </h2>
            <p className="text-muted-foreground truncate text-[10px]">
              {download.kind === "java"
                ? t("downloadMonitor.javaRuntime")
                : t("downloadMonitor.gameFiles")}
            </p>
          </div>
        </div>
        <span className="text-primary font-mono text-xs font-bold">
          {percentage}%
        </span>
      </div>

      <div className="space-y-3 p-3">
        <div
          className="bg-muted h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-label={t("downloadMonitor.progress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex items-start gap-2">
          <FileDown
            className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11px]">
              {download.currentFile ?? t("downloadMonitor.preparing")}
            </p>
            <div className="text-muted-foreground mt-1 flex justify-between gap-2 text-[10px]">
              <span>
                {download.totalFiles > 0
                  ? t("downloadMonitor.files", {
                      completed: download.completedFiles,
                      total: download.totalFiles,
                    })
                  : download.status}
              </span>
              <span>
                {download.totalBytes > 0
                  ? `${formatBytes(download.downloadedBytes)} / ${formatBytes(download.totalBytes)}`
                  : download.status}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

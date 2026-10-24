import { FileDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SegBar } from "@/components/deco/marks";
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
        "win outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      data-testid="download-monitor"
    >
      <div aria-hidden="true" className="win-title">
        <span>{download.kind === "java" ? "JAVA.PKG" : "FETCH.EXE"}</span>
        <span className="opacity-70">{download.status}</span>
      </div>
      <div className="flex items-end justify-between gap-3 border-b border-rule px-2.5 py-1.5">
        <div className="min-w-0">
          <h2
            id="download-monitor-title"
            className="font-display text-[15px] font-semibold tracking-[-0.03em]"
          >
            {t("downloadMonitor.title")}
          </h2>
          <p className="type-pixel truncate text-[11px] text-ink/60">
            {download.kind === "java"
              ? t("downloadMonitor.javaRuntime")
              : t("downloadMonitor.gameFiles")}
          </p>
        </div>
        <span className="type-display text-[34px] leading-none">
          {percentage}%
        </span>
      </div>

      <div className="space-y-2 px-2.5 py-2">
        <div
          role="progressbar"
          aria-label={t("downloadMonitor.progress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <SegBar value={percentage / 100} segments={20} className="h-3" />
        </div>

        <div className="flex items-start gap-2">
          <FileDown
            className="mt-0.5 size-3.5 shrink-0 text-ink/60"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="type-mono truncate text-[11px]">
              {download.currentFile ?? t("downloadMonitor.preparing")}
            </p>
            <div className="type-pixel mt-1 flex justify-between gap-2 text-[11px] text-ink/60">
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

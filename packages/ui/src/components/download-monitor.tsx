import { X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function DownloadMonitor() {
  const [isVisible, setIsVisible] = useState(true);
  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-foreground">
            {t("downloadMonitor.title")}
          </span>
        </div>
        <button
          type="button"
          aria-label={t("downloadMonitor.close")}
          onClick={() => setIsVisible(false)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="space-y-3">
          {/* Download Item */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-foreground">Minecraft 1.20.4</span>
              <span className="text-muted-foreground">65%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: "65%" }}
              ></div>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>142 MB / 218 MB</span>
              <span>2.1 MB/s • 36s remaining</span>
            </div>
          </div>

          {/* Download Item */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-foreground">Java 17</span>
              <span className="text-muted-foreground">100%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full"></div>
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
              {t("downloadMonitor.completed")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

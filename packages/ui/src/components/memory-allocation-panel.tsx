import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  MemoryStick,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { LauncherConfig, MemoryAllocation } from "@/types";

type Props = {
  config: LauncherConfig;
  recommendation: MemoryAllocation | null;
  loading: boolean;
  error: string | null;
  onAutomaticChange: (checked: boolean) => Promise<void>;
  onManualChange: (memory: { minMemory?: number; maxMemory?: number }) => void;
  onManualSave: () => Promise<void>;
  onRefresh: () => Promise<void>;
};

function formatMemory(megabytes: number) {
  if (megabytes >= 1024) {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(megabytes / 1024)} GB`;
  }
  return `${new Intl.NumberFormat().format(megabytes)} MB`;
}

function parseMemoryInput(value: string, minimum: number, maximum: number) {
  if (value.trim() === "") return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

export function MemoryAllocationPanel({
  config,
  recommendation,
  loading,
  error,
  onAutomaticChange,
  onManualChange,
  onManualSave,
  onRefresh,
}: Props) {
  const { t } = useTranslation();
  const pressure = recommendation?.pressure ?? "healthy";
  const availableRatio = recommendation
    ? Math.min(
        100,
        Math.round(
          (recommendation.availableMemoryMb /
            Math.max(1, recommendation.totalMemoryMb)) *
            100,
        ),
      )
    : 0;
  const sourceLabel = recommendation
    ? t(`settings.jvm.source.${recommendation.source}`)
    : t("settings.jvm.source.automatic");
  const workloadLabel = recommendation
    ? t(`settings.jvm.workload.${recommendation.workload}`)
    : t("settings.jvm.workload.vanilla");
  const PressureIcon = pressure === "healthy" ? CheckCircle2 : AlertTriangle;

  return (
    <section
      aria-labelledby="memory-policy-title"
      data-testid="memory-allocation-panel"
      className="border-border/80 bg-background/35 relative overflow-hidden border"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          pressure === "healthy" && "bg-emerald-500",
          pressure === "constrained" && "bg-amber-500",
          pressure === "critical" && "bg-red-500",
        )}
      />

      <div className="flex flex-col gap-4 p-4 pl-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
              <MemoryStick className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id="memory-policy-title" className="text-sm font-bold">
                {t("settings.jvm.memoryTitle")}
              </h3>
              <p className="text-muted-foreground mt-1 max-w-2xl text-xs leading-relaxed">
                {t("settings.jvm.memoryDescription")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("settings.jvm.refreshMemory")}
              title={t("settings.jvm.refreshMemory")}
              disabled={loading}
              onClick={() => void onRefresh()}
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
                aria-hidden="true"
              />
            </Button>
            <Switch
              id="automatic-memory"
              aria-label={t("settings.jvm.automaticMemory")}
              checked={config.autoMemory}
              onCheckedChange={(checked) => void onAutomaticChange(checked)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border/60 py-2">
          <div>
            <p className="text-xs font-semibold">
              {config.autoMemory
                ? t("settings.jvm.automaticMemory")
                : t("settings.jvm.manualMemory")}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {config.autoMemory
                ? t("settings.jvm.automaticMemoryHint")
                : t("settings.jvm.manualMemoryHint")}
            </p>
          </div>
          <span className="border-border bg-card text-muted-foreground border px-2 py-1 font-mono text-[9px] font-bold tracking-[0.1em] uppercase">
            {sourceLabel}
          </span>
        </div>

        {recommendation?.source === "instance-override" && (
          <p className="border-amber-500/30 bg-amber-500/8 border px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
            {t("settings.jvm.instanceOverrideNotice")}
          </p>
        )}

        {error ? (
          <div role="alert" className="border-red-500/30 bg-red-500/8 p-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {t("settings.jvm.memoryUnavailable")}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{error}</p>
          </div>
        ) : (
          <div aria-live="polite" aria-busy={loading} className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="border-border/60 bg-card/60 border p-3">
                <p className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.1em] uppercase">
                  {t("settings.jvm.availableMemory")}
                </p>
                <p className="mt-1 text-lg font-black tracking-tight">
                  {recommendation
                    ? formatMemory(recommendation.availableMemoryMb)
                    : "—"}
                </p>
                <p className="text-muted-foreground text-[10px]">
                  {recommendation
                    ? t("settings.jvm.totalMemory", {
                        total: formatMemory(recommendation.totalMemoryMb),
                      })
                    : t("settings.jvm.readingMemory")}
                </p>
              </div>
              <div className="border-primary/30 bg-primary/5 border p-3">
                <p className="text-primary font-mono text-[9px] font-bold tracking-[0.1em] uppercase">
                  {t("settings.jvm.launchHeap")}
                </p>
                <p className="mt-1 text-lg font-black tracking-tight">
                  {recommendation
                    ? formatMemory(recommendation.appliedMaxMb)
                    : "—"}
                </p>
                <p className="text-muted-foreground text-[10px]">
                  {recommendation
                    ? t("settings.jvm.heapRange", {
                        min: formatMemory(recommendation.appliedMinMb),
                        max: formatMemory(recommendation.appliedMaxMb),
                      })
                    : t("settings.jvm.readingMemory")}
                </p>
              </div>
              <div className="border-border/60 bg-card/60 border p-3">
                <p className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.1em] uppercase">
                  {t("settings.jvm.systemReserve")}
                </p>
                <p className="mt-1 text-lg font-black tracking-tight">
                  {recommendation
                    ? formatMemory(recommendation.reservedMemoryMb)
                    : "—"}
                </p>
                <p className="text-muted-foreground text-[10px]">
                  {t("settings.jvm.systemReserveHint")}
                </p>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px]">
                <span className="text-muted-foreground">
                  {t("settings.jvm.availableShare")}
                </span>
                <span className="font-mono font-bold">{availableRatio}%</span>
              </div>
              <div
                role="progressbar"
                aria-label={t("settings.jvm.availableShare")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={availableRatio}
                className="bg-muted h-1.5 overflow-hidden"
              >
                <div
                  className="bg-primary h-full transition-[width] motion-reduce:transition-none"
                  style={{ width: `${availableRatio}%` }}
                />
              </div>
            </div>

            {recommendation && (
              <div
                className={cn(
                  "flex flex-col justify-between gap-2 border p-3 sm:flex-row sm:items-center",
                  pressure === "healthy" &&
                    "border-emerald-500/25 bg-emerald-500/6",
                  pressure === "constrained" &&
                    "border-amber-500/30 bg-amber-500/8",
                  pressure === "critical" && "border-red-500/30 bg-red-500/8",
                )}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <PressureIcon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      pressure === "healthy" && "text-emerald-600",
                      pressure === "constrained" && "text-amber-600",
                      pressure === "critical" && "text-red-600",
                    )}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs font-semibold">
                      {t(`settings.jvm.pressure.${pressure}.title`)}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {t(`settings.jvm.pressure.${pressure}.description`)}
                    </p>
                  </div>
                </div>
                <div className="text-muted-foreground flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
                  <Gauge className="size-3.5" aria-hidden="true" />
                  <span>
                    {workloadLabel} ·{" "}
                    {t("settings.jvm.modCount", {
                      count: recommendation.modCount,
                    })}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {!config.autoMemory && (
          <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
            <div>
              <label htmlFor="min-memory" className="text-xs font-semibold">
                {t("settings.jvm.minMemory")}
              </label>
              <Input
                id="min-memory"
                type="number"
                name="min-memory"
                className="mt-1.5"
                value={config.minMemory}
                min={256}
                max={config.maxMemory}
                onChange={(event) => {
                  const minMemory = parseMemoryInput(
                    event.target.value,
                    256,
                    config.maxMemory,
                  );
                  if (minMemory !== null) onManualChange({ minMemory });
                }}
                onBlur={() => void onManualSave()}
              />
            </div>
            <div>
              <label htmlFor="max-memory" className="text-xs font-semibold">
                {t("settings.jvm.maxMemory")}
              </label>
              <Input
                id="max-memory"
                type="number"
                name="max-memory"
                className="mt-1.5"
                value={config.maxMemory}
                min={config.minMemory}
                max={32768}
                onChange={(event) => {
                  const maxMemory = parseMemoryInput(
                    event.target.value,
                    config.minMemory,
                    32768,
                  );
                  if (maxMemory !== null) onManualChange({ maxMemory });
                }}
                onBlur={() => void onManualSave()}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

import { FolderOpen, Settings2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { getLaunchReadiness, installVersion, openFileExplorer } from "@/client";
import { DisplayTitle } from "@/components/deco/display-title";
import { DitherSky } from "@/components/deco/dither-sky";
import {
  DimensionLine,
  GlyphCallout,
  Leader,
  SegBar,
} from "@/components/deco/marks";
import { DaylightWidget, DropoutWidget } from "@/components/deco/widgets";
import { Win } from "@/components/deco/win";
import { DownloadMonitor } from "@/components/download-monitor";
import { LoginModal } from "@/components/login-modal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { resolveHomeLaunchState } from "@/lib/launch-readiness";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/models/auth";
import { useDownloadStore } from "@/models/downloads";
import { useGameStore } from "@/models/game";
import { useInstanceStore } from "@/models/instance";
import { useSettingsStore } from "@/models/settings";
import type { LaunchReadiness } from "@/types";

type CheckTone = "pass" | "warn" | "fail" | "pending" | "neutral";

interface ReadinessCheck {
  id: string;
  label: string;
  value: string;
  tone: CheckTone;
}

function formatMemory(megabytes: number) {
  if (megabytes >= 1024) {
    const gigabytes = megabytes / 1024;
    return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1)} GB`;
  }
  return `${megabytes} MB`;
}

/* 状态方块：过 = 实心绿，堵 = 实心红，要处理 = 黄，检查中 = 虚线框，不适用 = 空框 */
const toneSquare: Record<CheckTone, string> = {
  pass: "bg-go border-rule",
  fail: "bg-fault border-rule",
  warn: "bg-warn border-rule",
  pending: "border-dashed border-rule animate-pulse motion-reduce:animate-none",
  neutral: "border-rule",
};

function ReadinessRow({ check }: { check: ReadinessCheck }) {
  const { t } = useTranslation();

  return (
    <li className="flex min-w-0 items-center gap-2 border-b border-dashed border-rule/35 py-[3px] text-[12px] leading-4 last:border-b-0">
      <span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 border", toneSquare[check.tone])}
      />
      <Leader
        className="min-w-0 flex-1"
        label={
          <span className="type-pixel text-[11px] uppercase">
            {check.label}
          </span>
        }
        value={
          <span
            className={cn(
              "text-[12px] font-medium",
              check.tone === "fail" && "text-fault",
            )}
            title={check.value}
          >
            {check.value}
          </span>
        }
      />
      <span className="sr-only">{t(`home.checkTone.${check.tone}`)}</span>
    </li>
  );
}

/* jev 的「▶▶▶ Open Roles」 */
function TripleArrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 36 12"
      className={cn("h-[0.42em] w-auto shrink-0", className)}
      fill="currentColor"
    >
      <path d="M0 0l10 6-10 6zM12 0l10 6-10 6zM24 0l10 6-10 6z" />
    </svg>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activityRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const account = useAuthStore((state) => state.account);
  const authStatus = useAuthStore((state) => state.status);
  const authError = useAuthStore((state) => state.error);
  const refreshAuth = useAuthStore((state) => state.init);

  const instances = useInstanceStore((state) => state.instances);
  const activeInstance = useInstanceStore((state) => state.activeInstance);
  const instanceStatus = useInstanceStore((state) => state.status);
  const instanceError = useInstanceStore((state) => state.error);
  const refreshInstances = useInstanceStore((state) => state.refresh);
  const setActiveInstance = useInstanceStore(
    (state) => state.setActiveInstance,
  );

  const config = useSettingsStore((state) => state.config);
  const settingsStatus = useSettingsStore((state) => state.status);
  const settingsError = useSettingsStore((state) => state.error);
  const refreshSettings = useSettingsStore((state) => state.refresh);

  const downloadActive = useDownloadStore((state) => state.active);
  const downloadPercentage = useDownloadStore((state) => state.percentage);
  const downloadCompletedFiles = useDownloadStore(
    (state) => state.completedFiles,
  );
  const downloadTotalFiles = useDownloadStore((state) => state.totalFiles);

  const runningInstanceId = useGameStore((state) => state.runningInstanceId);
  const launchingInstanceId = useGameStore(
    (state) => state.launchingInstanceId,
  );
  const stoppingInstanceId = useGameStore((state) => state.stoppingInstanceId);
  const lastExit = useGameStore((state) => state.lastExit);
  const lastError = useGameStore((state) => state.lastError);
  const lastErrorInstanceId = useGameStore(
    (state) => state.lastErrorInstanceId,
  );
  const recentLogs = useGameStore((state) => state.recentLogs);
  const startGame = useGameStore((state) => state.startGame);
  const stopGame = useGameStore((state) => state.stopGame);

  const [probe, setProbe] = useState<LaunchReadiness | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeRevision, setProbeRevision] = useState(0);
  const [actionPending, setActionPending] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const requestRevision = probeRevision;

    if (!activeInstance?.versionId) {
      setProbe(null);
      setProbeError(null);
      setProbeLoading(false);
      return;
    }

    setProbe(null);
    setProbeError(null);
    setProbeLoading(true);

    void getLaunchReadiness(activeInstance.id, activeInstance.versionId)
      .then((nextProbe) => {
        if (!cancelled && requestRevision === probeRevision) {
          setProbe(nextProbe);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setProbeError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setProbeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeInstance?.id, activeInstance?.versionId, probeRevision]);

  const homeState = resolveHomeLaunchState({
    account,
    activeInstance,
    config,
    authStatus,
    instanceStatus,
    settingsStatus,
    probe,
    probeLoading,
    probeError,
    downloadActive,
    launchingInstanceId,
    runningInstanceId,
    lastExit,
    lastError: lastErrorInstanceId === activeInstance?.id ? lastError : null,
  });

  const memory = probe?.memory ?? null;
  const memoryValid =
    memory !== null &&
    memory.appliedMinMb > 0 &&
    memory.appliedMaxMb >= memory.appliedMinMb &&
    memory.pressure !== "critical";
  const runningInstance = instances.find(
    (instance) => instance.id === runningInstanceId,
  );

  const readinessChecks = useMemo<ReadinessCheck[]>(() => {
    const instanceReady = activeInstance !== null;
    const versionReady = Boolean(activeInstance?.versionId);
    const javaReady = probe?.java !== null && probe !== null;
    const filesReady = probe?.versionInstalled === true;

    return [
      {
        id: "account",
        label: t("home.check.account"),
        value: account?.username ?? t("home.value.notSignedIn"),
        tone: account ? "pass" : "fail",
      },
      {
        id: "instance",
        label: t("home.check.instance"),
        value: activeInstance?.name ?? t("home.value.noInstance"),
        tone: instanceReady ? "pass" : "fail",
      },
      {
        id: "version",
        label: t("home.check.version"),
        value: activeInstance?.versionId ?? t("home.value.noVersion"),
        tone: versionReady ? "pass" : "fail",
      },
      {
        id: "loader",
        label: t("home.check.loader"),
        value: activeInstance?.modLoader
          ? `${activeInstance.modLoader} ${activeInstance.modLoaderVersion ?? ""}`.trim()
          : versionReady
            ? t("home.value.vanilla")
            : t("home.value.notConfigured"),
        tone: versionReady ? "pass" : "neutral",
      },
      {
        id: "java",
        label: t("home.check.java"),
        value: probeLoading
          ? t("home.value.checking")
          : probe?.java
            ? `Java ${probe.java.version} · ${probe.java.vendor}`
            : probe?.requiredJavaMajor
              ? t("home.value.javaRequired", {
                  version: String(probe.requiredJavaMajor),
                })
              : t("home.value.javaMissing"),
        tone: probeLoading
          ? "pending"
          : javaReady
            ? "pass"
            : versionReady
              ? "fail"
              : "neutral",
      },
      {
        id: "memory",
        label: t("home.check.memory"),
        value: memory
          ? t(`home.value.memory.${memory.source}`, {
              min: formatMemory(memory.appliedMinMb),
              max: formatMemory(memory.appliedMaxMb),
            })
          : t("home.value.checking"),
        tone: !memory
          ? "pending"
          : memory.pressure === "critical"
            ? "fail"
            : memory.pressure === "constrained"
              ? "warn"
              : memoryValid
                ? "pass"
                : "fail",
      },
      {
        id: "files",
        label: t("home.check.files"),
        value: downloadActive
          ? t("home.value.downloadProgress", {
              percentage: Math.round(downloadPercentage),
            })
          : filesReady
            ? t("home.value.filesReady")
            : probeLoading
              ? t("home.value.checking")
              : t("home.value.filesMissing"),
        tone: downloadActive
          ? "pending"
          : filesReady
            ? "pass"
            : probeLoading
              ? "pending"
              : "warn",
      },
    ];
  }, [
    account,
    activeInstance,
    downloadActive,
    downloadPercentage,
    memory,
    memoryValid,
    probe,
    probeLoading,
    t,
  ]);

  const stateCopy = {
    eyebrow: t(`home.state.${homeState}.eyebrow`),
    title: t(`home.state.${homeState}.title`, {
      instance: runningInstance?.name ?? activeInstance?.name ?? "Minecraft",
    }),
    description: t(`home.state.${homeState}.description`, {
      instance: runningInstance?.name ?? activeInstance?.name ?? "Minecraft",
    }),
    action: t(`home.state.${homeState}.action`),
  };

  const errorDetail =
    (lastErrorInstanceId === activeInstance?.id ? lastError : null) ??
    probeError ??
    instanceError ??
    authError ??
    settingsError;

  const refreshReadiness = useCallback(async () => {
    await Promise.all([refreshAuth(), refreshSettings(), refreshInstances()]);
    setProbeRevision((revision) => revision + 1);
  }, [refreshAuth, refreshInstances, refreshSettings]);

  const handleInstanceChange = useCallback(
    async (instanceId: string) => {
      const nextInstance = instances.find(
        (instance) => instance.id === instanceId,
      );
      if (!nextInstance || nextInstance.id === activeInstance?.id) return;

      try {
        await setActiveInstance(nextInstance);
      } catch (error) {
        toast.error(
          t("home.activateFailed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
    [activeInstance?.id, instances, setActiveInstance, t],
  );

  const focusActivity = useCallback(() => {
    const target =
      activityRef.current ?? document.getElementById("download-monitor");
    target?.focus();
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  }, []);

  const handlePrimaryAction = useCallback(async () => {
    if (actionPending) return;

    if (homeState === "no-account") {
      setShowLoginModal(true);
      return;
    }
    if (homeState === "no-instance") {
      navigate("/instances");
      return;
    }
    if (homeState === "version-missing") {
      navigate("/instances");
      return;
    }
    if (homeState === "java-missing" || homeState === "memory-invalid") {
      navigate("/settings");
      return;
    }
    if (homeState === "downloading" || homeState === "failed") {
      focusActivity();
      return;
    }
    if (homeState === "running") {
      await stopGame(runningInstanceId);
      return;
    }
    if (homeState === "data-error") {
      setActionPending(true);
      try {
        await refreshReadiness();
      } finally {
        setActionPending(false);
      }
      return;
    }
    if (!activeInstance?.versionId) return;

    setActionPending(true);
    try {
      if (homeState === "files-missing") {
        await installVersion(activeInstance.id, activeInstance.versionId);
        setProbeRevision((revision) => revision + 1);
      } else if (homeState === "ready" || homeState === "stopped") {
        await startGame(activeInstance.id, activeInstance.versionId);
      }
    } catch (error) {
      toast.error(
        t("home.actionFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setActionPending(false);
    }
  }, [
    actionPending,
    activeInstance,
    focusActivity,
    homeState,
    navigate,
    refreshReadiness,
    runningInstanceId,
    startGame,
    stopGame,
    t,
  ]);

  const openLogs = useCallback(async () => {
    if (!activeInstance) return;
    try {
      await openFileExplorer(`${activeInstance.gameDir}/logs`);
    } catch (error) {
      toast.error(
        t("home.openLogsFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }, [activeInstance, t]);

  const actionPendingVisual =
    actionPending ||
    stoppingInstanceId !== null ||
    homeState === "checking" ||
    homeState === "launching";

  const primaryDisabled =
    actionPending ||
    stoppingInstanceId !== null ||
    homeState === "checking" ||
    homeState === "launching";

  const readyCount = readinessChecks.filter(
    (check) => check.tone === "pass",
  ).length;
  const blocked =
    homeState === "failed" ||
    homeState === "data-error" ||
    homeState === "memory-invalid";

  return (
    <div className="relative h-full overflow-x-hidden overflow-y-auto">
      {/* 色场：抖色天空铺满宽度、高度固定（默认窗口内容区的一半），往下散成纸面 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[355.5px]"
      >
        <DitherSky />
      </div>

      {/*
       * 两栏都是固定宽：左栏 551 贴左，右边那叠窗口 388 贴右，中间是留白。
       * 窗口比默认（1024）窄时只有右栏变窄，左栏和标题不动。
       */}
      <div
        className="relative grid min-h-full grid-cols-[551px_minmax(20px,1fr)_minmax(0,388px)] px-6 pt-4 pb-10"
        data-tour="bottom-bar"
      >
        {/* ---------- 左：标题 / 说明 / 主操作 / 日志 ---------- */}
        <div className="col-start-1 flex min-w-0 flex-col">
          <p className="tag self-start text-[13px]">
            <span className="shrink-0">{stateCopy.eyebrow}</span>
            <span aria-hidden="true" className="leader w-16" />
            <span className="max-w-56 truncate">
              {activeInstance?.name ?? t("home.value.noInstance")}
            </span>
            <span aria-hidden="true" className="ml-1 size-2 bg-signal" />
          </p>

          <div className="relative mt-10">
            {/* 一块被丢掉的方块：只剩虚线框，压在标题后面 */}
            <span
              aria-hidden="true"
              className="dropped absolute top-10 right-[8%] h-[46%] w-[22%] rotate-[-4deg]"
            />
            <DisplayTitle
              ref={titleRef}
              id="launch-state-title"
              text={stateCopy.title}
              className="relative w-fit max-w-full text-[74px]"
            />
            <GlyphCallout target={titleRef} label="DROPPED · p=0.50" />
            <DimensionLine target={titleRef} className="mt-3" />
          </div>

          <div className="mt-5 grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-5">
            <div className="col-rule">
              <p className="type-pixel text-[11px] text-ink/70">
                {t("home.commandCenter")}
              </p>
              <p className="mt-2 max-w-[44ch] text-[15px] leading-snug">
                {stateCopy.description}
              </p>
            </div>
            <div className="col-rule-dashed">
              <p className="type-pixel text-[11px] text-ink/70">
                {t("home.readinessProtocol")}
              </p>
              {errorDetail && blocked ? (
                <p className="type-mono mt-2 line-clamp-4 border-l-4 border-fault pl-2 text-[11px] leading-snug text-fault">
                  {errorDetail}
                </p>
              ) : (
                <p className="type-mono mt-2 text-[11px] leading-snug text-ink/70 uppercase">
                  {[
                    activeInstance?.versionId ?? t("home.value.noVersion"),
                    activeInstance?.modLoader
                      ? `${activeInstance.modLoader} ${activeInstance.modLoaderVersion ?? ""}`.trim()
                      : t("home.value.vanilla"),
                    probe?.java ? `Java ${probe.java.version}` : null,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              className={cn(
                "group/cta flex cursor-pointer items-center gap-3 text-[37px] leading-none outline-none disabled:cursor-not-allowed disabled:opacity-40",
                "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
                homeState === "running" && "text-fault",
              )}
              disabled={primaryDisabled}
              onClick={() => void handlePrimaryAction()}
              data-tour="launch-button"
            >
              {actionPendingVisual ? (
                <Spinner className="size-[0.6em]" />
              ) : homeState === "running" ? (
                <span
                  aria-hidden="true"
                  className="size-[0.42em] shrink-0 bg-current"
                />
              ) : (
                <TripleArrow className="transition-transform duration-150 group-hover/cta:translate-x-1" />
              )}
              <span className="cta-underline">{stateCopy.action}</span>
            </button>
          </div>

          {downloadActive || downloadTotalFiles > 0 ? (
            <div className="mt-7">
              <DownloadMonitor />
              {downloadActive && (
                <p className="type-pixel mt-1.5 text-[11px] text-ink/70">
                  {t("home.downloadFiles", {
                    completed: downloadCompletedFiles,
                    total: downloadTotalFiles,
                  })}
                </p>
              )}
            </div>
          ) : (
            <Win
              ref={activityRef}
              tabIndex={-1}
              aria-labelledby="activity-title"
              title="SESSION.LOG"
              meta={homeState.toUpperCase()}
              className="mt-7 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="flex items-baseline justify-between gap-3 border-b border-rule px-2.5 py-1.5">
                <h2
                  id="activity-title"
                  className="font-display text-[15px] font-semibold tracking-[-0.03em]"
                >
                  {homeState === "failed"
                    ? t("home.failureDetails")
                    : t("home.sessionLog")}
                </h2>
                <span className="type-pixel text-[10px] text-ink/60">
                  {t("home.activity")}
                </span>
              </div>
              <ol className="type-mono min-h-[92px] space-y-0.5 bg-sheet px-2.5 py-2 text-[10.5px] leading-relaxed">
                {recentLogs.length > 0 ? (
                  recentLogs.slice(-5).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 border border-rule",
                          entry.source === "stderr"
                            ? "bg-fault"
                            : entry.source === "launcher"
                              ? "bg-go"
                              : "bg-ink",
                        )}
                      />
                      <span
                        className={cn(
                          "truncate",
                          entry.source === "stderr" && "text-fault",
                        )}
                      >
                        {entry.message}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="flex items-center gap-2 text-ink/60">
                    <span
                      aria-hidden="true"
                      className="dropped size-2 shrink-0"
                    />
                    {t("home.noActivity")}
                  </li>
                )}
              </ol>
              <div className="flex gap-1 border-t border-rule bg-win p-1">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={!activeInstance}
                  onClick={() => void openLogs()}
                >
                  <FolderOpen aria-hidden="true" />
                  {t("home.openLogs")}
                </Button>
                {homeState === "failed" && (
                  <Button
                    size="xs"
                    onClick={() => navigate("/assistant?source=failure")}
                  >
                    <Sparkles aria-hidden="true" />
                    {t("home.askAssistant")}
                  </Button>
                )}
              </div>
            </Win>
          )}
        </div>

        {/* ---------- 右：一叠互相压着的窗口 ---------- */}
        <aside className="@container/stack relative col-start-3 flex min-w-0 flex-col pt-1">
          <Win
            title="INSTANCE.CFG"
            meta={activeInstance?.versionId ?? "—"}
            className="relative z-20 mr-6 @max-[360px]/stack:mr-0"
            aria-labelledby="active-instance-title"
            data-tour="instance-selector"
          >
            <div className="space-y-2 p-2.5">
              <div>
                <p className="type-pixel text-[11px] text-ink/60">
                  {t("home.activeInstance")}
                </p>
                <h2
                  id="active-instance-title"
                  className="truncate font-display text-[19px] leading-tight font-semibold tracking-[-0.035em]"
                >
                  {activeInstance?.name ?? t("home.value.noInstance")}
                </h2>
              </div>
              <Select
                value={activeInstance?.id ?? null}
                items={instances.map((instance) => ({
                  label: instance.name,
                  value: instance.id,
                }))}
                onValueChange={(value) => {
                  if (value) void handleInstanceChange(value);
                }}
                disabled={instances.length === 0 || Boolean(runningInstanceId)}
              >
                <SelectTrigger
                  aria-label={t("home.selectInstance")}
                  className="w-full"
                >
                  <SelectValue placeholder={t("home.selectInstance")} />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {instances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{instance.name}</span>
                          <span className="type-pixel truncate text-[10px] opacity-70">
                            {instance.versionId ?? t("home.value.noVersion")}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <div className="space-y-0.5 text-[12px]">
                <Leader
                  label={
                    <span className="type-pixel text-[11px] uppercase">
                      {t("home.check.version")}
                    </span>
                  }
                  value={activeInstance?.versionId ?? "—"}
                />
                <Leader
                  label={
                    <span className="type-pixel text-[11px] uppercase">
                      {t("home.check.loader")}
                    </span>
                  }
                  value={activeInstance?.modLoader ?? t("home.value.vanilla")}
                  valueClassName="capitalize"
                />
              </div>
            </div>
            <div className="flex gap-1 border-t border-rule bg-win p-1">
              <Button
                variant="outline"
                size="xs"
                className="flex-1"
                onClick={() => navigate("/instances")}
              >
                <Settings2 aria-hidden="true" />
                {t("home.manage")}
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="flex-1"
                disabled={!activeInstance}
                onClick={() => {
                  if (activeInstance) {
                    void openFileExplorer(activeInstance.gameDir);
                  }
                }}
              >
                <FolderOpen aria-hidden="true" />
                {t("home.folder")}
              </Button>
            </div>
          </Win>

          <Win
            title="READINESS.SYS"
            meta={`${readyCount}/${readinessChecks.length}`}
            className="relative z-10 mt-2.5 ml-8 -mr-1 @max-[360px]/stack:ml-3 @max-[360px]/stack:mr-0"
            aria-labelledby="readiness-title"
          >
            <div className="px-2.5 pt-2 pb-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2
                  id="readiness-title"
                  className="font-display text-[15px] font-semibold tracking-[-0.03em]"
                >
                  {t("home.readinessTitle")}
                </h2>
                <span className="type-pixel shrink-0 text-[10px] text-ink/60">
                  {t("home.checksCount", {
                    ready: readyCount,
                    total: readinessChecks.length,
                  })}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink/60">
                {t("home.readinessDescription")}
              </p>
              <ul className="mt-1.5">
                {readinessChecks.map((check) => (
                  <ReadinessRow key={check.id} check={check} />
                ))}
              </ul>
              <SegBar
                className="mt-2"
                value={
                  downloadActive
                    ? downloadPercentage / 100
                    : readyCount / readinessChecks.length
                }
                fillClassName={blocked ? "bg-fault" : "bg-ink"}
              />
            </div>
          </Win>

          {/* 两个小部件是装饰：右栏窄到放不下两个时收起 DAYLIGHT */}
          <div className="relative z-30 -mt-2.5 flex items-start gap-3 pl-1">
            <DropoutWidget className="w-[178px] shrink-0 rotate-[-2.2deg]" />
            <DaylightWidget className="mt-5 w-[155px] shrink-0 rotate-[1.6deg] @max-[360px]/stack:hidden" />
          </div>
        </aside>
      </div>

      <LoginModal open={showLoginModal} onOpenChange={setShowLoginModal} />
    </div>
  );
}

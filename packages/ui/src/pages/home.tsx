import {
  AlertTriangle,
  Blocks,
  Box,
  Check,
  ChevronRight,
  CircleDashed,
  Coffee,
  Download,
  FolderOpen,
  HardDrive,
  MemoryStick,
  Play,
  RefreshCw,
  ScrollText,
  Settings2,
  Square,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { getLaunchReadiness, installVersion, openFileExplorer } from "@/client";
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
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const toneStyles: Record<CheckTone, string> = {
  pass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  fail: "bg-red-500/10 text-red-700 dark:text-red-300",
  pending: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  neutral: "bg-muted text-muted-foreground",
};

function formatMemory(megabytes: number) {
  if (megabytes >= 1024) {
    const gigabytes = megabytes / 1024;
    return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1)} GB`;
  }
  return `${megabytes} MB`;
}

function CheckStatusIcon({ tone }: { tone: CheckTone }) {
  if (tone === "pass") return <Check className="size-3" aria-hidden="true" />;
  if (tone === "fail") return <X className="size-3" aria-hidden="true" />;
  if (tone === "warn") {
    return <AlertTriangle className="size-3" aria-hidden="true" />;
  }
  return <CircleDashed className="size-3" aria-hidden="true" />;
}

function ReadinessItem({ check }: { check: ReadinessCheck }) {
  const { t } = useTranslation();
  const Icon = check.icon;

  return (
    <li className="border-border/60 bg-background/45 flex min-w-0 items-center gap-2.5 border px-2.5 py-2">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md",
          toneStyles[check.tone],
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
          {check.label}
        </p>
        <p className="truncate text-[11px] font-medium" title={check.value}>
          {check.value}
        </p>
      </div>
      <span className={cn("rounded-full p-1", toneStyles[check.tone])}>
        <CheckStatusIcon tone={check.tone} />
        <span className="sr-only">{t(`home.checkTone.${check.tone}`)}</span>
      </span>
    </li>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activityRef = useRef<HTMLElement>(null);

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
    lastError,
  });

  const memory = activeInstance?.memoryOverride ?? {
    min: config?.minMemory ?? 0,
    max: config?.maxMemory ?? 0,
  };
  const memoryValid = memory.min > 0 && memory.max >= memory.min;
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
        icon: UserRound,
      },
      {
        id: "instance",
        label: t("home.check.instance"),
        value: activeInstance?.name ?? t("home.value.noInstance"),
        tone: instanceReady ? "pass" : "fail",
        icon: Box,
      },
      {
        id: "version",
        label: t("home.check.version"),
        value: activeInstance?.versionId ?? t("home.value.noVersion"),
        tone: versionReady ? "pass" : "fail",
        icon: Blocks,
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
        icon: Settings2,
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
        icon: Coffee,
      },
      {
        id: "memory",
        label: t("home.check.memory"),
        value:
          memory.min > 0
            ? `${formatMemory(memory.min)} – ${formatMemory(memory.max)}`
            : t("home.value.checking"),
        tone: memory.min === 0 ? "pending" : memoryValid ? "pass" : "fail",
        icon: MemoryStick,
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
        icon: HardDrive,
      },
    ];
  }, [
    account,
    activeInstance,
    downloadActive,
    downloadPercentage,
    memory.max,
    memory.min,
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
    lastError ?? probeError ?? instanceError ?? authError ?? settingsError;

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

  const actionIcon = (() => {
    if (
      actionPending ||
      stoppingInstanceId !== null ||
      homeState === "checking" ||
      homeState === "launching"
    ) {
      return <Spinner />;
    }
    if (homeState === "running") return <Square aria-hidden="true" />;
    if (homeState === "failed") return <ScrollText aria-hidden="true" />;
    if (homeState === "data-error") return <RefreshCw aria-hidden="true" />;
    if (
      homeState === "java-missing" ||
      homeState === "memory-invalid" ||
      homeState === "version-missing"
    ) {
      return <Wrench aria-hidden="true" />;
    }
    if (homeState === "files-missing" || homeState === "downloading") {
      return <Download aria-hidden="true" />;
    }
    if (homeState === "no-account") return <UserRound aria-hidden="true" />;
    if (homeState === "no-instance") return <Box aria-hidden="true" />;
    return <Play aria-hidden="true" />;
  })();

  const primaryDisabled =
    actionPending ||
    stoppingInstanceId !== null ||
    homeState === "checking" ||
    homeState === "launching";

  return (
    <div className="custom-scrollbar relative z-10 h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-3 p-3 sm:p-4">
        <header className="flex items-center justify-between gap-3 px-0.5">
          <div className="flex items-center gap-2">
            <span className="bg-foreground size-1.5 rounded-full" />
            <span className="text-foreground/70 font-mono text-[10px] font-bold tracking-[0.18em] uppercase">
              {t("home.commandCenter")}
            </span>
          </div>
          <span className="border-border/70 bg-card/70 text-muted-foreground border px-2 py-1 font-mono text-[9px] tracking-wider uppercase backdrop-blur-md">
            {t("home.readinessProtocol")}
          </span>
        </header>

        <div className="grid flex-1 grid-cols-[minmax(0,1.35fr)_minmax(220px,0.75fr)] items-start gap-3">
          <div className="flex min-w-0 flex-col gap-3">
            <section
              aria-labelledby="launch-state-title"
              className={cn(
                "border-border/80 bg-card/88 relative overflow-hidden border p-4 shadow-lg backdrop-blur-xl",
                "before:bg-primary before:absolute before:inset-y-0 before:left-0 before:w-1",
                homeState === "failed" && "before:bg-red-500",
                (homeState === "java-missing" ||
                  homeState === "files-missing" ||
                  homeState === "memory-invalid") &&
                  "before:bg-amber-500",
                homeState === "running" && "before:bg-emerald-500",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-primary mb-1.5 font-mono text-[10px] font-bold tracking-[0.16em] uppercase">
                    {stateCopy.eyebrow}
                  </p>
                  <h1
                    id="launch-state-title"
                    className="text-foreground text-2xl font-black tracking-[-0.04em] sm:text-3xl"
                  >
                    {stateCopy.title}
                  </h1>
                  <p className="text-muted-foreground mt-1.5 max-w-xl text-xs leading-relaxed">
                    {stateCopy.description}
                  </p>
                </div>
                <span
                  className={cn(
                    "hidden size-11 shrink-0 items-center justify-center rounded-full sm:flex",
                    homeState === "ready" || homeState === "running"
                      ? toneStyles.pass
                      : homeState === "failed" || homeState === "data-error"
                        ? toneStyles.fail
                        : toneStyles.pending,
                  )}
                  aria-hidden="true"
                >
                  {homeState === "ready" ? (
                    <Check className="size-5" />
                  ) : homeState === "failed" ? (
                    <AlertTriangle className="size-5" />
                  ) : (
                    <CircleDashed className="size-5" />
                  )}
                </span>
              </div>

              {errorDetail &&
                (homeState === "failed" || homeState === "data-error") && (
                  <p className="border-red-500/20 bg-red-500/8 text-red-800 dark:text-red-200 mt-3 truncate border px-2.5 py-2 font-mono text-[10px]">
                    {errorDetail}
                  </p>
                )}

              <Button
                className={cn(
                  "mt-4 min-w-44 justify-between shadow-md",
                  (homeState === "ready" || homeState === "stopped") &&
                    "bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700",
                )}
                variant={homeState === "running" ? "destructive" : "default"}
                size="lg"
                disabled={primaryDisabled}
                onClick={() => void handlePrimaryAction()}
                data-tour="launch-button"
              >
                <span className="flex items-center gap-2">
                  {actionIcon}
                  {stateCopy.action}
                </span>
                {!primaryDisabled && homeState !== "running" && (
                  <ChevronRight className="size-4" aria-hidden="true" />
                )}
              </Button>
            </section>

            <section
              aria-labelledby="readiness-title"
              className="border-border/80 bg-card/82 border p-3 shadow-sm backdrop-blur-xl"
            >
              <div className="mb-2.5 flex items-end justify-between gap-3">
                <div>
                  <h2 id="readiness-title" className="text-xs font-bold">
                    {t("home.readinessTitle")}
                  </h2>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">
                    {t("home.readinessDescription")}
                  </p>
                </div>
                <span className="text-muted-foreground font-mono text-[9px] uppercase">
                  {t("home.checksCount", {
                    ready: readinessChecks.filter(
                      (check) => check.tone === "pass",
                    ).length,
                    total: readinessChecks.length,
                  })}
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-1.5">
                {readinessChecks.map((check) => (
                  <ReadinessItem key={check.id} check={check} />
                ))}
              </ul>
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-3">
            <section
              aria-labelledby="active-instance-title"
              className="border-border/80 bg-card/88 border p-3 shadow-sm backdrop-blur-xl"
              data-tour="instance-selector"
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.12em] uppercase">
                    {t("home.activeInstance")}
                  </p>
                  <h2
                    id="active-instance-title"
                    className="mt-0.5 text-sm font-bold"
                  >
                    {activeInstance?.name ?? t("home.value.noInstance")}
                  </h2>
                </div>
                <Box
                  className="text-muted-foreground size-4"
                  aria-hidden="true"
                />
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
                          <span className="text-muted-foreground truncate text-[10px]">
                            {instance.versionId ?? t("home.value.noVersion")}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">
                    {t("home.check.version")}
                  </dt>
                  <dd className="truncate font-medium">
                    {activeInstance?.versionId ?? "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">
                    {t("home.check.loader")}
                  </dt>
                  <dd className="truncate font-medium capitalize">
                    {activeInstance?.modLoader ?? t("home.value.vanilla")}
                  </dd>
                </div>
              </dl>

              <div className="border-border/70 mt-3 flex gap-1 border-t pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 flex-1 px-2 text-[10px]"
                  onClick={() => navigate("/instances")}
                >
                  <Settings2 aria-hidden="true" />
                  {t("home.manage")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 flex-1 px-2 text-[10px]"
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
            </section>

            {downloadActive || downloadTotalFiles > 0 ? (
              <DownloadMonitor />
            ) : (
              <section
                ref={activityRef}
                tabIndex={-1}
                aria-labelledby="activity-title"
                className="border-border/80 bg-card/88 focus-visible:ring-ring border p-3 shadow-sm backdrop-blur-xl focus-visible:ring-2 focus-visible:outline-none"
              >
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.12em] uppercase">
                      {t("home.activity")}
                    </p>
                    <h2
                      id="activity-title"
                      className="mt-0.5 text-sm font-bold"
                    >
                      {homeState === "failed"
                        ? t("home.failureDetails")
                        : t("home.sessionLog")}
                    </h2>
                  </div>
                  <ScrollText
                    className="text-muted-foreground size-4"
                    aria-hidden="true"
                  />
                </div>

                <div className="bg-zinc-950 text-zinc-300 min-h-24 space-y-1 overflow-hidden p-2.5 font-mono text-[9px] leading-relaxed">
                  {recentLogs.length > 0 ? (
                    recentLogs.slice(-5).map((entry) => (
                      <p
                        key={entry.id}
                        className={cn(
                          "truncate",
                          entry.source === "stderr" && "text-red-300",
                          entry.source === "launcher" && "text-emerald-300",
                        )}
                      >
                        <span className="text-zinc-600">› </span>
                        {entry.message}
                      </p>
                    ))
                  ) : (
                    <p className="text-zinc-500">{t("home.noActivity")}</p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 w-full text-[10px]"
                  disabled={!activeInstance}
                  onClick={() => void openLogs()}
                >
                  <FolderOpen aria-hidden="true" />
                  {t("home.openLogs")}
                </Button>
              </section>
            )}

            {downloadActive && (
              <p className="text-muted-foreground px-1 text-center font-mono text-[9px]">
                {t("home.downloadFiles", {
                  completed: downloadCompletedFiles,
                  total: downloadTotalFiles,
                })}
              </p>
            )}
          </aside>
        </div>
      </div>

      <LoginModal open={showLoginModal} onOpenChange={setShowLoginModal} />
    </div>
  );
}

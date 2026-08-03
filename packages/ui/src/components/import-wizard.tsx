import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDashedIcon,
  DownloadIcon,
  FileArchiveIcon,
  FileCheck2Icon,
  FolderOpenIcon,
  FolderSearchIcon,
  HardDriveDownloadIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  cancelLauncherImport,
  detectLaunchers,
  executeLauncherImport,
  previewLauncherImport,
  rollbackLauncherImport,
  scanLauncherInstances,
} from "@/client";
import { listen } from "@/lib/launcher-runtime";
import { cn } from "@/lib/utils";
import type {
  DetectedLauncher,
  ImportableInstance,
  MigrationImportReport,
  MigrationPreview,
  MigrationProgressEvent,
} from "@/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";

type Step = "detect" | "select" | "review" | "transfer" | "report";

type ImportFailure = {
  sourcePath: string;
  name: string;
  message: string;
};

const TRACK_STEPS: Step[] = ["detect", "review", "transfer", "report"];

function formatBytes(value: bigint) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

function createOperationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `migration-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ImportWizard({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("detect");
  const [launchers, setLaunchers] = useState<DetectedLauncher[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedLauncher, setSelectedLauncher] =
    useState<DetectedLauncher | null>(null);
  const [instances, setInstances] = useState<ImportableInstance[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<MigrationPreview[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [currentOperationId, setCurrentOperationId] = useState<string | null>(
    null,
  );
  const [currentSourcePath, setCurrentSourcePath] = useState<string | null>(
    null,
  );
  const [progress, setProgress] = useState<MigrationProgressEvent | null>(null);
  const [reports, setReports] = useState<MigrationImportReport[]>([]);
  const [failures, setFailures] = useState<ImportFailure[]>([]);
  const [rolledBack, setRolledBack] = useState<Set<string>>(new Set());
  const [rollingBack, setRollingBack] = useState<Set<string>>(new Set());
  const stopAfterCurrent = useRef(false);

  const selectedInstances = useMemo(
    () => instances.filter((instance) => selected.has(instance.sourcePath)),
    [instances, selected],
  );

  const scan = useCallback(async () => {
    setScanning(true);
    setFailures([]);
    try {
      setLaunchers(await detectLaunchers());
    } catch (error) {
      toast.error(t("migration.error.detect", { error: errorMessage(error) }));
    } finally {
      setScanning(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setStep("detect");
    setSelected(new Set());
    setInstances([]);
    setSelectedLauncher(null);
    setPreviews([]);
    setNames({});
    setReports([]);
    setFailures([]);
    setRolledBack(new Set());
    setProgress(null);
    stopAfterCurrent.current = false;
    void scan();
  }, [open, scan]);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<MigrationProgressEvent>("migration-progress", (event) => {
      setProgress(event.payload);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [open]);

  const selectLauncher = async (launcher: DetectedLauncher) => {
    setSelectedLauncher(launcher);
    setSelected(new Set());
    setFailures([]);
    setScanning(true);
    try {
      setInstances(await scanLauncherInstances(launcher.instancesDir));
      setStep("select");
    } catch (error) {
      toast.error(t("migration.error.scan", { error: errorMessage(error) }));
    } finally {
      setScanning(false);
    }
  };

  const selectManualDirectory = async () => {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: t("migration.chooseDialog"),
      });
      if (typeof picked !== "string") return;

      const result = await scanLauncherInstances(picked);
      const launcher: DetectedLauncher = {
        launcherType: "custom",
        instancesDir: picked,
        instanceCount: result.length,
      };
      setLaunchers((previous) => [launcher, ...previous]);
      setSelectedLauncher(launcher);
      setInstances(result);
      setSelected(new Set());
      setFailures([]);
      setStep("select");
    } catch (error) {
      toast.error(t("migration.error.scan", { error: errorMessage(error) }));
    }
  };

  const selectManualArchive = async () => {
    try {
      const picked = await openDialog({
        directory: false,
        multiple: false,
        title: t("migration.archiveDialog"),
        filters: [
          {
            name: t("migration.archiveFilter"),
            extensions: ["zip", "mrpack"],
          },
        ],
      });
      if (typeof picked !== "string") return;

      const result = await scanLauncherInstances(picked);
      const launcher: DetectedLauncher = {
        launcherType: result[0]?.launcherType ?? "portable-archive",
        instancesDir: picked,
        instanceCount: result.length,
      };
      setLaunchers((previous) => [launcher, ...previous]);
      setSelectedLauncher(launcher);
      setInstances(result);
      setSelected(new Set());
      setFailures([]);
      setStep("select");
    } catch (error) {
      toast.error(t("migration.error.scan", { error: errorMessage(error) }));
    }
  };

  const prepareReview = async () => {
    if (selectedInstances.length === 0) return;
    setReviewing(true);
    setFailures([]);
    try {
      const nextPreviews = await Promise.all(
        selectedInstances.map((instance) =>
          previewLauncherImport(instance.sourcePath),
        ),
      );
      setPreviews(nextPreviews);
      setNames(
        Object.fromEntries(
          nextPreviews.map((preview) => [
            preview.source.sourcePath,
            preview.suggestedName,
          ]),
        ),
      );
      setStep("review");
    } catch (error) {
      toast.error(t("migration.error.preview", { error: errorMessage(error) }));
    } finally {
      setReviewing(false);
    }
  };

  const startTransfer = async () => {
    if (
      previews.length === 0 ||
      previews.some(
        (preview) =>
          !preview.canImport || !names[preview.source.sourcePath]?.trim(),
      )
    ) {
      return;
    }

    setStep("transfer");
    setTransferring(true);
    setReports([]);
    setFailures([]);
    setProgress(null);
    stopAfterCurrent.current = false;
    const nextReports: MigrationImportReport[] = [];
    const nextFailures: ImportFailure[] = [];

    for (const preview of previews) {
      if (stopAfterCurrent.current) break;
      const operationId = createOperationId();
      setCurrentOperationId(operationId);
      setCurrentSourcePath(preview.source.sourcePath);
      setProgress(null);
      try {
        const report = await executeLauncherImport(
          operationId,
          preview.source.sourcePath,
          names[preview.source.sourcePath]?.trim() || null,
        );
        nextReports.push(report);
        setReports([...nextReports]);
      } catch (error) {
        nextFailures.push({
          sourcePath: preview.source.sourcePath,
          name: preview.source.name,
          message: errorMessage(error),
        });
        setFailures([...nextFailures]);
      }
    }

    setCurrentOperationId(null);
    setCurrentSourcePath(null);
    setTransferring(false);
    stopAfterCurrent.current = false;
    setStep("report");
    if (nextReports.length > 0) onComplete?.();
  };

  const cancelTransfer = async () => {
    if (!currentOperationId) return;
    stopAfterCurrent.current = true;
    try {
      await cancelLauncherImport(currentOperationId);
    } catch (error) {
      toast.error(t("migration.error.cancel", { error: errorMessage(error) }));
    }
  };

  const undoImport = async (report: MigrationImportReport) => {
    setRollingBack((previous) => new Set(previous).add(report.operationId));
    try {
      const removed = await rollbackLauncherImport(report.operationId);
      if (!removed) throw new Error(t("migration.report.undoUnavailable"));
      setRolledBack((previous) => new Set(previous).add(report.operationId));
      onComplete?.();
      toast.success(
        t("migration.report.undoSuccess", { name: report.instanceName }),
      );
    } catch (error) {
      toast.error(t("migration.error.undo", { error: errorMessage(error) }));
    } finally {
      setRollingBack((previous) => {
        const next = new Set(previous);
        next.delete(report.operationId);
        return next;
      });
    }
  };

  const currentPreview = previews.find(
    (preview) => preview.source.sourcePath === currentSourcePath,
  );
  const completedFiles = progress?.progress.completedFiles ?? 0;
  const totalFiles =
    progress?.progress.totalFiles ?? currentPreview?.totalFiles ?? 0;
  const transferPercent =
    totalFiles > 0
      ? Math.min(100, Math.round((completedFiles / totalFiles) * 100))
      : 0;
  const trackStep = step === "select" ? "detect" : step;
  const currentTrackIndex = TRACK_STEPS.indexOf(trackStep);
  const destinationNameCounts = Object.values(names).reduce((counts, value) => {
    const normalized = value.trim().toLocaleLowerCase();
    if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const isDuplicateDestinationName = (value: string) =>
    (destinationNameCounts.get(value.trim().toLocaleLowerCase()) ?? 0) > 1;
  const invalidNames = previews.some((preview) => {
    const value = names[preview.source.sourcePath] ?? "";
    return !value.trim() || isDuplicateDestinationName(value);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && transferring) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="flex max-h-[88vh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={!transferring}
      >
        <div className="border-border/70 border-b bg-muted/20 px-4 py-3 sm:px-5">
          <DialogHeader className="pr-8">
            <div className="text-primary mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
              <HardDriveDownloadIcon className="size-3.5" aria-hidden="true" />
              {t("migration.eyebrow")}
            </div>
            <DialogTitle className="text-base sm:text-lg">
              {t(`migration.title.${step}`)}
            </DialogTitle>
            <DialogDescription>
              {t(`migration.description.${step}`)}
            </DialogDescription>
          </DialogHeader>

          <ol
            className="mt-4 grid grid-cols-4 gap-px bg-border"
            aria-label={t("migration.track.label")}
          >
            {TRACK_STEPS.map((item, index) => {
              const active = index === currentTrackIndex;
              const complete = index < currentTrackIndex;
              return (
                <li
                  key={item}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "bg-background min-w-0 px-2 py-2",
                    active && "bg-primary/8",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center border font-mono text-[9px]",
                        complete &&
                          "border-primary bg-primary text-primary-foreground",
                        active && "border-primary text-primary",
                        !active &&
                          !complete &&
                          "border-border text-muted-foreground",
                      )}
                    >
                      {complete ? (
                        <CheckCircle2Icon className="size-3" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        "truncate text-[10px] font-medium sm:text-xs",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t(`migration.track.${item}`)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {step === "detect" && (
            <div className="space-y-4">
              <div className="border-primary/25 bg-primary/5 flex items-start gap-3 border p-3">
                <ShieldCheckIcon
                  className="text-primary mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs font-semibold">
                    {t("migration.safety.title")}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    {t("migration.safety.description")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={scan}
                  disabled={scanning}
                >
                  {scanning ? (
                    <Spinner className="size-4" />
                  ) : (
                    <RefreshCwIcon className="size-4" />
                  )}
                  {t("migration.action.autoScan")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={selectManualDirectory}
                >
                  <FolderOpenIcon className="size-4" />
                  {t("migration.action.chooseDirectory")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={selectManualArchive}
                >
                  <FileArchiveIcon className="size-4" />
                  {t("migration.action.chooseArchive")}
                </Button>
              </div>

              {scanning && (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              )}

              {!scanning && launchers.length === 0 && (
                <div className="border-border border border-dashed p-8 text-center text-muted-foreground">
                  <FolderSearchIcon className="mx-auto mb-2 size-8 opacity-40" />
                  <p className="text-sm font-medium text-foreground">
                    {t("migration.empty.launchers")}
                  </p>
                  <p className="mt-1 text-xs">
                    {t("migration.empty.launchersHint")}
                  </p>
                </div>
              )}

              {!scanning && launchers.length > 0 && (
                <fieldset
                  className="space-y-2"
                  aria-label={t("migration.sources")}
                >
                  {launchers.map((launcher) => (
                    <button
                      type="button"
                      key={`${launcher.launcherType}:${launcher.instancesDir}`}
                      onClick={() => void selectLauncher(launcher)}
                      className="focus-visible:border-ring focus-visible:ring-ring/40 group flex w-full items-center gap-3 border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="bg-muted group-hover:bg-primary/10 group-hover:text-primary flex size-9 shrink-0 items-center justify-center transition-colors">
                        <DownloadIcon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {t(`migration.launcher.${launcher.launcherType}`, {
                              defaultValue: launcher.launcherType.replaceAll(
                                "-",
                                " ",
                              ),
                            })}
                          </p>
                          <Badge variant="outline">
                            {t("migration.itemCount", {
                              count: launcher.instanceCount,
                            })}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                          {launcher.instancesDir}
                        </p>
                      </div>
                      <ChevronRightIcon
                        className="text-muted-foreground size-4 shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </fieldset>
              )}
            </div>
          )}

          {step === "select" && (
            <div className="space-y-3">
              <div className="border-border bg-muted/30 flex items-center justify-between gap-3 border p-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">
                    {t("migration.foundCount", { count: instances.length })}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    {selectedLauncher?.instancesDir}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelected(
                        new Set(
                          instances.map((instance) => instance.sourcePath),
                        ),
                      )
                    }
                  >
                    {t("migration.action.selectAll")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(new Set())}
                  >
                    {t("migration.action.clear")}
                  </Button>
                </div>
              </div>

              {instances.length === 0 && (
                <div className="border-border border border-dashed p-8 text-center text-muted-foreground">
                  <SearchIcon className="mx-auto mb-2 size-8 opacity-40" />
                  <p>{t("migration.empty.instances")}</p>
                </div>
              )}

              {instances.map((instance, index) => (
                <label
                  key={instance.sourcePath}
                  htmlFor={`import-instance-${index}`}
                  className={cn(
                    "focus-within:border-ring flex cursor-pointer items-start gap-3 border bg-card p-3 transition-colors hover:bg-accent/50",
                    selected.has(instance.sourcePath) &&
                      "border-primary/50 bg-primary/5",
                  )}
                >
                  <Checkbox
                    id={`import-instance-${index}`}
                    checked={selected.has(instance.sourcePath)}
                    onCheckedChange={() =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (next.has(instance.sourcePath))
                          next.delete(instance.sourcePath);
                        else next.add(instance.sourcePath);
                        return next;
                      })
                    }
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{instance.name}</p>
                      <Badge variant="secondary">
                        {t(`migration.launcher.${instance.launcherType}`, {
                          defaultValue: instance.launcherType,
                        })}
                      </Badge>
                      <Badge variant="outline">
                        {t(`migration.sourceKind.${instance.sourceKind}`, {
                          defaultValue: instance.sourceKind,
                        })}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>
                        {instance.minecraftVersion
                          ? `Minecraft ${instance.minecraftVersion}`
                          : t("migration.metadata.unknownVersion")}
                      </span>
                      <span>
                        {instance.modLoader
                          ? `${instance.modLoader}${instance.modLoaderVersion ? ` ${instance.modLoaderVersion}` : ""}`
                          : t("migration.metadata.vanilla")}
                      </span>
                      {instance.memoryOverride && (
                        <span>
                          {instance.memoryOverride.min}–
                          {instance.memoryOverride.max} MB
                        </span>
                      )}
                    </div>
                    <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
                      {instance.gameDir || instance.sourcePath}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              <div className="border-primary/25 bg-primary/5 flex items-start gap-3 border p-3">
                <ShieldCheckIcon
                  className="text-primary mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs font-semibold">
                    {t("migration.review.sourceUnchanged")}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    {t("migration.review.sourceUnchangedDescription")}
                  </p>
                </div>
              </div>

              {previews.map((preview) => {
                const included = preview.content.filter(
                  (group) => group.disposition === "include",
                );
                const skipped = preview.content.filter(
                  (group) => group.disposition === "skip",
                );
                const unsupported = preview.content.filter(
                  (group) => group.disposition === "unsupported",
                );
                const name = names[preview.source.sourcePath] ?? "";
                const duplicateName = isDuplicateDestinationName(name);
                return (
                  <article
                    key={preview.source.sourcePath}
                    className="border-border border bg-card"
                  >
                    <div className="border-border/70 flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">
                            {preview.source.name}
                          </h3>
                          <Badge
                            variant={
                              preview.conflicts.length > 0
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {preview.conflicts.length > 0
                              ? t("migration.review.conflictCount", {
                                  count: preview.conflicts.length,
                                })
                              : t("migration.review.ready")}
                          </Badge>
                        </div>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {preview.source.sourcePath}
                        </p>
                      </div>
                      <div className="w-full sm:w-60">
                        <label
                          htmlFor={`migration-name-${preview.source.sourcePath}`}
                          className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {t("migration.review.destinationName")}
                        </label>
                        <Input
                          id={`migration-name-${preview.source.sourcePath}`}
                          value={name}
                          aria-invalid={!name.trim() || duplicateName}
                          onChange={(event) =>
                            setNames((previous) => ({
                              ...previous,
                              [preview.source.sourcePath]: event.target.value,
                            }))
                          }
                        />
                        {duplicateName && (
                          <p className="text-destructive mt-1 text-[10px]">
                            {t("migration.review.duplicateDestinationName")}
                          </p>
                        )}
                      </div>
                    </div>

                    {preview.conflicts.length > 0 && (
                      <div className="border-destructive/25 bg-destructive/5 mx-3 mt-3 flex items-start gap-2 border p-2.5 text-[11px]">
                        <AlertTriangleIcon
                          className="text-destructive mt-0.5 size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <div>
                          {preview.conflicts.map((conflict) => (
                            <p key={`${conflict.kind}:${conflict.message}`}>
                              {conflict.message}{" "}
                              <span className="text-muted-foreground">
                                {conflict.suggestedResolution}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 p-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <FileCheck2Icon className="size-3" />
                          {t("migration.review.included")}
                        </p>
                        <div className="space-y-1">
                          {included.map((group) => (
                            <div
                              key={group.id}
                              className="bg-muted/45 flex items-center justify-between gap-3 px-2 py-1.5 text-[11px]"
                            >
                              <span className="truncate font-mono">
                                {group.relativePath}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {t("migration.review.fileSummary", {
                                  count: group.fileCount,
                                  size: formatBytes(group.totalBytes),
                                })}
                              </span>
                            </div>
                          ))}
                          {included.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {t("migration.review.noneIncluded")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <CircleDashedIcon className="size-3" />
                          {t("migration.review.skipped")}
                        </p>
                        <div className="space-y-1">
                          {skipped.map((group) => (
                            <div
                              key={group.id}
                              className="bg-muted/25 flex items-center justify-between gap-3 px-2 py-1.5 text-[11px] text-muted-foreground"
                            >
                              <span className="truncate font-mono">
                                {group.relativePath}
                              </span>
                              <span className="shrink-0">
                                {group.reason ??
                                  t("migration.review.notNeeded")}
                              </span>
                            </div>
                          ))}
                          {skipped.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {t("migration.review.noneSkipped")}
                            </p>
                          )}
                        </div>
                      </div>
                      {unsupported.length > 0 && (
                        <div className="sm:col-span-2">
                          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                            <AlertTriangleIcon className="size-3" />
                            {t("migration.review.unsupported")}
                          </p>
                          <div className="grid gap-1 sm:grid-cols-2">
                            {unsupported.map((group) => (
                              <div
                                key={group.id}
                                className="border-destructive/25 bg-destructive/5 flex items-center justify-between gap-3 border px-2 py-1.5 text-[11px]"
                              >
                                <span className="truncate font-mono">
                                  {group.relativePath}
                                </span>
                                <span className="shrink-0 text-muted-foreground">
                                  {group.reason ??
                                    t("migration.review.manualReview")}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-border/70 flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2 text-[10px] text-muted-foreground">
                      <span>
                        {t("migration.review.total", {
                          count: preview.totalFiles,
                          size: formatBytes(preview.totalBytes),
                        })}
                      </span>
                      {preview.source.javaPathOverride && (
                        <span>{t("migration.metadata.javaOverride")}</span>
                      )}
                      {preview.source.jvmArgsOverride && (
                        <span>{t("migration.metadata.jvmOverride")}</span>
                      )}
                      {preview.source.notes && (
                        <span>{t("migration.metadata.notes")}</span>
                      )}
                      {preview.source.iconSource && (
                        <span>{t("migration.metadata.icon")}</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {step === "transfer" && (
            <div className="mx-auto flex max-w-xl flex-col items-center py-8 text-center">
              <div className="bg-primary/10 text-primary mb-5 flex size-14 items-center justify-center border border-primary/20">
                <HardDriveDownloadIcon className="size-6" aria-hidden="true" />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("migration.transfer.current")}
              </p>
              <h3 className="mt-1 text-base font-semibold">
                {currentPreview?.source.name ??
                  t("migration.transfer.preparing")}
              </h3>
              <div className="mt-6 w-full">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {t("migration.transfer.queue", {
                      current: reports.length + failures.length + 1,
                      total: previews.length,
                    })}
                  </span>
                  <span className="text-primary font-mono font-semibold">
                    {transferPercent}%
                  </span>
                </div>
                <div
                  className="bg-muted h-2 overflow-hidden"
                  role="progressbar"
                  aria-label={t("migration.transfer.progress")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={transferPercent}
                >
                  <div
                    className="bg-primary h-full transition-[width] duration-200 motion-reduce:transition-none"
                    style={{ width: `${transferPercent}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between gap-3 text-[10px] text-muted-foreground">
                  <span>
                    {t("migration.transfer.files", {
                      completed: completedFiles,
                      total: totalFiles,
                    })}
                  </span>
                  <span>
                    {formatBytes(progress?.progress.completedBytes ?? 0n)} /{" "}
                    {formatBytes(
                      progress?.progress.totalBytes ??
                        currentPreview?.totalBytes ??
                        0n,
                    )}
                  </span>
                </div>
                <p className="mt-4 truncate font-mono text-[10px] text-muted-foreground">
                  {progress?.progress.currentPath ??
                    t("migration.transfer.preparingFiles")}
                </p>
              </div>
              <div className="border-border bg-muted/25 mt-6 flex w-full items-start gap-2 border p-3 text-left text-[11px] text-muted-foreground">
                <ShieldCheckIcon
                  className="text-primary mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {t("migration.transfer.rollbackHint")}
              </div>
            </div>
          )}

          {step === "report" && (
            <div className="space-y-3">
              <div
                className={cn(
                  "flex items-start gap-3 border p-3",
                  failures.length === 0
                    ? "border-emerald-500/25 bg-emerald-500/5"
                    : "border-amber-500/25 bg-amber-500/5",
                )}
              >
                {failures.length === 0 ? (
                  <CheckCircle2Icon
                    className="mt-0.5 size-4 shrink-0 text-emerald-500"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangleIcon
                    className="mt-0.5 size-4 shrink-0 text-amber-500"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="text-xs font-semibold">
                    {failures.length === 0
                      ? t("migration.report.complete")
                      : t("migration.report.needsAttention")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t("migration.report.summary", {
                      imported: reports.length,
                      failed: failures.length,
                    })}
                  </p>
                </div>
              </div>

              {reports.map((report) => {
                const undone = rolledBack.has(report.operationId);
                const busy = rollingBack.has(report.operationId);
                return (
                  <article
                    key={report.operationId}
                    className={cn(
                      "border-border flex items-start gap-3 border bg-card p-3",
                      undone && "opacity-60",
                    )}
                  >
                    {undone ? (
                      <RotateCcwIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{report.instanceName}</h3>
                        <Badge
                          variant={
                            undone
                              ? "outline"
                              : report.compatibilityStatus ===
                                  "ready-to-validate"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {undone
                            ? t("migration.report.undone")
                            : t(
                                `migration.report.status.${report.compatibilityStatus}`,
                                { defaultValue: report.compatibilityStatus },
                              )}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t("migration.report.copied", {
                          count: report.copiedFiles,
                          size: formatBytes(report.copiedBytes),
                        })}
                      </p>
                      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                        {report.compatibilityChecks.map((check) => (
                          <div
                            key={check.id}
                            className="border-border/70 bg-muted/25 flex items-start gap-2 border px-2 py-1.5"
                          >
                            {check.status === "ready" ? (
                              <CheckCircle2Icon
                                className="mt-0.5 size-3 shrink-0 text-emerald-500"
                                aria-hidden="true"
                              />
                            ) : (
                              <AlertTriangleIcon
                                className={cn(
                                  "mt-0.5 size-3 shrink-0",
                                  check.status === "action-required"
                                    ? "text-destructive"
                                    : "text-amber-500",
                                )}
                                aria-hidden="true"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold">
                                {t(`migration.report.check.${check.id}`, {
                                  defaultValue: check.id,
                                })}
                              </p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {check.summary}
                              </p>
                              {check.action && (
                                <p className="mt-0.5 text-[10px] text-foreground">
                                  {t("migration.report.action", {
                                    action: check.action,
                                  })}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {report.warnings.map((warning) => (
                        <p
                          key={warning}
                          className="mt-1 text-[10px] text-amber-600 dark:text-amber-400"
                        >
                          {warning}
                        </p>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={undone || busy}
                      onClick={() => void undoImport(report)}
                    >
                      {busy ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <RotateCcwIcon className="size-3.5" />
                      )}
                      {undone
                        ? t("migration.report.undone")
                        : t("migration.report.undo")}
                    </Button>
                  </article>
                );
              })}

              {failures.map((failure) => (
                <article
                  key={failure.sourcePath}
                  className="border-destructive/30 bg-destructive/5 flex items-start gap-3 border p-3"
                >
                  <XCircleIcon
                    className="text-destructive mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <h3 className="font-semibold">{failure.name}</h3>
                    <p className="text-muted-foreground mt-1 break-words text-[11px]">
                      {failure.message}
                    </p>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {failure.sourcePath}
                    </p>
                  </div>
                </article>
              ))}

              <div className="border-border bg-muted/25 flex items-start gap-2 border p-3 text-[11px] text-muted-foreground">
                <ShieldCheckIcon
                  className="text-primary mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {t("migration.report.sourceSafe")}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-border/70 border-t bg-muted/15 px-4 py-3 sm:px-5">
          {step === "select" && (
            <>
              <Button variant="outline" onClick={() => setStep("detect")}>
                <ArrowLeftIcon className="size-4" />
                {t("common.back")}
              </Button>
              <Button
                onClick={() => void prepareReview()}
                disabled={selectedInstances.length === 0 || reviewing}
              >
                {reviewing && <Spinner className="size-4" />}
                {t("migration.action.review", {
                  count: selectedInstances.length,
                })}
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                <ArrowLeftIcon className="size-4" />
                {t("common.back")}
              </Button>
              <Button
                onClick={() => void startTransfer()}
                disabled={
                  invalidNames || previews.some((preview) => !preview.canImport)
                }
              >
                {t("migration.action.start", { count: previews.length })}
              </Button>
            </>
          )}
          {step === "transfer" && (
            <Button
              variant="outline"
              onClick={() => void cancelTransfer()}
              disabled={!currentOperationId}
            >
              {t("migration.action.cancelTransfer")}
            </Button>
          )}
          {step === "report" && (
            <Button onClick={() => onOpenChange(false)}>
              {t("migration.action.finish")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

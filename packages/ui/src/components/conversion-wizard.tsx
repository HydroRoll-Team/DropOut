import { open as openExternal } from "@tauri-apps/plugin-shell";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  FileCheck2Icon,
  FolderOpenIcon,
  LoaderCircleIcon,
  PackageSearchIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  applyContentConversion,
  getFabricLoadersForVersion,
  getForgeVersionsForGame,
  getVersions,
  openFileExplorer,
  previewContentConversion,
  rollbackContentConversion,
} from "@/client";
import { baseGameVersion } from "@/lib/version-id";
import type {
  ConversionDisposition,
  ConversionItem,
  ConversionPreview,
  ConversionReport,
  ConversionTarget,
  Instance,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type TargetLoader = "vanilla" | "fabric" | "forge";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function statusIcon(disposition: ConversionDisposition) {
  if (disposition === "keep") return CheckCircle2Icon;
  if (disposition === "replace") return RefreshCwIcon;
  if (disposition === "incompatible") return XCircleIcon;
  return AlertTriangleIcon;
}

function statusClass(disposition: ConversionDisposition) {
  if (disposition === "keep") {
    return "border-emerald-600/30 bg-emerald-600/8 text-emerald-700 dark:text-emerald-300";
  }
  if (disposition === "replace") {
    return "border-indigo-600/30 bg-indigo-600/8 text-indigo-700 dark:text-indigo-300";
  }
  if (disposition === "incompatible") {
    return "border-red-600/30 bg-red-600/8 text-red-700 dark:text-red-300";
  }
  return "border-amber-600/30 bg-amber-600/8 text-amber-700 dark:text-amber-300";
}

function ManifestRow({
  item,
  excluded,
  onExcludedChange,
}: {
  item: ConversionItem;
  excluded: boolean;
  onExcludedChange: (excluded: boolean) => void;
}) {
  const { t } = useTranslation();
  const StatusIcon = statusIcon(item.disposition);
  const needsDecision =
    item.disposition === "needsReview" || item.disposition === "incompatible";

  return (
    <li
      className="border-border/70 grid min-w-0 gap-2 border-b px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]"
      data-disposition={item.disposition}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant="outline"
            className={`${statusClass(item.disposition)} shrink-0 font-mono text-[9px] uppercase tracking-[0.1em]`}
          >
            <StatusIcon aria-hidden="true" />
            {t(`conversion.status.${item.disposition}`)}
          </Badge>
          <span className="truncate font-mono text-[11px] font-semibold">
            {item.fileName}
          </span>
          <span className="text-muted-foreground shrink-0 text-[9px] uppercase tracking-[0.12em]">
            {t(`conversion.kind.${item.contentKind}`)}
          </span>
        </div>
        <p
          className="text-muted-foreground mt-1 truncate font-mono text-[9px]"
          title={item.relativePath}
        >
          {item.relativePath}
        </p>
        <p className="text-muted-foreground mt-1 text-[10px] leading-relaxed">
          {t(
            `conversion.reason.${
              item.disposition === "incompatible" && item.suggestion
                ? "alternative"
                : item.disposition
            }`,
          )}
        </p>
        {item.replacement && (
          <p className="mt-1 text-[10px] text-indigo-700 dark:text-indigo-300">
            {t("conversion.manifest.replacement", {
              version: item.replacement.versionName,
            })}
          </p>
        )}
        {item.suggestion && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-1 h-auto px-0 text-[10px]"
            onClick={() => void openExternal(item.suggestion?.pageUrl ?? "")}
          >
            {t("conversion.manifest.suggestion", {
              project: item.suggestion.projectName,
            })}
            <ExternalLinkIcon />
          </Button>
        )}
      </div>

      {needsDecision && (
        <div className="border-border/70 bg-muted/30 flex items-center gap-2 self-start border px-2.5 py-2 text-[10px] sm:max-w-48">
          <Checkbox
            checked={excluded}
            onCheckedChange={onExcludedChange}
            aria-label={t("conversion.manifest.excludeLabel", {
              name: item.fileName,
            })}
          />
          <span>{t("conversion.manifest.exclude")}</span>
        </div>
      )}
    </li>
  );
}

export function ConversionWizard({
  open,
  instance,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  instance: Instance | null;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}) {
  const { t } = useTranslation();
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState<TargetLoader>("vanilla");
  const [loaderVersion, setLoaderVersion] = useState<string | null>(null);
  const [loaderOptions, setLoaderOptions] = useState<string[]>([]);
  const [versionOptions, setVersionOptions] = useState<string[]>([]);
  const [loadingLoaders, setLoadingLoaders] = useState(false);
  const [preview, setPreview] = useState<ConversionPreview | null>(null);
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [rolledBack, setRolledBack] = useState(false);

  useEffect(() => {
    if (!open || !instance) return;
    const sourceVersion = baseGameVersion(instance.versionId);
    const sourceLoader = (instance.modLoader ?? "vanilla") as TargetLoader;
    setGameVersion(sourceVersion);
    setLoader(sourceLoader);
    setLoaderVersion(instance.modLoaderVersion);
    setNewName(`${instance.name} · ${t("conversion.copySuffix")}`);
    setPreview(null);
    setExcludedPaths(new Set());
    setReport(null);
    setRolledBack(false);
    void getVersions()
      .then((versions) =>
        setVersionOptions(versions.map((version) => version.id)),
      )
      .catch((error) =>
        console.error("Failed to load Minecraft versions:", error),
      );
  }, [instance, open, t]);

  useEffect(() => {
    if (!open || !gameVersion || loader === "vanilla") {
      setLoaderOptions([]);
      if (loader === "vanilla") setLoaderVersion(null);
      return;
    }

    let cancelled = false;
    setLoadingLoaders(true);
    const load =
      loader === "fabric"
        ? getFabricLoadersForVersion(gameVersion).then((entries) =>
            entries.map((entry) => entry.loader.version),
          )
        : getForgeVersionsForGame(gameVersion).then((entries) =>
            [...entries]
              .sort(
                (left, right) =>
                  Number(right.recommended) - Number(left.recommended) ||
                  Number(right.latest) - Number(left.latest),
              )
              .map((entry) => entry.version),
          );

    void load
      .then((versions) => {
        if (cancelled) return;
        const unique = [...new Set(versions)];
        setLoaderOptions(unique);
        setLoaderVersion((current) =>
          current && unique.includes(current) ? current : (unique[0] ?? null),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setLoaderOptions([]);
        setLoaderVersion(null);
        toast.error(
          t("conversion.error.loaders", { error: errorMessage(error) }),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingLoaders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameVersion, loader, open, t]);

  const target = useMemo<ConversionTarget>(
    () => ({ gameVersion: gameVersion.trim(), loader, loaderVersion }),
    [gameVersion, loader, loaderVersion],
  );
  const unresolved = preview?.items.filter(
    (item) =>
      item.disposition === "needsReview" || item.disposition === "incompatible",
  );
  const unresolvedCount =
    unresolved?.filter((item) => !excludedPaths.has(item.relativePath))
      .length ?? 0;
  const orderedItems = useMemo(() => {
    const priority: Record<ConversionDisposition, number> = {
      incompatible: 0,
      needsReview: 1,
      replace: 2,
      keep: 3,
    };
    return [...(preview?.items ?? [])].sort(
      (left, right) =>
        priority[left.disposition] - priority[right.disposition] ||
        left.relativePath.localeCompare(right.relativePath),
    );
  }, [preview]);
  const targetReady =
    Boolean(target.gameVersion) &&
    (loader === "vanilla" || Boolean(loaderVersion)) &&
    !loadingLoaders;

  const resetPreview = () => {
    setPreview(null);
    setExcludedPaths(new Set());
    setReport(null);
    setRolledBack(false);
  };

  const scan = async () => {
    if (!instance || !targetReady) return;
    setScanning(true);
    setPreview(null);
    setExcludedPaths(new Set());
    try {
      setPreview(await previewContentConversion(instance.id, target));
    } catch (error) {
      toast.error(
        t("conversion.error.preview", { error: errorMessage(error) }),
      );
    } finally {
      setScanning(false);
    }
  };

  const apply = async () => {
    if (!instance || !preview || unresolvedCount > 0 || !newName.trim()) return;
    setApplying(true);
    try {
      const nextReport = await applyContentConversion({
        instanceId: instance.id,
        newName: newName.trim(),
        target,
        excludedPaths: [...excludedPaths],
      });
      setReport(nextReport);
      onComplete?.();
    } catch (error) {
      toast.error(t("conversion.error.apply", { error: errorMessage(error) }));
    } finally {
      setApplying(false);
    }
  };

  const rollback = async () => {
    if (!report) return;
    setRollingBack(true);
    try {
      const removed = await rollbackContentConversion(report.operationId);
      if (!removed) throw new Error(t("conversion.error.rollbackUnavailable"));
      setRolledBack(true);
      onComplete?.();
    } catch (error) {
      toast.error(
        t("conversion.error.rollback", { error: errorMessage(error) }),
      );
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !applying && onOpenChange(next)}
    >
      <DialogContent
        className="flex max-h-[90vh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        showCloseButton={!applying}
      >
        <div className="border-border/70 border-b bg-zinc-950 px-4 py-3 text-white sm:px-5">
          <DialogHeader className="pr-8">
            <div className="mb-1 flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-indigo-300">
              <PackageSearchIcon className="size-3.5" aria-hidden="true" />
              {t("conversion.eyebrow")}
            </div>
            <DialogTitle className="text-base text-white sm:text-lg">
              {report
                ? t("conversion.report.title")
                : t("conversion.title", { name: instance?.name ?? "" })}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {report
                ? t("conversion.report.description")
                : t("conversion.description")}
            </DialogDescription>
          </DialogHeader>
        </div>

        {report ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="border-border bg-card mx-auto max-w-2xl border">
              <div className="border-border/70 flex items-start gap-3 border-b p-4">
                <div className="flex size-9 shrink-0 items-center justify-center bg-emerald-600/10 text-emerald-600 dark:text-emerald-300">
                  <FileCheck2Icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold">
                    {report.targetInstance.name}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {report.targetInstance.versionId} ·{" "}
                    {report.targetInstance.modLoader}
                  </p>
                </div>
              </div>
              <dl className="divide-border/70 grid divide-y text-[11px] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-3">
                  <dt className="text-muted-foreground uppercase tracking-[0.12em]">
                    {t("conversion.report.replaced")}
                  </dt>
                  <dd className="mt-1 font-mono text-base font-semibold">
                    {report.replacedPaths.length}
                  </dd>
                </div>
                <div className="p-3">
                  <dt className="text-muted-foreground uppercase tracking-[0.12em]">
                    {t("conversion.report.excluded")}
                  </dt>
                  <dd className="mt-1 font-mono text-base font-semibold">
                    {report.excludedPaths.length}
                  </dd>
                </div>
                <div className="p-3">
                  <dt className="text-muted-foreground uppercase tracking-[0.12em]">
                    {t("conversion.report.source")}
                  </dt>
                  <dd className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">
                    {t("conversion.report.unchanged")}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mx-auto mt-3 max-w-2xl border border-emerald-600/25 bg-emerald-600/6 p-3 text-[11px] text-emerald-800 dark:text-emerald-200">
              <ShieldCheckIcon className="mr-2 inline size-4" />
              {rolledBack
                ? t("conversion.report.rolledBack")
                : t("conversion.report.rollbackHint")}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-border/70 grid border-b bg-muted/15 sm:grid-cols-[1fr_auto_1fr]">
              <section
                className="p-4 sm:p-5"
                aria-label={t("conversion.source.label")}
              >
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                  {t("conversion.source.label")}
                </p>
                <p className="mt-2 truncate text-sm font-semibold">
                  {instance?.name}
                </p>
                <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                  {baseGameVersion(instance?.versionId)} ·{" "}
                  {instance?.modLoader ?? "vanilla"}{" "}
                  {instance?.modLoaderVersion ?? ""}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                  <ShieldCheckIcon className="size-3.5" />
                  {t("conversion.source.protected")}
                </p>
              </section>

              <div className="border-border/70 hidden items-center border-x px-3 text-indigo-600 sm:flex">
                <ArrowRightIcon className="size-5" aria-hidden="true" />
              </div>

              <section
                className="p-4 sm:p-5"
                aria-label={t("conversion.target.label")}
              >
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-300">
                  {t("conversion.target.label")}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label
                    className="text-muted-foreground text-[10px]"
                    htmlFor="conversion-game-version"
                  >
                    {t("conversion.target.gameVersion")}
                    <Input
                      id="conversion-game-version"
                      className="mt-1 h-8 font-mono text-xs"
                      list="conversion-game-versions"
                      value={gameVersion}
                      onChange={(event) => {
                        setGameVersion(event.target.value);
                        resetPreview();
                      }}
                      aria-label={t("conversion.target.gameVersion")}
                    />
                    <datalist id="conversion-game-versions">
                      {versionOptions.map((version) => (
                        <option key={version} value={version} />
                      ))}
                    </datalist>
                  </label>
                  <label
                    className="text-muted-foreground text-[10px]"
                    htmlFor="conversion-target-loader"
                  >
                    {t("conversion.target.loader")}
                    <Select
                      value={loader}
                      onValueChange={(value) => {
                        if (!value) return;
                        setLoader(value as TargetLoader);
                        setLoaderVersion(null);
                        resetPreview();
                      }}
                    >
                      <SelectTrigger
                        id="conversion-target-loader"
                        className="mt-1 w-full"
                        aria-label={t("conversion.target.loader")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vanilla">Vanilla</SelectItem>
                        <SelectItem value="fabric">Fabric</SelectItem>
                        <SelectItem value="forge">Forge</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                {loader !== "vanilla" && (
                  <label
                    className="text-muted-foreground mt-2 block text-[10px]"
                    htmlFor="conversion-loader-version"
                  >
                    {t("conversion.target.loaderVersion")}
                    <Select
                      value={loaderVersion}
                      onValueChange={(value) => {
                        setLoaderVersion(value);
                        resetPreview();
                      }}
                      disabled={loadingLoaders || loaderOptions.length === 0}
                    >
                      <SelectTrigger
                        id="conversion-loader-version"
                        className="mt-1 w-full font-mono"
                        aria-label={t("conversion.target.loaderVersion")}
                      >
                        {loadingLoaders ? (
                          <span className="flex items-center gap-2">
                            <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" />
                            {t("conversion.target.loadingLoaders")}
                          </span>
                        ) : (
                          <SelectValue
                            placeholder={t("conversion.target.chooseLoader")}
                          />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {loaderOptions.map((version) => (
                          <SelectItem key={version} value={version}>
                            {version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                )}
              </section>
            </div>

            <section
              className="p-4 sm:p-5"
              aria-labelledby="conversion-manifest-title"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3
                    id="conversion-manifest-title"
                    className="text-sm font-semibold"
                  >
                    {t("conversion.manifest.title")}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    {preview
                      ? t("conversion.manifest.summary", {
                          totalCount: preview.summary.total,
                          keepCount: preview.summary.keep,
                          replaceCount: preview.summary.replace,
                          reviewCount: preview.summary.needsReview,
                          incompatibleCount: preview.summary.incompatible,
                        })
                      : t("conversion.manifest.empty")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={preview ? "outline" : "default"}
                  disabled={!targetReady || scanning}
                  onClick={() => void scan()}
                >
                  {scanning ? (
                    <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <PackageSearchIcon />
                  )}
                  {t(scanning ? "conversion.scanning" : "conversion.scan")}
                </Button>
              </div>

              {preview && (
                <>
                  <fieldset className="mt-3 grid grid-cols-4 gap-px bg-border">
                    <legend className="sr-only">
                      {t("conversion.manifest.counts")}
                    </legend>
                    {(
                      [
                        "keep",
                        "replace",
                        "needsReview",
                        "incompatible",
                      ] as const
                    ).map((status) => (
                      <div
                        key={status}
                        className="bg-background px-2 py-2 text-center"
                      >
                        <p className="font-mono text-base font-semibold">
                          {preview.summary[status]}
                        </p>
                        <p className="text-muted-foreground text-[8px] uppercase tracking-[0.1em]">
                          {t(`conversion.status.${status}`)}
                        </p>
                      </div>
                    ))}
                  </fieldset>

                  <ul className="border-border/70 mt-3 border">
                    {orderedItems.map((item) => (
                      <ManifestRow
                        key={item.relativePath}
                        item={item}
                        excluded={excludedPaths.has(item.relativePath)}
                        onExcludedChange={(excluded) => {
                          setExcludedPaths((current) => {
                            const next = new Set(current);
                            if (excluded) next.add(item.relativePath);
                            else next.delete(item.relativePath);
                            return next;
                          });
                        }}
                      />
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        )}

        <DialogFooter className="border-border/70 border-t bg-muted/15 p-3 sm:p-4">
          {report ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void openFileExplorer(report.targetInstance.gameDir)
                }
                disabled={rolledBack}
              >
                <FolderOpenIcon />
                {t("conversion.report.open")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void rollback()}
                disabled={rollingBack || rolledBack}
              >
                {rollingBack ? (
                  <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <RotateCcwIcon />
                )}
                {t("conversion.report.undo")}
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t("common.close")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <div className="min-w-0 flex-1 text-right text-[10px]">
                {preview && unresolvedCount > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {t("conversion.blocked", { count: unresolvedCount })}
                  </span>
                )}
              </div>
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                aria-label={t("conversion.target.copyName")}
                className="h-8 w-48"
              />
              <Button
                type="button"
                onClick={() => void apply()}
                disabled={
                  !preview || unresolvedCount > 0 || !newName.trim() || applying
                }
              >
                {applying ? (
                  <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <ArrowRightIcon />
                )}
                {t("conversion.apply")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

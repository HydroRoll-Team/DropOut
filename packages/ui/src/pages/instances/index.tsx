import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ArchiveIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CopyIcon,
  Edit3Icon,
  EllipsisIcon,
  FolderOpenIcon,
  Gamepad2Icon,
  Grid2X2Icon,
  HardDriveIcon,
  ImportIcon,
  ListIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  RocketIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  getLaunchReadiness,
  openFileExplorer,
  scanInstanceMods,
} from "@/client";
import { ConversionWizard } from "@/components/conversion-wizard";
import InstanceEditorModal from "@/components/instance-editor-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/models/auth";
import { useGameStore } from "@/models/game";
import { useInstanceStore } from "@/models/instance";
import type { Instance, LaunchReadiness } from "@/types";

type SortKey = "name" | "last-played" | "created";
type ViewMode = "grid" | "list";
type ReadinessState =
  | { status: "checking" }
  | { status: "ready"; probe: LaunchReadiness }
  | { status: "attention"; probe: LaunchReadiness | null }
  | { status: "error"; message: string };

function timestampMs(value: bigint | null) {
  if (value === null) return 0;
  const numeric = Number(value);
  return numeric > 1e12 ? numeric : numeric * 1000;
}

function formatDate(value: bigint | null, locale: string) {
  if (value === null) return null;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(timestampMs(value)));
}

function loaderLabel(instance: Instance, vanillaLabel: string) {
  if (!instance.modLoader) return vanillaLabel;
  return `${instance.modLoader} ${instance.modLoaderVersion ?? ""}`.trim();
}

function hasValidMemory(instance: Instance) {
  return (
    instance.memoryOverride === null ||
    instance.memoryOverride.max >= instance.memoryOverride.min
  );
}

function readinessLabel(
  readiness: ReadinessState | undefined,
  t: ReturnType<typeof useTranslation>["t"],
) {
  switch (readiness?.status) {
    case "ready":
      return t("instances.readiness.ready");
    case "attention":
      return t("instances.readiness.attention");
    case "error":
      return t("instances.readiness.unavailable");
    default:
      return t("instances.readiness.checking");
  }
}

function ReadinessMark({
  readiness,
  compact = false,
}: {
  readiness: ReadinessState | undefined;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const label = readinessLabel(readiness, t);

  if (readiness?.status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300">
        <CheckCircle2Icon className="size-3" aria-hidden="true" />
        {!compact && label}
      </span>
    );
  }

  if (readiness?.status === "attention" || readiness?.status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300">
        <CircleAlertIcon className="size-3" aria-hidden="true" />
        {!compact && label}
      </span>
    );
  }

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
      <LoaderCircleIcon
        className="size-3 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      {!compact && label}
    </span>
  );
}

interface LibraryItemProps {
  instance: Instance;
  active: boolean;
  view: ViewMode;
  readiness: ReadinessState | undefined;
  launching: boolean;
  running: boolean;
  stopping: boolean;
  anotherRunning: boolean;
  exporting: boolean;
  onVisible: (instance: Instance) => void;
  onSelect: (instance: Instance) => void;
  onLaunch: (instance: Instance) => void;
  onOpen: (instance: Instance) => void;
  onEdit: (instance: Instance) => void;
  onDuplicate: (instance: Instance) => void;
  onConvert: (instance: Instance) => void;
  onMods: (instance: Instance) => void;
  onBrowse: (instance: Instance) => void;
  onExport: (instance: Instance) => void;
  onDelete: (instance: Instance) => void;
}

function LibraryItem({
  instance,
  active,
  view,
  readiness,
  launching,
  running,
  stopping,
  anotherRunning,
  exporting,
  onVisible,
  onSelect,
  onLaunch,
  onOpen,
  onEdit,
  onDuplicate,
  onConvert,
  onMods,
  onBrowse,
  onExport,
  onDelete,
}: LibraryItemProps) {
  const { t, i18n } = useTranslation();
  const itemRef = useRef<HTMLLIElement>(null);
  const lastPlayed = formatDate(
    instance.lastPlayed,
    i18n.resolvedLanguage ?? i18n.language,
  );

  useEffect(() => {
    const node = itemRef.current;
    if (!node || readiness) return;
    if (!("IntersectionObserver" in window)) {
      onVisible(instance);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onVisible(instance);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [instance, onVisible, readiness]);

  const launchLabel = t(running ? "instances.stop" : "instances.launch", {
    name: instance.name,
  });

  return (
    <li
      ref={itemRef}
      data-testid="instance-library-item"
      data-instance-name={instance.name}
      className={cn(
        "border-border/80 bg-card/80 group min-w-0 border shadow-sm backdrop-blur-xl transition-colors",
        "focus-within:border-primary/70 hover:border-primary/50",
        active && "border-primary ring-primary/15 ring-1",
        view === "grid" ? "flex min-h-44 flex-col" : "flex items-stretch",
      )}
    >
      <button
        type="button"
        className={cn(
          "focus-visible:ring-ring min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset",
          view === "grid"
            ? "flex flex-col gap-3 p-3"
            : "flex items-center gap-3 p-3",
        )}
        onClick={() => onSelect(instance)}
        aria-label={t("instances.select", { name: instance.name })}
        aria-current={active ? "true" : undefined}
      >
        <div
          className={cn(
            "from-primary/80 to-primary/35 text-primary-foreground flex size-11 shrink-0 items-center justify-center overflow-hidden bg-linear-to-br text-base font-black shadow-sm",
            view === "grid" && "size-12",
          )}
        >
          {instance.iconPath ? (
            <img
              src={instance.iconPath}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            instance.name.charAt(0).toUpperCase()
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">
                {instance.name}
              </h2>
              <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                {instance.versionId ?? t("instances.noVersion")} ·{" "}
                {loaderLabel(instance, t("instances.vanilla"))}
              </p>
            </div>
            {active && (
              <span className="bg-primary/10 text-primary shrink-0 px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em]">
                {t("instances.active")}
              </span>
            )}
          </div>

          <div
            className={cn(
              "mt-3 flex items-center justify-between gap-2",
              view === "list" && "mt-2",
            )}
          >
            <ReadinessMark readiness={readiness} />
            <span className="text-muted-foreground truncate text-[10px]">
              {lastPlayed
                ? view === "grid"
                  ? lastPlayed
                  : t("instances.lastPlayedValue", { date: lastPlayed })
                : t("instances.neverPlayed")}
            </span>
          </div>
        </div>
      </button>

      <div
        className={cn(
          "border-border/70 flex shrink-0 items-center gap-1 border-t p-2",
          view === "list" && "border-t-0 border-l",
        )}
      >
        <Button
          type="button"
          size={view === "grid" ? "sm" : "icon"}
          variant={running ? "destructive" : active ? "default" : "outline"}
          aria-label={launchLabel}
          title={launchLabel}
          className={cn(view === "grid" && "flex-1")}
          onClick={() => onLaunch(instance)}
          disabled={anotherRunning || launching || stopping}
        >
          {launching || stopping ? (
            <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          ) : running ? (
            <XIcon />
          ) : (
            <RocketIcon />
          )}
          {view === "grid" && (
            <span>{t(running ? "instances.stopShort" : "instances.play")}</span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            nativeButton={false}
            render={
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("instances.moreActions", {
                  name: instance.name,
                })}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{instance.name}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onOpen(instance)}>
                <FolderOpenIcon />
                {t("instances.actions.openFolder")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(instance)}>
                <Edit3Icon />
                {t("instances.actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(instance)}>
                <CopyIcon />
                {t("instances.actions.duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onConvert(instance)}>
                <RefreshCwIcon />
                {t("instances.actions.convert")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMods(instance)}>
                <PackageIcon />
                {t("instances.actions.mods")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBrowse(instance)}>
                <Gamepad2Icon />
                {t("instances.actions.content")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onExport(instance)}
                disabled={exporting}
              >
                <ArchiveIcon />
                {exporting
                  ? t("instances.actions.exporting")
                  : t("instances.actions.export")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(instance)}
            >
              <Trash2Icon />
              {t("instances.actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function DetailWorkspace({
  instance,
  readiness,
  modCount,
  modCountLoading,
  launching,
  running,
  stopping,
  exporting,
  onLaunch,
  onOpen,
  onEdit,
  onDuplicate,
  onExport,
  onMods,
  onBrowse,
}: {
  instance: Instance;
  readiness: ReadinessState | undefined;
  modCount: number | null;
  modCountLoading: boolean;
  launching: boolean;
  running: boolean;
  stopping: boolean;
  exporting: boolean;
  onLaunch: (instance: Instance) => void;
  onOpen: (instance: Instance) => void;
  onEdit: (instance: Instance) => void;
  onDuplicate: (instance: Instance) => void;
  onExport: (instance: Instance) => void;
  onMods: (instance: Instance) => void;
  onBrowse: (instance: Instance) => void;
}) {
  const { t, i18n } = useTranslation();
  const created = formatDate(
    instance.createdAt,
    i18n.resolvedLanguage ?? i18n.language,
  );
  const memory = instance.memoryOverride
    ? `${instance.memoryOverride.min} MB – ${instance.memoryOverride.max} MB`
    : t("instances.detail.globalDefault");
  const probe =
    readiness?.status === "ready" || readiness?.status === "attention"
      ? readiness.probe
      : null;

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(instance.gameDir);
      toast.success(t("instances.detail.pathCopied"));
    } catch (error) {
      console.error("Failed to copy instance path:", error);
      toast.error(t("instances.detail.pathCopyFailed"));
    }
  };

  return (
    <aside
      aria-labelledby="instance-detail-title"
      className="border-border/80 bg-card/90 min-h-0 overflow-y-auto border shadow-sm backdrop-blur-xl"
    >
      <div className="border-border/70 border-b p-4">
        <div className="flex items-start gap-3">
          <div className="from-primary/85 to-primary/35 text-primary-foreground flex size-12 shrink-0 items-center justify-center bg-linear-to-br text-lg font-black">
            {instance.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-primary text-[9px] font-bold uppercase tracking-[0.18em]">
              {t("instances.detail.activeWorkspace")}
            </p>
            <h2
              id="instance-detail-title"
              className="mt-1 truncate text-base font-semibold"
            >
              {instance.name}
            </h2>
            <div className="mt-2">
              <ReadinessMark readiness={readiness} />
            </div>
          </div>
        </div>

        <Button
          type="button"
          className="mt-4 w-full"
          variant={running ? "destructive" : "default"}
          onClick={() => onLaunch(instance)}
          disabled={launching || stopping}
        >
          {launching || stopping ? (
            <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          ) : running ? (
            <XIcon />
          ) : (
            <RocketIcon />
          )}
          {t(running ? "instances.stopShort" : "instances.launchActive")}
        </Button>
      </div>

      <div className="space-y-4 p-4">
        <section aria-labelledby="readiness-detail-title">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3
              id="readiness-detail-title"
              className="text-[10px] font-bold uppercase tracking-[0.15em]"
            >
              {t("instances.detail.readiness")}
            </h3>
            <span className="text-muted-foreground font-mono text-[9px]">
              {instance.versionId ?? "—"}
            </span>
          </div>
          <dl className="divide-border/70 border-border/70 divide-y border text-[11px]">
            <div className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">
                {t("instances.detail.gameFiles")}
              </dt>
              <dd className="truncate font-medium">
                {probe
                  ? t(
                      probe.versionInstalled
                        ? "instances.detail.available"
                        : "instances.detail.missing",
                    )
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">Java</dt>
              <dd className="truncate font-medium" title={probe?.java?.path}>
                {probe?.java
                  ? `${probe.java.version} · ${probe.java.vendor}`
                  : probe
                    ? t("instances.detail.missing")
                    : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">
                {t("instances.detail.memory")}
              </dt>
              <dd className="font-medium">{memory}</dd>
            </div>
            <div className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">
                {t("instances.detail.mods")}
              </dt>
              <dd className="font-medium">
                {modCountLoading ? "…" : (modCount ?? "—")}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="instance-notes-title">
          <h3
            id="instance-notes-title"
            className="text-[10px] font-bold uppercase tracking-[0.15em]"
          >
            {t("instances.detail.notes")}
          </h3>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            {instance.notes?.trim() || t("instances.detail.noNotes")}
          </p>
        </section>

        <section aria-labelledby="instance-runtime-title">
          <h3
            id="instance-runtime-title"
            className="text-[10px] font-bold uppercase tracking-[0.15em]"
          >
            {t("instances.detail.environment")}
          </h3>
          <dl className="mt-2 space-y-2 text-[11px]">
            <div>
              <dt className="text-muted-foreground">
                {t("instances.detail.loader")}
              </dt>
              <dd className="mt-0.5 font-medium">
                {loaderLabel(instance, t("instances.vanilla"))}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("instances.detail.javaOverride")}
              </dt>
              <dd
                className="mt-0.5 truncate font-mono text-[10px]"
                title={instance.javaPathOverride ?? undefined}
              >
                {instance.javaPathOverride ?? t("instances.detail.automatic")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("instances.detail.created")}
              </dt>
              <dd className="mt-0.5 font-medium">{created}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="instance-path-title">
          <div className="flex items-center justify-between gap-2">
            <h3
              id="instance-path-title"
              className="text-[10px] font-bold uppercase tracking-[0.15em]"
            >
              {t("instances.detail.gameDirectory")}
            </h3>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={copyPath}
              aria-label={t("instances.detail.copyPath")}
              className="size-6"
            >
              <CopyIcon className="size-3" />
            </Button>
          </div>
          <p
            className="bg-muted/70 mt-1 truncate px-2 py-2 font-mono text-[9px]"
            title={instance.gameDir}
          >
            {instance.gameDir}
          </p>
        </section>

        <section aria-label={t("instances.detail.shortcuts")}>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpen(instance)}
            >
              <FolderOpenIcon />
              {t("instances.actions.open")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onEdit(instance)}
            >
              <Edit3Icon />
              {t("instances.actions.edit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onDuplicate(instance)}
            >
              <CopyIcon />
              {t("instances.actions.duplicate")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onExport(instance)}
              disabled={exporting}
            >
              <ArchiveIcon />
              {t("instances.actions.export")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onMods(instance)}
            >
              <PackageIcon />
              {t("instances.actions.mods")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onBrowse(instance)}
            >
              <Gamepad2Icon />
              {t("instances.actions.content")}
            </Button>
          </div>
        </section>
      </div>
    </aside>
  );
}

export function InstancesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const instances = useInstanceStore((state) => state.instances);
  const activeInstance = useInstanceStore((state) => state.activeInstance);
  const instanceStatus = useInstanceStore((state) => state.status);
  const instanceError = useInstanceStore((state) => state.error);
  const refreshInstances = useInstanceStore((state) => state.refresh);
  const setActiveInstance = useInstanceStore(
    (state) => state.setActiveInstance,
  );
  const deleteInstance = useInstanceStore((state) => state.delete);
  const duplicateInstance = useInstanceStore((state) => state.duplicate);
  const exportArchive = useInstanceStore((state) => state.exportArchive);
  const importArchive = useInstanceStore((state) => state.importArchive);
  const repairInstances = useInstanceStore((state) => state.repair);
  const account = useAuthStore((state) => state.account);
  const accountIdentity = account
    ? `${account.type}:${account.uuid}`
    : "signed-out";
  const {
    startGame,
    runningInstanceId,
    stoppingInstanceId,
    launchingInstanceId,
    stopGame,
  } = useGameStore();

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last-played");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = window.localStorage.getItem("dropout.instanceLibraryView");
    return saved === "grid" ? "grid" : "list";
  });
  const [readinessById, setReadinessById] = useState<
    Record<string, ReadinessState>
  >({});
  const readinessGeneration = useRef(0);
  const readinessAccount = useRef<string | null>(null);
  const pendingReadiness = useRef(new Map<string, number>());
  const [modCount, setModCount] = useState<number | null>(null);
  const [modCountLoading, setModCountLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [conversionInstance, setConversionInstance] = useState<Instance | null>(
    null,
  );
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(
    null,
  );
  const [editingInstance, setEditingInstance] = useState<Instance | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem("dropout.instanceLibraryView", viewMode);
  }, [viewMode]);

  const checkReadiness = useCallback(
    async (instance: Instance) => {
      const generation = readinessGeneration.current;
      if (pendingReadiness.current.get(instance.id) === generation) return;
      if (!instance.versionId) {
        setReadinessById((current) => ({
          ...current,
          [instance.id]: { status: "attention", probe: null },
        }));
        return;
      }

      pendingReadiness.current.set(instance.id, generation);
      setReadinessById((current) => ({
        ...current,
        [instance.id]: { status: "checking" },
      }));
      try {
        const probe = await getLaunchReadiness(instance.id, instance.versionId);
        if (generation !== readinessGeneration.current) return;
        const ready =
          Boolean(account) &&
          probe.versionInstalled &&
          Boolean(probe.java) &&
          hasValidMemory(instance);
        setReadinessById((current) => ({
          ...current,
          [instance.id]: {
            status: ready ? "ready" : "attention",
            probe,
          },
        }));
      } catch (error) {
        if (generation !== readinessGeneration.current) return;
        setReadinessById((current) => ({
          ...current,
          [instance.id]: {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          },
        }));
      } finally {
        if (pendingReadiness.current.get(instance.id) === generation) {
          pendingReadiness.current.delete(instance.id);
        }
      }
    },
    [account],
  );

  useEffect(() => {
    if (readinessAccount.current === accountIdentity) return;
    readinessAccount.current = accountIdentity;
    readinessGeneration.current += 1;
    setReadinessById({});
  }, [accountIdentity]);

  useEffect(() => {
    if (activeInstance) void checkReadiness(activeInstance);
  }, [activeInstance, checkReadiness]);

  useEffect(() => {
    if (!activeInstance) {
      setModCount(null);
      return;
    }

    let cancelled = false;
    setModCountLoading(true);
    void scanInstanceMods(activeInstance.id)
      .then((mods) => {
        if (!cancelled) setModCount(mods.length);
      })
      .catch((error) => {
        console.error("Failed to count instance mods:", error);
        if (!cancelled) setModCount(null);
      })
      .finally(() => {
        if (!cancelled) setModCountLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeInstance]);

  const visibleInstances = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = normalizedQuery
      ? instances.filter((instance) =>
          [
            instance.name,
            instance.versionId,
            instance.modLoader,
            instance.notes,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLocaleLowerCase().includes(normalizedQuery),
            ),
        )
      : [...instances];

    filtered.sort((a, b) => {
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      if (sortKey === "created") {
        return timestampMs(b.createdAt) - timestampMs(a.createdAt);
      }
      return (
        timestampMs(b.lastPlayed) - timestampMs(a.lastPlayed) ||
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );
    });
    return filtered;
  }, [instances, query, sortKey]);

  const selectInstance = useCallback(
    async (instance: Instance) => {
      try {
        await setActiveInstance(instance);
        void checkReadiness(instance);
        return true;
      } catch (error) {
        console.error("Failed to set active instance:", error);
        toast.error(t("instances.setActiveFailed"));
        return false;
      }
    },
    [checkReadiness, setActiveInstance, t],
  );

  const launchInstance = async (instance: Instance) => {
    if (!(await selectInstance(instance))) return;
    if (runningInstanceId === instance.id) {
      await stopGame(instance.id);
      return;
    }
    if (!instance.versionId) {
      toast.error(t("instances.noVersionError"));
      return;
    }
    if (!account) {
      toast.info(t("instances.loginFirst"));
      return;
    }
    try {
      await startGame(instance.id, instance.versionId);
    } catch (error) {
      console.error("Failed to start game:", error);
      toast.error(t("instances.launchFailed"));
    }
  };

  const openEdit = (instance: Instance) => {
    setEditingInstance(instance);
    setShowEditModal(true);
  };

  const openDelete = (instance: Instance) => {
    setSelectedInstance(instance);
    setShowDeleteConfirm(true);
  };

  const openDuplicate = (instance: Instance) => {
    setSelectedInstance(instance);
    setDuplicateName(`${instance.name} (${t("instances.copySuffix")})`);
    setShowDuplicateModal(true);
  };

  const openConversion = (instance: Instance) => {
    setConversionInstance(instance);
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Zip Archive", extensions: ["zip"] }],
      });
      if (typeof selected === "string") {
        await importArchive(selected);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleRepair = async () => {
    setRepairing(true);
    try {
      await repairInstances();
    } finally {
      setRepairing(false);
    }
  };

  const handleExport = async (instance: Instance) => {
    setExportingId(instance.id);
    try {
      const filePath = await save({
        defaultPath: `${instance.name.replace(/[\\/:*?"<>|]/g, "_")}.zip`,
        filters: [{ name: "Zip Archive", extensions: ["zip"] }],
      });
      if (filePath) await exportArchive(instance.id, filePath);
    } finally {
      setExportingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!selectedInstance) return;
    const deleted = await deleteInstance(selectedInstance.id);
    if (!deleted) return;
    setSelectedInstance(null);
    setShowDeleteConfirm(false);
  };

  const confirmDuplicate = async () => {
    if (!selectedInstance || !duplicateName.trim()) return;
    const duplicate = await duplicateInstance(
      selectedInstance.id,
      duplicateName.trim(),
    );
    if (!duplicate) return;
    setSelectedInstance(null);
    setDuplicateName("");
    setShowDuplicateModal(false);
  };

  const renderLibraryState = () => {
    if (instanceStatus === "loading" && instances.length === 0) {
      return (
        <div className="border-border/80 bg-card/70 flex min-h-72 flex-col items-center justify-center border p-8 text-center">
          <LoaderCircleIcon className="text-primary size-7 animate-spin motion-reduce:animate-none" />
          <h2 className="mt-4 text-sm font-semibold">
            {t("instances.states.loadingTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-sm text-xs">
            {t("instances.states.loadingDescription")}
          </p>
        </div>
      );
    }

    if (instanceStatus === "error") {
      return (
        <div className="border-destructive/40 bg-destructive/5 flex min-h-72 flex-col items-center justify-center border p-8 text-center">
          <CircleAlertIcon className="text-destructive size-7" />
          <h2 className="mt-4 text-sm font-semibold">
            {t("instances.states.errorTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-sm text-xs">
            {instanceError ?? t("instances.states.errorDescription")}
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void refreshInstances()}
            >
              <RefreshCwIcon />
              {t("instances.states.retry")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleRepair()}
              disabled={repairing}
            >
              <HardDriveIcon />
              {t("instances.repairIndex")}
            </Button>
          </div>
        </div>
      );
    }

    if (instances.length === 0) {
      return (
        <div className="border-border/80 bg-card/70 flex min-h-72 flex-col items-center justify-center border p-8 text-center">
          <Gamepad2Icon className="text-primary size-8" />
          <h2 className="mt-4 text-base font-semibold">
            {t("instances.states.emptyTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-sm text-xs">
            {t("instances.states.emptyDescription")}
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => navigate("/instances/create")}
            >
              <PlusIcon />
              {t("instances.create")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigate("/instances/import")}
            >
              <ImportIcon />
              {t("instances.fromLauncher")}
            </Button>
          </div>
        </div>
      );
    }

    if (visibleInstances.length === 0) {
      return (
        <div className="border-border/80 bg-card/70 flex min-h-56 flex-col items-center justify-center border p-8 text-center">
          <SearchIcon className="text-muted-foreground size-7" />
          <h2 className="mt-4 text-sm font-semibold">
            {t("instances.states.noResultsTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("instances.states.noResultsDescription", { query })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setQuery("")}
          >
            {t("instances.states.clearSearch")}
          </Button>
        </div>
      );
    }

    return (
      <ul
        aria-label={t("instances.libraryTitle")}
        className={cn(
          "min-h-0",
          viewMode === "grid"
            ? "grid grid-cols-1 gap-2 min-[980px]:grid-cols-2"
            : "space-y-2",
        )}
      >
        {visibleInstances.map((instance) => {
          const running = runningInstanceId === instance.id;
          return (
            <LibraryItem
              key={instance.id}
              instance={instance}
              active={activeInstance?.id === instance.id}
              view={viewMode}
              readiness={readinessById[instance.id]}
              launching={launchingInstanceId === instance.id}
              running={running}
              stopping={stoppingInstanceId === instance.id}
              anotherRunning={
                Boolean(runningInstanceId) && runningInstanceId !== instance.id
              }
              exporting={exportingId === instance.id}
              onVisible={(item) => void checkReadiness(item)}
              onSelect={(item) => void selectInstance(item)}
              onLaunch={(item) => void launchInstance(item)}
              onOpen={(item) => void openFileExplorer(item.gameDir)}
              onEdit={openEdit}
              onDuplicate={openDuplicate}
              onConvert={openConversion}
              onMods={(item) => navigate(`/instances/${item.id}/mods`)}
              onBrowse={(item) => navigate(`/instances/${item.id}/browse`)}
              onExport={(item) => void handleExport(item)}
              onDelete={openDelete}
            />
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">
      <header className="flex shrink-0 items-start justify-between gap-3">
        <div>
          <p className="text-primary text-[9px] font-bold uppercase tracking-[0.2em]">
            {t("instances.libraryEyebrow")}
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight">
            {t("instances.libraryTitle")}
          </h1>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {t("instances.librarySubtitle", { count: instances.length })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              nativeButton={false}
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={t("instances.libraryActions")}
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {t("instances.libraryActions")}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => void handleImport()}
                  disabled={isImporting}
                >
                  <ArchiveIcon />
                  {t("instances.importZip")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/instances/import")}>
                  <ImportIcon />
                  {t("instances.fromLauncher")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => void handleRepair()}
                  disabled={repairing}
                >
                  <HardDriveIcon />
                  {repairing
                    ? t("instances.repairing")
                    : t("instances.repairIndex")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate("/instances/create")}
          >
            <PlusIcon />
            {t("instances.create")}
          </Button>
        </div>
      </header>

      <div className="border-border/70 bg-card/65 flex shrink-0 flex-wrap items-center gap-2 border p-2 backdrop-blur-xl">
        <div className="relative min-w-44 flex-1">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("instances.searchPlaceholder")}
            aria-label={t("instances.searchLabel")}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select
          value={sortKey}
          onValueChange={(value) => value && setSortKey(value as SortKey)}
        >
          <SelectTrigger
            size="sm"
            className="w-36"
            aria-label={t("instances.sortLabel")}
          >
            <SlidersHorizontalIcon />
            <span className="truncate">
              {t(
                sortKey === "name"
                  ? "instances.sort.name"
                  : sortKey === "created"
                    ? "instances.sort.created"
                    : "instances.sort.lastPlayed",
              )}
            </span>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="last-played">
              {t("instances.sort.lastPlayed")}
            </SelectItem>
            <SelectItem value="name">{t("instances.sort.name")}</SelectItem>
            <SelectItem value="created">
              {t("instances.sort.created")}
            </SelectItem>
          </SelectContent>
        </Select>

        <fieldset className="border-border flex border">
          <legend className="sr-only">{t("instances.viewLabel")}</legend>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={t("instances.view.list")}
            aria-pressed={viewMode === "list"}
            data-active={viewMode === "list"}
            onClick={() => setViewMode("list")}
          >
            <ListIcon />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="border-border size-7 border-l"
            aria-label={t("instances.view.grid")}
            aria-pressed={viewMode === "grid"}
            data-active={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          >
            <Grid2X2Icon />
          </Button>
        </fieldset>

        <span className="text-muted-foreground min-w-20 text-right font-mono text-[9px]">
          {t("instances.resultCount", {
            visible: visibleInstances.length,
            total: instances.length,
          })}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 min-[840px]:grid-cols-[minmax(0,1fr)_minmax(270px,0.72fr)]">
        <section
          aria-label={t("instances.libraryTitle")}
          className={cn(
            "min-h-0 overflow-y-auto pr-1",
            !activeInstance && "min-[840px]:col-span-2",
          )}
        >
          {renderLibraryState()}
        </section>

        {activeInstance ? (
          <DetailWorkspace
            instance={activeInstance}
            readiness={readinessById[activeInstance.id]}
            modCount={modCount}
            modCountLoading={modCountLoading}
            launching={launchingInstanceId === activeInstance.id}
            running={runningInstanceId === activeInstance.id}
            stopping={stoppingInstanceId === activeInstance.id}
            exporting={exportingId === activeInstance.id}
            onLaunch={(item) => void launchInstance(item)}
            onOpen={(item) => void openFileExplorer(item.gameDir)}
            onEdit={openEdit}
            onDuplicate={openDuplicate}
            onExport={(item) => void handleExport(item)}
            onMods={(item) => navigate(`/instances/${item.id}/mods`)}
            onBrowse={(item) => navigate(`/instances/${item.id}/browse`)}
          />
        ) : (
          instances.length > 0 &&
          instanceStatus !== "error" && (
            <aside className="border-border/80 bg-card/80 text-muted-foreground flex items-center justify-center border p-6 text-center text-xs">
              {t("instances.detail.selectHint")}
            </aside>
          )
        )}
      </div>

      <InstanceEditorModal
        open={showEditModal}
        instance={editingInstance}
        onOpenChange={(openState) => {
          setShowEditModal(openState);
          if (!openState) setEditingInstance(null);
        }}
      />

      <ConversionWizard
        open={Boolean(conversionInstance)}
        instance={conversionInstance}
        onOpenChange={(openState) => {
          if (!openState) setConversionInstance(null);
        }}
        onComplete={() => void refreshInstances()}
      />

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("instances.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("instances.deleteConfirm", { name: selectedInstance?.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="border-destructive/30 bg-destructive/5 text-muted-foreground border p-3 text-xs">
            {t("instances.deleteRecovery")}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setSelectedInstance(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("instances.duplicateTitle")}</DialogTitle>
            <DialogDescription>
              {t("instances.duplicateHint")}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={duplicateName}
            onChange={(event) => setDuplicateName(event.target.value)}
            placeholder={t("instances.duplicatePlaceholder")}
            onKeyDown={(event) => {
              if (event.key === "Enter") void confirmDuplicate();
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDuplicateModal(false);
                setSelectedInstance(null);
                setDuplicateName("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void confirmDuplicate()}
              disabled={!duplicateName.trim()}
            >
              {t("common.duplicate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

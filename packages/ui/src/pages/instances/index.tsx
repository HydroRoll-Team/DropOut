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
import { Spinner } from "@/components/ui/spinner";
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

function timestampMs(value: number | null) {
  if (value === null) return 0;
  const numeric = Number(value);
  return numeric > 1e12 ? numeric : numeric * 1000;
}

function formatDate(value: number | null, locale: string) {
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
      <span className="chip chip-go" title={label}>
        <CheckCircle2Icon className="size-3" aria-hidden="true" />
        {compact ? <span className="sr-only">{label}</span> : label}
      </span>
    );
  }

  if (readiness?.status === "attention" || readiness?.status === "error") {
    return (
      <span className="chip chip-warn" title={label}>
        <CircleAlertIcon className="size-3" aria-hidden="true" />
        {compact ? <span className="sr-only">{label}</span> : label}
      </span>
    );
  }

  return (
    <span className="chip chip-ghost" title={label}>
      <LoaderCircleIcon
        className="size-3 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}

interface LibraryItemProps {
  instance: Instance;
  index: number;
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
  index,
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

  const number = String(index).padStart(3, "0");
  const loader = loaderLabel(instance, t("instances.vanilla"));

  return (
    <li
      ref={itemRef}
      data-testid="instance-library-item"
      data-instance-name={instance.name}
      className={cn(
        "group relative min-w-0 border border-rule bg-sheet transition-shadow",
        active && "z-10 shadow-[5px_5px_0_0_var(--signal)]",
        view === "grid" ? "flex min-h-44 flex-col" : "flex items-stretch",
      )}
    >
      {view === "grid" && (
        <div aria-hidden="true" className="win-title">
          <span>#{number}</span>
          <span className="opacity-70">{instance.versionId ?? "—"}</span>
        </div>
      )}
      <button
        type="button"
        className={cn(
          "min-w-0 flex-1 cursor-pointer text-left outline-none hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring",
          view === "grid"
            ? "flex flex-col gap-3 p-2.5"
            : "flex items-center gap-3 py-2 pr-3 pl-2",
        )}
        onClick={() => onSelect(instance)}
        aria-label={t("instances.select", { name: instance.name })}
        aria-current={active ? "true" : undefined}
      >
        {view === "list" && (
          <span
            aria-hidden="true"
            className="type-pixel w-7 shrink-0 self-start pt-0.5 text-[11px] text-ink/45"
          >
            {number}
          </span>
        )}
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center overflow-hidden border border-rule bg-ink font-pixel text-[22px] leading-none text-paper",
            view === "grid" && "size-11",
          )}
        >
          {instance.iconPath ? (
            <img
              src={instance.iconPath}
              alt=""
              className="size-full object-cover [image-rendering:pixelated]"
            />
          ) : (
            instance.name.charAt(0).toUpperCase()
          )}
        </span>

        <span className="block min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-[17px] leading-tight font-semibold tracking-[-0.035em]">
              {instance.name}
            </span>
            {active && (
              <span className="chip chip-signal shrink-0">
                {t("instances.active")}
              </span>
            )}
          </span>
          <span className="type-mono mt-0.5 block truncate text-[10.5px] text-ink/60 uppercase">
            {instance.versionId ?? t("instances.noVersion")} / {loader}
          </span>

          <span
            className={cn(
              "mt-2 flex items-center justify-between gap-2",
              view === "list" && "mt-1.5",
            )}
          >
            <ReadinessMark readiness={readiness} />
            <span className="type-pixel truncate text-[11px] text-ink/55">
              {lastPlayed
                ? view === "grid"
                  ? lastPlayed
                  : t("instances.lastPlayedValue", { date: lastPlayed })
                : t("instances.neverPlayed")}
            </span>
          </span>
        </span>
      </button>

      <div
        className={cn(
          "flex shrink-0 items-center gap-1",
          view === "grid"
            ? "border-t border-rule bg-win p-1"
            : "border-l border-dashed border-rule px-2",
        )}
      >
        <Button
          type="button"
          size={view === "grid" ? "sm" : "icon"}
          variant={running ? "destructive" : active ? "go" : "outline"}
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

  const label = (text: string) => (
    <span className="type-pixel text-[11px] uppercase">{text}</span>
  );

  return (
    <aside
      aria-labelledby="instance-detail-title"
      className="win flex min-h-0 flex-col"
    >
      <div aria-hidden="true" className="win-title shrink-0">
        <span>INSTANCE.INFO</span>
        <span className="opacity-70">{instance.versionId ?? "—"}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative overflow-hidden border-b border-rule p-3">
          <span
            aria-hidden="true"
            className="type-display glyph-dropped pointer-events-none absolute -top-3 -right-2 text-[92px] opacity-60 select-none"
          >
            {instance.name.charAt(0).toUpperCase()}
          </span>
          <p className="type-pixel relative text-[11px] text-ink/60">
            {t("instances.detail.activeWorkspace")}
          </p>
          <h2
            id="instance-detail-title"
            className="type-display relative mt-1 text-[30px] break-words"
          >
            {instance.name}
          </h2>
          <div className="relative mt-2.5">
            <ReadinessMark readiness={readiness} />
          </div>

          <Button
            type="button"
            className="relative mt-3 w-full"
            size="lg"
            variant={running ? "destructive" : "go"}
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

        <div className="space-y-4 p-3">
          <section aria-labelledby="readiness-detail-title">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3
                id="readiness-detail-title"
                className="font-display text-[14px] font-semibold tracking-[-0.03em]"
              >
                {t("instances.detail.readiness")}
              </h3>
              <span className="chip">{instance.versionId ?? "—"}</span>
            </div>
            <dl className="space-y-1 text-[12px]">
              <div className="flex min-w-0 items-baseline">
                <dt className="shrink-0">
                  {label(t("instances.detail.gameFiles"))}
                </dt>
                <span aria-hidden="true" className="leader" />
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
              <div className="flex min-w-0 items-baseline">
                <dt className="shrink-0">{label("Java")}</dt>
                <span aria-hidden="true" className="leader" />
                <dd className="truncate font-medium" title={probe?.java?.path}>
                  {probe?.java
                    ? `${probe.java.version} · ${probe.java.vendor}`
                    : probe
                      ? t("instances.detail.missing")
                      : "—"}
                </dd>
              </div>
              <div className="flex min-w-0 items-baseline">
                <dt className="shrink-0">
                  {label(t("instances.detail.memory"))}
                </dt>
                <span aria-hidden="true" className="leader" />
                <dd className="truncate font-medium">{memory}</dd>
              </div>
              <div className="flex min-w-0 items-baseline">
                <dt className="shrink-0">
                  {label(t("instances.detail.mods"))}
                </dt>
                <span aria-hidden="true" className="leader" />
                <dd className="font-medium">
                  {modCountLoading ? "…" : (modCount ?? "—")}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="instance-notes-title" className="col-rule">
            <h3
              id="instance-notes-title"
              className="type-pixel text-[11px] uppercase"
            >
              {t("instances.detail.notes")}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-ink/75">
              {instance.notes?.trim() || t("instances.detail.noNotes")}
            </p>
          </section>

          <section
            aria-labelledby="instance-runtime-title"
            className="col-rule-dashed"
          >
            <h3
              id="instance-runtime-title"
              className="type-pixel text-[11px] uppercase"
            >
              {t("instances.detail.environment")}
            </h3>
            <dl className="mt-1.5 space-y-1.5 text-[12px]">
              <div>
                <dt className="text-ink/60">{t("instances.detail.loader")}</dt>
                <dd className="font-medium">
                  {loaderLabel(instance, t("instances.vanilla"))}
                </dd>
              </div>
              <div>
                <dt className="text-ink/60">
                  {t("instances.detail.javaOverride")}
                </dt>
                <dd
                  className="type-mono truncate text-[10.5px]"
                  title={instance.javaPathOverride ?? undefined}
                >
                  {instance.javaPathOverride ?? t("instances.detail.automatic")}
                </dd>
              </div>
              <div>
                <dt className="text-ink/60">{t("instances.detail.created")}</dt>
                <dd className="font-medium">{created}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="instance-path-title">
            <div className="flex items-center justify-between gap-2">
              <h3
                id="instance-path-title"
                className="type-pixel text-[11px] uppercase"
              >
                {t("instances.detail.gameDirectory")}
              </h3>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={copyPath}
                aria-label={t("instances.detail.copyPath")}
              >
                <CopyIcon />
              </Button>
            </div>
            <p
              className="type-mono dots mt-1 truncate border border-dashed border-rule bg-paper px-2 py-1.5 text-[10px]"
              title={instance.gameDir}
            >
              {instance.gameDir}
            </p>
          </section>

          <section aria-label={t("instances.detail.shortcuts")}>
            <div className="grid grid-cols-2 gap-1">
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
                variant="secondary"
                onClick={() => onMods(instance)}
              >
                <PackageIcon />
                {t("instances.actions.mods")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onBrowse(instance)}
              >
                <Gamepad2Icon />
                {t("instances.actions.content")}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}

/* 状态面板：一扇窗口，里面放图示、标题和下一步 */
function StatePanel({
  chrome,
  tone,
  compact = false,
  children,
}: {
  chrome: string;
  tone: "sheet" | "dots" | "fault";
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "win mr-2 mb-2 flex flex-col",
        compact ? "min-h-56" : "min-h-72",
      )}
    >
      <div aria-hidden="true" className="win-title">
        <span>{chrome}</span>
        <span className="opacity-60">∵ x</span>
      </div>
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center p-8 text-center",
          tone === "dots" && "dots",
          tone === "fault" && "border-l-8 border-fault",
        )}
      >
        {tone === "dots" ? (
          <div className="flex flex-col items-center border border-rule bg-sheet px-8 py-6">
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* 一个 4×3 的格子，全部被丢掉了：还没有任何实例 */
function DroppedGrid() {
  return (
    <div aria-hidden="true" className="grid grid-cols-4 gap-1.5 bg-sheet p-2">
      {Array.from({ length: 12 }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: 固定数量的格子
          key={index}
          className={cn("size-5", index === 5 ? "bg-signal" : "dropped")}
        />
      ))}
    </div>
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
        <StatePanel chrome="LOADING.DIR" tone="sheet">
          <Spinner className="size-6" />
          <h2 className="mt-4 font-display text-[22px] font-semibold tracking-[-0.035em]">
            {t("instances.states.loadingTitle")}
          </h2>
          <p className="mt-1 max-w-sm text-[12px] text-ink/65">
            {t("instances.states.loadingDescription")}
          </p>
        </StatePanel>
      );
    }

    if (instanceStatus === "error") {
      return (
        <StatePanel chrome="ERROR.LOG" tone="fault">
          <CircleAlertIcon className="size-7 text-fault" />
          <h2 className="mt-4 font-display text-[22px] font-semibold tracking-[-0.035em]">
            {t("instances.states.errorTitle")}
          </h2>
          <p className="type-mono mt-1 max-w-sm text-[11px] text-ink/70">
            {instanceError ?? t("instances.states.errorDescription")}
          </p>
          <div className="mt-4 flex gap-1.5">
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
        </StatePanel>
      );
    }

    if (instances.length === 0) {
      return (
        <StatePanel chrome="EMPTY.DIR" tone="dots">
          <DroppedGrid />
          <h2 className="type-display mt-5 text-[34px]">
            {t("instances.states.emptyTitle")}
          </h2>
          <p className="mt-2 max-w-sm text-[13px] text-ink/70">
            {t("instances.states.emptyDescription")}
          </p>
          <div className="mt-5 flex gap-1.5">
            <Button
              type="button"
              size="lg"
              onClick={() => navigate("/instances/create")}
            >
              <PlusIcon />
              {t("instances.create")}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => navigate("/instances/import")}
            >
              <ImportIcon />
              {t("instances.fromLauncher")}
            </Button>
          </div>
        </StatePanel>
      );
    }

    if (visibleInstances.length === 0) {
      return (
        <StatePanel chrome="SEARCH.EXE" tone="sheet" compact>
          <SearchIcon className="size-6 text-ink/60" />
          <h2 className="mt-3 font-display text-[20px] font-semibold tracking-[-0.035em]">
            {t("instances.states.noResultsTitle")}
          </h2>
          <p className="mt-1 text-[12px] text-ink/65">
            {t("instances.states.noResultsDescription", { query })}
          </p>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2"
            onClick={() => setQuery("")}
          >
            {t("instances.states.clearSearch")}
          </Button>
        </StatePanel>
      );
    }

    return (
      <ul
        aria-label={t("instances.libraryTitle")}
        className={cn(
          "min-h-0 pr-2 pb-2",
          viewMode === "grid"
            ? "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3"
            : "flex flex-col [&>li+li]:-mt-px",
        )}
      >
        {visibleInstances.map((instance, index) => {
          const running = runningInstanceId === instance.id;
          return (
            <LibraryItem
              key={instance.id}
              index={index + 1}
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
    <div className="relative flex h-full min-h-0 flex-col gap-3 overflow-hidden px-6 pt-4 pb-4">
      <span
        aria-hidden="true"
        className="type-display glyph-dropped pointer-events-none absolute -top-6 left-[min(724px,calc(100%-200px))] -translate-x-full text-[180px] leading-none opacity-50 select-none"
      >
        02
      </span>

      <header className="relative flex shrink-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="tag text-[13px]">
            <span className="shrink-0">{t("instances.libraryEyebrow")}</span>
            <span aria-hidden="true" className="leader w-14" />
            <span className="shrink-0">
              {t("instances.librarySubtitle", { count: instances.length })}
            </span>
          </p>
          <h1 className="type-display mt-3 text-[51px]">
            {t("instances.libraryTitle")}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pb-1">
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
          <Button type="button" onClick={() => navigate("/instances/create")}>
            <PlusIcon />
            {t("instances.create")}
          </Button>
        </div>
      </header>

      <div className="relative flex shrink-0 flex-wrap items-center gap-1.5 border border-rule bg-win p-1.5">
        <span aria-hidden="true" className="chip">
          FILTER
        </span>
        <div className="relative min-w-44 flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink/60"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("instances.searchPlaceholder")}
            aria-label={t("instances.searchLabel")}
            className="h-7 pl-8 text-xs"
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

        <fieldset className="flex border border-rule bg-sheet">
          <legend className="sr-only">{t("instances.viewLabel")}</legend>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-[26px] data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
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
            className="size-[26px] border-l border-rule data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
            aria-label={t("instances.view.grid")}
            aria-pressed={viewMode === "grid"}
            data-active={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          >
            <Grid2X2Icon />
          </Button>
        </fieldset>

        <span className="type-pixel min-w-20 text-right text-[11px]">
          {t("instances.resultCount", {
            visible: visibleInstances.length,
            total: instances.length,
          })}
        </span>
      </div>

      <div className="relative grid min-h-0 flex-1 gap-4 min-[840px]:grid-cols-[minmax(0,1fr)_394px]">
        <section
          aria-label={t("instances.libraryTitle")}
          className={cn(
            "min-h-0 overflow-y-auto pt-px pl-px",
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
            <aside className="dropped flex items-center justify-center p-6 text-center text-[12px] opacity-100">
              <span className="max-w-48 text-ink/65">
                {t("instances.detail.selectHint")}
              </span>
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

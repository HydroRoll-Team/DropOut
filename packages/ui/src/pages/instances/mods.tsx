import {
  ArrowLeftIcon,
  PackageIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { deleteMod, getInstance, scanInstanceMods, toggleMod } from "@/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Instance, ModInfo } from "@/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ModsPage() {
  const { t } = useTranslation();
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();

  const [instance, setInstance] = useState<Instance | null>(null);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ModInfo | null>(null);

  const load = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const [inst, modList] = await Promise.all([
        getInstance(instanceId),
        scanInstanceMods(instanceId),
      ]);
      setInstance(inst);
      setMods(modList);
    } catch (e) {
      toast.error(`Failed to load mods: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search) return mods;
    const q = search.toLowerCase();
    return mods.filter(
      (m) =>
        (m.modName ?? m.fileName).toLowerCase().includes(q) ||
        m.modId?.toLowerCase().includes(q),
    );
  }, [mods, search]);

  const handleToggle = async (mod: ModInfo) => {
    if (!instanceId) return;
    try {
      const updated = await toggleMod(instanceId, mod.fileName);
      setMods((prev) =>
        prev.map((m) => (m.fileName === mod.fileName ? updated : m)),
      );
    } catch (e) {
      toast.error(`Failed to toggle mod: ${e}`);
    }
  };

  const handleDelete = async () => {
    if (!instanceId || !deleteTarget) return;
    try {
      await deleteMod(instanceId, deleteTarget.fileName);
      setMods((prev) =>
        prev.filter((m) => m.fileName !== deleteTarget.fileName),
      );
      toast.success(`Deleted ${deleteTarget.modName ?? deleteTarget.fileName}`);
    } catch (e) {
      toast.error(`Failed to delete mod: ${e}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{t("mods.title")}</h1>
          {instance && (
            <p className="text-sm text-muted-foreground">{instance.name}</p>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t("mods.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCwIcon className="size-4" />
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {loading && mods.length === 0 && (
          <p className="text-center text-muted-foreground py-12">
            {t("mods.loading")}
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <PackageIcon className="size-10 mb-2 opacity-40" />
            <p>{mods.length === 0 ? t("mods.noMods") : t("mods.noResults")}</p>
          </div>
        )}
        {filtered.map((mod) => (
          <div
            key={mod.fileName}
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-card/50 hover:bg-card/80 transition-colors"
          >
            <Switch
              checked={mod.enabled}
              onCheckedChange={() => handleToggle(mod)}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {mod.modName ?? mod.fileName}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {mod.version && <span>v{mod.version}</span>}
                {mod.modLoader && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {mod.modLoader}
                  </Badge>
                )}
                <span>{formatSize(Number(mod.fileSize))}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(mod)}
            >
              <Trash2Icon className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mods.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("mods.deleteConfirm", {
                name: deleteTarget?.modName ?? deleteTarget?.fileName,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

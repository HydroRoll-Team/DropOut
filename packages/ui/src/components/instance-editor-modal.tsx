import { invoke } from "@tauri-apps/api/core";
import { Folder, Loader2, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";

import { toNumber } from "@/lib/tsrs-utils";
import { useInstanceStore } from "@/models/instance";
import { useSettingsStore } from "@/models/settings";
import type { FileInfo } from "../types/bindings/core";
import type { Instance } from "../types/bindings/instance";

type Props = {
  open: boolean;
  instance: Instance | null;
  onOpenChange: (open: boolean) => void;
};

export function InstanceEditorModal({ open, instance, onOpenChange }: Props) {
  const instancesStore = useInstanceStore();
  const { config } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<
    "info" | "version" | "files" | "settings"
  >("info");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Info tab fields
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Files tab state
  const [selectedFileFolder, setSelectedFileFolder] = useState<
    "mods" | "resourcepacks" | "shaderpacks" | "saves" | "screenshots"
  >("mods");
  const [fileList, setFileList] = useState<FileInfo[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  // Version tab state (placeholder - the Svelte implementation used a ModLoaderSelector component)
  // React versions-view/instance-creation handle mod loader installs; here we show basic current info.

  // Settings tab fields
  const [editMemoryMin, setEditMemoryMin] = useState<number>(0);
  const [editMemoryMax, setEditMemoryMax] = useState<number>(0);
  const [editJavaArgs, setEditJavaArgs] = useState<string>("");

  // initialize when open & instance changes
  useEffect(() => {
    if (open && instance) {
      setActiveTab("info");
      setSaving(false);
      setErrorMessage("");
      setEditName(instance.name || "");
      setEditNotes(instance.notes ?? "");
      setEditMemoryMin(
        (instance.memoryOverride && toNumber(instance.memoryOverride.min)) ??
          config?.minMemory ??
          512,
      );
      setEditMemoryMax(
        (instance.memoryOverride && toNumber(instance.memoryOverride.max)) ??
          config?.maxMemory ??
          2048,
      );
      setEditJavaArgs(instance.jvmArgsOverride ?? "");
      setFileList([]);
      setSelectedFileFolder("mods");
    }
  }, [open, instance, config?.minMemory, config?.maxMemory]);

  // load files when switching to files tab
  const loadFileList = useCallback(
    async (
      folder:
        | "mods"
        | "resourcepacks"
        | "shaderpacks"
        | "saves"
        | "screenshots",
    ) => {
      if (!instance) return;
      setLoadingFiles(true);
      try {
        const files = await invoke<FileInfo[]>("list_instance_directory", {
          instanceId: instance.id,
          folder,
        });
        setFileList(files || []);
      } catch (err) {
        console.error("Failed to load files:", err);
        toast.error("Failed to load files: " + String(err));
        setFileList([]);
      } finally {
        setLoadingFiles(false);
      }
    },
    [instance],
  );

  useEffect(() => {
    if (open && instance && activeTab === "files") {
      // explicitly pass the selected folder so loadFileList doesn't rely on stale closures
      loadFileList(selectedFileFolder);
    }
  }, [activeTab, open, instance, selectedFileFolder, loadFileList]);

  async function changeFolder(
    folder: "mods" | "resourcepacks" | "shaderpacks" | "saves" | "screenshots",
  ) {
    setSelectedFileFolder(folder);
    // reload the list for the newly selected folder
    if (open && instance) await loadFileList(folder);
  }

  async function deleteFile(filePath: string) {
    if (
      !confirm(
        `Are you sure you want to delete "${filePath.split("/").pop()}"?`,
      )
    ) {
      return;
    }
    setDeletingPath(filePath);
    try {
      await invoke("delete_instance_file", { path: filePath });
      // refresh the currently selected folder
      await loadFileList(selectedFileFolder);
      toast.success("Deleted");
    } catch (err) {
      console.error("Failed to delete file:", err);
      toast.error("Failed to delete file: " + String(err));
    } finally {
      setDeletingPath(null);
    }
  }

  async function openInExplorer(filePath: string) {
    try {
      await invoke("open_file_explorer", { path: filePath });
    } catch (err) {
      console.error("Failed to open in explorer:", err);
      toast.error("Failed to open file explorer: " + String(err));
    }
  }

  async function saveChanges() {
    if (!instance) return;
    if (!editName.trim()) {
      setErrorMessage("Instance name cannot be empty");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    try {
      // Build updated instance shape compatible with backend
      const updatedInstance: Instance = {
        ...instance,
        name: editName.trim(),
        // some bindings may use camelCase; set optional string fields to null when empty
        notes: editNotes.trim() ? editNotes.trim() : null,
        memoryOverride: {
          min: editMemoryMin,
          max: editMemoryMax,
        },
        jvmArgsOverride: editJavaArgs.trim() ? editJavaArgs.trim() : null,
      };

      await instancesStore.update(updatedInstance as Instance);
      toast.success("Instance saved");
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save instance:", err);
      setErrorMessage(String(err));
      toast.error("Failed to save instance: " + String(err));
    } finally {
      setSaving(false);
    }
  }

  function formatFileSize(bytesBig: FileInfo["size"]): string {
    const bytes = Number(bytesBig ?? 0);
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
  }

  function formatDate(
    tsBig?:
      | FileInfo["modified"]
      | Instance["createdAt"]
      | Instance["lastPlayed"],
  ) {
    if (tsBig === undefined || tsBig === null) return "";
    const n = toNumber(tsBig);
    // tsrs bindings often use seconds for createdAt/lastPlayed; if value looks like seconds use *1000
    const maybeMs = n > 1e12 ? n : n * 1000;
    return new Date(maybeMs).toLocaleDateString();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>Edit Instance</DialogTitle>
              <DialogDescription>{instance?.name ?? ""}</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="p-2 rounded hover:bg-zinc-800 text-zinc-400"
                aria-label="Close"
              >
                <X />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex gap-1 px-6 pt-2 border-b border-zinc-700">
          {[
            { id: "info", label: "Info" },
            { id: "version", label: "Version" },
            { id: "files", label: "Files" },
            { id: "settings", label: "Settings" },
          ].map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() =>
                setActiveTab(
                  tab.id as "info" | "version" | "files" | "settings",
                )
              }
              className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === "info" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="instance-name-edit"
                  className="block text-sm font-medium mb-2"
                >
                  Instance Name
                </label>
                <Input
                  id="instance-name-edit"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div>
                <label
                  htmlFor="instance-notes-edit"
                  className="block text-sm font-medium mb-2"
                >
                  Notes
                </label>
                <Textarea
                  id="instance-notes-edit"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-zinc-800 rounded-lg">
                  <p className="text-zinc-400">Created</p>
                  <p className="text-white font-medium">
                    {instance?.createdAt ? formatDate(instance.createdAt) : "-"}
                  </p>
                </div>
                <div className="p-3 bg-zinc-800 rounded-lg">
                  <p className="text-zinc-400">Last Played</p>
                  <p className="text-white font-medium">
                    {instance?.lastPlayed
                      ? formatDate(instance.lastPlayed)
                      : "Never"}
                  </p>
                </div>
                <div className="p-3 bg-zinc-800 rounded-lg">
                  <p className="text-zinc-400">Game Directory</p>
                  <p
                    className="text-white font-medium text-xs truncate"
                    title={instance?.gameDir ?? ""}
                  >
                    {instance?.gameDir
                      ? String(instance.gameDir).split("/").pop()
                      : ""}
                  </p>
                </div>
                <div className="p-3 bg-zinc-800 rounded-lg">
                  <p className="text-zinc-400">Current Version</p>
                  <p className="text-white font-medium">
                    {instance?.versionId ?? "None"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "version" && (
            <div className="space-y-4">
              {instance?.versionId ? (
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                  <p className="text-sm text-indigo-400">
                    Currently playing:{" "}
                    <span className="font-medium">{instance.versionId}</span>
                    {instance.modLoader && (
                      <>
                        {" "}
                        with{" "}
                        <span className="capitalize">{instance.modLoader}</span>
                        {instance.modLoaderVersion
                          ? ` ${instance.modLoaderVersion}`
                          : ""}
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <div className="text-sm text-zinc-400">
                  No version selected for this instance
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2">
                  Change Version / Mod Loader
                </p>
                <p className="text-xs text-zinc-400">
                  Use the Versions page to install new game versions or mod
                  loaders, then set them here.
                </p>
              </div>
            </div>
          )}

          {activeTab === "files" && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {(
                  [
                    "mods",
                    "resourcepacks",
                    "shaderpacks",
                    "saves",
                    "screenshots",
                  ] as const
                ).map((folder) => (
                  <button
                    type="button"
                    key={folder}
                    onClick={() => changeFolder(folder)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedFileFolder === folder
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {folder}
                  </button>
                ))}
              </div>

              {loadingFiles ? (
                <div className="flex items-center gap-2 text-zinc-400 py-8 justify-center">
                  <Loader2 className="animate-spin" />
                  Loading files...
                </div>
              ) : fileList.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  No files in this folder
                </div>
              ) : (
                <div className="space-y-2">
                  {fileList.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {file.isDirectory
                            ? "Folder"
                            : formatFileSize(file.size)}{" "}
                          • {formatDate(file.modified)}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          type="button"
                          onClick={() => openInExplorer(file.path)}
                          title="Open in explorer"
                          className="p-2 rounded-lg hover:bg-zinc-600 text-zinc-400 hover:text-white transition-colors"
                        >
                          <Folder />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFile(file.path)}
                          disabled={deletingPath === file.path}
                          title="Delete"
                          className="p-2 rounded-lg hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                        >
                          {deletingPath === file.path ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="min-memory-edit"
                  className="block text-sm font-medium mb-2"
                >
                  Minimum Memory (MB)
                </label>
                <Input
                  id="min-memory-edit"
                  type="number"
                  value={String(editMemoryMin)}
                  onChange={(e) => setEditMemoryMin(Number(e.target.value))}
                  disabled={saving}
                />
                <p className="text-xs text-zinc-400 mt-1">
                  Default: {config?.minMemory} MB
                </p>
              </div>

              <div>
                <label
                  htmlFor="max-memory-edit"
                  className="block text-sm font-medium mb-2"
                >
                  Maximum Memory (MB)
                </label>
                <Input
                  id="max-memory-edit"
                  type="number"
                  value={String(editMemoryMax)}
                  onChange={(e) => setEditMemoryMax(Number(e.target.value))}
                  disabled={saving}
                />
                <p className="text-xs text-zinc-400 mt-1">
                  Default: {config?.maxMemory} MB
                </p>
              </div>

              <div>
                <label
                  htmlFor="jvm-args-edit"
                  className="block text-sm font-medium mb-2"
                >
                  JVM Arguments (Advanced)
                </label>
                <Textarea
                  id="jvm-args-edit"
                  value={editJavaArgs}
                  onChange={(e) => setEditJavaArgs(e.target.value)}
                  rows={4}
                  disabled={saving}
                />
              </div>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="px-6 text-sm text-red-400">{errorMessage}</div>
        )}

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveChanges} disabled={saving}>
                {saving ? (
                  <Loader2 className="animate-spin mr-2" />
                ) : (
                  <Save className="mr-2" />
                )}
                Save
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InstanceEditorModal;

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { X, Save, Loader2, Trash2, FolderOpen } from "lucide-svelte";
  import { instancesState } from "../stores/instances.svelte";
  import { gameState } from "../stores/game.svelte";
  import { settingsState } from "../stores/settings.svelte";
  import type { Instance, FileInfo, FabricLoaderEntry, ForgeVersion } from "../types";
  import ModLoaderSelector from "./ModLoaderSelector.svelte";

  interface Props {
    isOpen: boolean;
    instance: Instance | null;
    onClose: () => void;
  }

  let { isOpen, instance, onClose }: Props = $props();

  // Tabs: "info" | "version" | "files" | "settings"
  let activeTab = $state<"info" | "version" | "files" | "settings">("info");
  let saving = $state(false);
  let errorMessage = $state("");

  // Info tab state
  let editName = $state("");
  let editNotes = $state("");

  // Version tab state
  let fabricLoaders = $state<FabricLoaderEntry[]>([]);
  let forgeVersions = $state<ForgeVersion[]>([]);
  let loadingVersions = $state(false);

  // Files tab state
  let selectedFileFolder = $state<"mods" | "resourcepacks" | "shaderpacks" | "saves" | "screenshots">("mods");
  let fileList = $state<FileInfo[]>([]);
  let loadingFiles = $state(false);
  let deletingPath = $state<string | null>(null);

  // Settings tab state
  let editMemoryMin = $state(0);
  let editMemoryMax = $state(0);
  let editJavaArgs = $state("");

  // Initialize form when instance changes
  $effect(() => {
    if (isOpen && instance) {
      editName = instance.name;
      editNotes = instance.notes || "";
      editMemoryMin = instance.memory_override?.min || settingsState.settings.min_memory || 512;
      editMemoryMax = instance.memory_override?.max || settingsState.settings.max_memory || 2048;
      editJavaArgs = instance.jvm_args_override || "";
      errorMessage = "";
    }
  });

  // Load files when switching to files tab
  $effect(() => {
    if (isOpen && instance && activeTab === "files") {
      loadFileList();
    }
  });

  // Load file list for selected folder
  async function loadFileList() {
    if (!instance) return;
    
    loadingFiles = true;
    try {
      const files = await invoke<FileInfo[]>("list_instance_directory", {
        instanceId: instance.id,
        folder: selectedFileFolder,
      });
      fileList = files;
    } catch (err) {
      errorMessage = `Failed to load files: ${err}`;
      fileList = [];
    } finally {
      loadingFiles = false;
    }
  }

  // Change selected folder and reload
  async function changeFolder(folder: "mods" | "resourcepacks" | "shaderpacks" | "saves" | "screenshots") {
    selectedFileFolder = folder;
    await loadFileList();
  }

  // Delete a file or directory
  async function deleteFile(filePath: string) {
    if (!confirm(`Are you sure you want to delete "${filePath.split("/").pop()}"?`)) {
      return;
    }

    deletingPath = filePath;
    try {
      await invoke("delete_instance_file", { path: filePath });
      // Reload file list
      await loadFileList();
    } catch (err) {
      errorMessage = `Failed to delete file: ${err}`;
    } finally {
      deletingPath = null;
    }
  }

  // Open file in system explorer
  async function openInExplorer(filePath: string) {
    try {
      await invoke("open_file_explorer", { path: filePath });
    } catch (err) {
      errorMessage = `Failed to open file explorer: ${err}`;
    }
  }

  // Save instance changes
  async function saveChanges() {
    if (!instance) return;
    if (!editName.trim()) {
      errorMessage = "Instance name cannot be empty";
      return;
    }

    saving = true;
    errorMessage = "";

    try {
      const updatedInstance: Instance = {
        ...instance,
        name: editName.trim(),
        notes: editNotes.trim() || undefined,
        memory_override: {
          min: editMemoryMin,
          max: editMemoryMax,
        },
        jvm_args_override: editJavaArgs.trim() || undefined,
      };

      await instancesState.updateInstance(updatedInstance);
      onClose();
    } catch (err) {
      errorMessage = `Failed to save instance: ${err}`;
    } finally {
      saving = false;
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString();
  }
</script>

{#if isOpen && instance}
  <div
    class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-zinc-700">
        <div>
          <h2 class="text-xl font-bold text-white">Edit Instance</h2>
          <p class="text-sm text-zinc-400 mt-1">{instance.name}</p>
        </div>
        <button
          onclick={onClose}
          disabled={saving}
          class="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Tab Navigation -->
      <div class="flex gap-1 px-6 pt-4 border-b border-zinc-700">
        {#each [
          { id: "info", label: "Info" },
          { id: "version", label: "Version" },
          { id: "files", label: "Files" },
          { id: "settings", label: "Settings" },
        ] as tab}
          <button
            onclick={() => (activeTab = tab.id as any)}
            class="px-4 py-2 text-sm font-medium transition-colors rounded-t-lg {activeTab === tab.id
              ? 'bg-indigo-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'}"
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto p-6">
        {#if activeTab === "info"}
          <!-- Info Tab -->
          <div class="space-y-4">
            <div>
              <label for="instance-name" class="block text-sm font-medium text-white/90 mb-2">
                Instance Name
              </label>
              <input
                id="instance-name"
                type="text"
                bind:value={editName}
                class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={saving}
              />
            </div>

            <div>
              <label for="instance-notes" class="block text-sm font-medium text-white/90 mb-2">
                Notes
              </label>
              <textarea
                id="instance-notes"
                bind:value={editNotes}
                rows="4"
                placeholder="Add notes about this instance..."
                class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                disabled={saving}
              ></textarea>
            </div>

            <div class="grid grid-cols-2 gap-4 text-sm">
              <div class="p-3 bg-zinc-800 rounded-lg">
                <p class="text-zinc-400">Created</p>
                <p class="text-white font-medium">{formatDate(instance.created_at)}</p>
              </div>
              <div class="p-3 bg-zinc-800 rounded-lg">
                <p class="text-zinc-400">Last Played</p>
                <p class="text-white font-medium">
                  {instance.last_played ? formatDate(instance.last_played) : "Never"}
                </p>
              </div>
              <div class="p-3 bg-zinc-800 rounded-lg">
                <p class="text-zinc-400">Game Directory</p>
                <p class="text-white font-medium text-xs truncate" title={instance.game_dir}>
                  {instance.game_dir.split("/").pop()}
                </p>
              </div>
              <div class="p-3 bg-zinc-800 rounded-lg">
                <p class="text-zinc-400">Current Version</p>
                <p class="text-white font-medium">{instance.version_id || "None"}</p>
              </div>
            </div>
          </div>
        {:else if activeTab === "version"}
          <!-- Version Tab -->
          <div class="space-y-4">
            {#if instance.version_id}
              <div class="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                <p class="text-sm text-indigo-400">
                  Currently playing: <span class="font-medium">{instance.version_id}</span>
                  {#if instance.mod_loader}
                    with <span class="capitalize">{instance.mod_loader}</span>
                    {instance.mod_loader_version && `${instance.mod_loader_version}`}
                  {/if}
                </p>
              </div>
            {/if}

            <div>
              <h3 class="text-sm font-medium text-white/90 mb-4">Change Version or Mod Loader</h3>
              <ModLoaderSelector
                selectedGameVersion={instance.version_id || ""}
                onInstall={(versionId) => {
                  // Version installed, update instance version_id
                  instance.version_id = versionId;
                  saveChanges();
                }}
              />
            </div>
          </div>
        {:else if activeTab === "files"}
          <!-- Files Tab -->
          <div class="space-y-4">
            <div class="flex gap-2 flex-wrap">
              {#each ["mods", "resourcepacks", "shaderpacks", "saves", "screenshots"] as folder}
                <button
                  onclick={() => changeFolder(folder as any)}
                  class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors {selectedFileFolder ===
                  folder
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-white"}"
                >
                  {folder}
                </button>
              {/each}
            </div>

            {#if loadingFiles}
              <div class="flex items-center gap-2 text-zinc-400 py-8 justify-center">
                <Loader2 size={16} class="animate-spin" />
                Loading files...
              </div>
            {:else if fileList.length === 0}
              <div class="text-center py-8 text-zinc-500">
                No files in this folder
              </div>
            {:else}
              <div class="space-y-2">
                {#each fileList as file}
                  <div
                    class="flex items-center justify-between p-3 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
                  >
                    <div class="flex-1 min-w-0">
                      <p class="font-medium text-white truncate">{file.name}</p>
                      <p class="text-xs text-zinc-400">
                        {file.is_directory ? "Folder" : formatFileSize(file.size)}
                        • {formatDate(file.modified)}
                      </p>
                    </div>
                    <div class="flex gap-2 ml-4">
                      <button
                        onclick={() => openInExplorer(file.path)}
                        title="Open in explorer"
                        class="p-2 rounded-lg hover:bg-zinc-600 text-zinc-400 hover:text-white transition-colors"
                      >
                        <FolderOpen size={16} />
                      </button>
                      <button
                        onclick={() => deleteFile(file.path)}
                        disabled={deletingPath === file.path}
                        title="Delete"
                        class="p-2 rounded-lg hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        {#if deletingPath === file.path}
                          <Loader2 size={16} class="animate-spin" />
                        {:else}
                          <Trash2 size={16} />
                        {/if}
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else if activeTab === "settings"}
          <!-- Settings Tab -->
          <div class="space-y-4">
            <div>
              <label for="min-memory" class="block text-sm font-medium text-white/90 mb-2">
                Minimum Memory (MB)
              </label>
              <input
                id="min-memory"
                type="number"
                bind:value={editMemoryMin}
                min="256"
                max={editMemoryMax}
                class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={saving}
              />
              <p class="text-xs text-zinc-400 mt-1">
                Default: {settingsState.settings.min_memory}MB
              </p>
            </div>

            <div>
              <label for="max-memory" class="block text-sm font-medium text-white/90 mb-2">
                Maximum Memory (MB)
              </label>
              <input
                id="max-memory"
                type="number"
                bind:value={editMemoryMax}
                min={editMemoryMin}
                max="16384"
                class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={saving}
              />
              <p class="text-xs text-zinc-400 mt-1">
                Default: {settingsState.settings.max_memory}MB
              </p>
            </div>

            <div>
              <label for="java-args" class="block text-sm font-medium text-white/90 mb-2">
                JVM Arguments (Advanced)
              </label>
              <textarea
                id="java-args"
                bind:value={editJavaArgs}
                rows="4"
                placeholder="-XX:+UnlockExperimentalVMOptions -XX:G1NewCollectionPercentage=20..."
                class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm resize-none"
                disabled={saving}
              ></textarea>
              <p class="text-xs text-zinc-400 mt-1">
                Leave empty to use global Java arguments
              </p>
            </div>
          </div>
        {/if}

        {#if errorMessage}
          <div class="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {errorMessage}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-3 p-6 border-t border-zinc-700">
        <button
          onclick={onClose}
          disabled={saving}
          class="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onclick={saveChanges}
          disabled={saving || !editName.trim()}
          class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {#if saving}
            <Loader2 size={16} class="animate-spin" />
            Saving...
          {:else}
            <Save size={16} />
            Save Changes
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

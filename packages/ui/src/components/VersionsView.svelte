<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { gameState } from "../stores/game.svelte";
  import { instancesState } from "../stores/instances.svelte";
  import ModLoaderSelector from "./ModLoaderSelector.svelte";

  let searchQuery = $state("");
  let normalizedQuery = $derived(
    searchQuery.trim().toLowerCase().replace(/。/g, ".")
  );

  // Filter by version type
  let typeFilter = $state<"all" | "release" | "snapshot" | "installed">("all");

  // Installed modded versions with Java version info (Fabric + Forge)
  let installedFabricVersions = $state<Array<{ id: string; javaVersion?: number }>>([]);
  let isLoadingModded = $state(false);

  // Load installed modded versions with Java version info (both Fabric and Forge)
  async function loadInstalledModdedVersions() {
    if (!instancesState.activeInstanceId) {
      installedFabricVersions = [];
      isLoadingModded = false;
      return;
    }
    isLoadingModded = true;
    try {
      // Get all installed versions and filter for modded ones (Fabric and Forge)
      const allInstalled = await invoke<Array<{ id: string; type: string }>>(
        "list_installed_versions",
        { instanceId: instancesState.activeInstanceId }
      );
      
      // Filter for Fabric and Forge versions
      const moddedIds = allInstalled
        .filter(v => v.type === "fabric" || v.type === "forge")
        .map(v => v.id);
      
      // Load Java version for each installed modded version
      const versionsWithJava = await Promise.all(
        moddedIds.map(async (id) => {
          try {
            const javaVersion = await invoke<number | null>(
              "get_version_java_version",
              {
                instanceId: instancesState.activeInstanceId!,
                versionId: id,
              }
            );
            return {
              id,
              javaVersion: javaVersion ?? undefined,
            };
          } catch (e) {
            console.error(`Failed to get Java version for ${id}:`, e);
            return { id, javaVersion: undefined };
          }
        })
      );
      
      installedFabricVersions = versionsWithJava;
    } catch (e) {
      console.error("Failed to load installed modded versions:", e);
    } finally {
      isLoadingModded = false;
    }
  }

  let versionDeletedUnlisten: UnlistenFn | null = null;
  let downloadCompleteUnlisten: UnlistenFn | null = null;
  let versionInstalledUnlisten: UnlistenFn | null = null;
  let fabricInstalledUnlisten: UnlistenFn | null = null;
  let forgeInstalledUnlisten: UnlistenFn | null = null;

  // Load on mount and setup event listeners
  $effect(() => {
    loadInstalledModdedVersions();
    setupEventListeners();
    return () => {
      if (versionDeletedUnlisten) {
        versionDeletedUnlisten();
      }
      if (downloadCompleteUnlisten) {
        downloadCompleteUnlisten();
      }
      if (versionInstalledUnlisten) {
        versionInstalledUnlisten();
      }
      if (fabricInstalledUnlisten) {
        fabricInstalledUnlisten();
      }
      if (forgeInstalledUnlisten) {
        forgeInstalledUnlisten();
      }
    };
  });

  async function setupEventListeners() {
    // Refresh versions when a version is deleted
    versionDeletedUnlisten = await listen("version-deleted", async () => {
      await gameState.loadVersions();
      await loadInstalledModdedVersions();
    });
    
    // Refresh versions when a download completes (version installed)
    downloadCompleteUnlisten = await listen("download-complete", async () => {
      await gameState.loadVersions();
      await loadInstalledModdedVersions();
    });
    
    // Refresh when a version is installed
    versionInstalledUnlisten = await listen("version-installed", async () => {
      await gameState.loadVersions();
      await loadInstalledModdedVersions();
    });
    
    // Refresh when Fabric is installed
    fabricInstalledUnlisten = await listen("fabric-installed", async () => {
      await gameState.loadVersions();
      await loadInstalledModdedVersions();
    });
    
    // Refresh when Forge is installed
    forgeInstalledUnlisten = await listen("forge-installed", async () => {
      await gameState.loadVersions();
      await loadInstalledModdedVersions();
    });
  }

  // Combined versions list (vanilla + modded)
  let allVersions = $derived(() => {
    const moddedVersions = installedFabricVersions.map((v) => {
      // Determine type based on version ID
      const versionType = v.id.startsWith("fabric-loader-") ? "fabric" : 
                         v.id.includes("-forge-") ? "forge" : "fabric";
      return {
        id: v.id,
        type: versionType,
        url: "",
        time: "",
        releaseTime: new Date().toISOString(),
        javaVersion: v.javaVersion,
        isInstalled: true, // Modded versions in the list are always installed
      };
    });
    return [...moddedVersions, ...gameState.versions];
  });

  let filteredVersions = $derived(() => {
    let versions = allVersions();

    // Apply type filter
    if (typeFilter === "release") {
      versions = versions.filter((v) => v.type === "release");
    } else if (typeFilter === "snapshot") {
      versions = versions.filter((v) => v.type === "snapshot");
    } else if (typeFilter === "installed") {
      versions = versions.filter((v) => v.isInstalled === true);
    }

    // Apply search filter
    if (normalizedQuery.length > 0) {
      versions = versions.filter((v) =>
        v.id.toLowerCase().includes(normalizedQuery)
      );
    }

    return versions;
  });

  function getVersionBadge(type: string) {
    switch (type) {
      case "release":
        return { text: "Release", class: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30" };
      case "snapshot":
        return { text: "Snapshot", class: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30" };
      case "fabric":
        return { text: "Fabric", class: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30" };
      case "forge":
        return { text: "Forge", class: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30" };
      case "modpack":
        return { text: "Modpack", class: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30" };
      default:
        return { text: type, class: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/20 dark:text-zinc-300 dark:border-zinc-500/30" };
    }
  }

  function handleModLoaderInstall(versionId: string) {
    // Refresh the installed versions list
    loadInstalledModdedVersions();
    // Refresh vanilla versions to update isInstalled status
    gameState.loadVersions();
    // Select the newly installed version
    gameState.selectedVersion = versionId;
  }

  // Delete confirmation dialog state
  let showDeleteDialog = $state(false);
  let versionToDelete = $state<string | null>(null);

  // Show delete confirmation dialog
  function showDeleteConfirmation(versionId: string, event: MouseEvent) {
    event.stopPropagation(); // Prevent version selection
    versionToDelete = versionId;
    showDeleteDialog = true;
  }

  // Cancel delete
  function cancelDelete() {
    showDeleteDialog = false;
    versionToDelete = null;
  }

  // Confirm and delete version
  async function confirmDelete() {
    if (!versionToDelete) return;

    try {
      await invoke("delete_version", { 
        instanceId: instancesState.activeInstanceId,
        versionId: versionToDelete 
      });
      // Clear selection if deleted version was selected
      if (gameState.selectedVersion === versionToDelete) {
        gameState.selectedVersion = "";
      }
      // Close dialog
      showDeleteDialog = false;
      versionToDelete = null;
      // Versions will be refreshed automatically via event listener
    } catch (e) {
      console.error("Failed to delete version:", e);
      alert(`Failed to delete version: ${e}`);
      // Keep dialog open on error so user can retry
    }
  }

  // Version metadata for the selected version
  interface VersionMetadata {
    id: string;
    javaVersion?: number;
    isInstalled: boolean;
  }

  let selectedVersionMetadata = $state<VersionMetadata | null>(null);
  let isLoadingMetadata = $state(false);

  // Load metadata when version is selected
  async function loadVersionMetadata(versionId: string) {
    if (!versionId) {
      selectedVersionMetadata = null;
      return;
    }

    isLoadingMetadata = true;
    try {
      const metadata = await invoke<VersionMetadata>("get_version_metadata", {
        instanceId: instancesState.activeInstanceId,
        versionId,
      });
      selectedVersionMetadata = metadata;
    } catch (e) {
      console.error("Failed to load version metadata:", e);
      selectedVersionMetadata = null;
    } finally {
      isLoadingMetadata = false;
    }
  }

  // Watch for selected version changes
  $effect(() => {
    if (gameState.selectedVersion) {
      loadVersionMetadata(gameState.selectedVersion);
    } else {
      selectedVersionMetadata = null;
    }
  });

  // Get the base Minecraft version from selected version (for mod loader selector)
  let selectedBaseVersion = $derived(() => {
    const selected = gameState.selectedVersion;
    if (!selected) return "";

    // If it's a modded version, extract the base version
    if (selected.startsWith("fabric-loader-")) {
      // Format: fabric-loader-X.X.X-1.20.4
      const parts = selected.split("-");
      return parts[parts.length - 1];
    }
    if (selected.includes("-forge-")) {
      // Format: 1.20.4-forge-49.0.38
      return selected.split("-forge-")[0];
    }

    // Check if it's a valid vanilla version
    const version = gameState.versions.find((v) => v.id === selected);
    return version ? selected : "";
  });
</script>

<div class="h-full flex flex-col p-6 overflow-hidden">
  <div class="flex items-center justify-between mb-6">
     <h2 class="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-white/60">Version Manager</h2>
     <div class="text-sm dark:text-white/40 text-black/50">Select a version to play or modify</div>
  </div>

  <div class="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
    <!-- Left: Version List -->
    <div class="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
      <!-- Search and Filters (Glass Bar) -->
      <div class="flex gap-3">
        <div class="relative flex-1">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 dark:text-white/30 text-black/30">🔍</span>
            <input
              type="text"
              placeholder="Search versions..."
              class="w-full pl-9 pr-4 py-3 bg-white/60 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl dark:text-white text-gray-900 placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:border-indigo-500/50 dark:focus:bg-black/40 focus:bg-white/80 transition-all backdrop-blur-sm"
              bind:value={searchQuery}
            />
        </div>
      </div>

      <!-- Type Filter Tabs (Glass Caps) -->
      <div class="flex p-1 bg-white/60 dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5">
        {#each ['all', 'release', 'snapshot', 'installed'] as filter}
            <button
            class="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 capitalize
            {typeFilter === filter
                ? 'bg-white shadow-sm border border-black/5 dark:bg-white/10 dark:text-white dark:shadow-lg dark:border-white/10 text-black'
                : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'}"
            onclick={() => (typeFilter = filter as any)}
            >
            {filter}
            </button>
        {/each}
      </div>

      <!-- Version List SCROLL -->
      <div class="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
        {#if gameState.versions.length === 0}
          <div class="flex items-center justify-center h-40 dark:text-white/30 text-black/30 italic animate-pulse">
             Fetching manifest...
          </div>
        {:else if filteredVersions().length === 0}
          <div class="flex flex-col items-center justify-center h-40 dark:text-white/30 text-black/30 gap-2">
             <span class="text-2xl">👻</span>
             <span>No matching versions found</span>
          </div>
        {:else}
          {#each filteredVersions() as version}
            {@const badge = getVersionBadge(version.type)}
            {@const isSelected = gameState.selectedVersion === version.id}
            <button
              class="w-full group flex items-center justify-between p-4 rounded-xl text-left border transition-all duration-200 relative overflow-hidden
              {isSelected
                ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-600/20 dark:border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.2)]'
                : 'bg-white/40 dark:bg-white/5 border-black/5 dark:border-white/5 hover:bg-white/60 dark:hover:bg-white/10 hover:border-black/10 dark:hover:border-white/10 hover:translate-x-1'}"
              onclick={() => (gameState.selectedVersion = version.id)}
            >
              <!-- Selection Glow -->
              {#if isSelected}
                 <div class="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent pointer-events-none"></div>
              {/if}

              <div class="relative z-10 flex items-center gap-4 flex-1">
                <span
                  class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border {badge.class}"
                >
                  {badge.text}
                </span>
                <div class="flex-1">
                  <div class="font-bold font-mono text-lg tracking-tight {isSelected ? 'text-black dark:text-white' : 'text-gray-700 dark:text-zinc-300 group-hover:text-black dark:group-hover:text-white'}">
                    {version.id}
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    {#if version.releaseTime && version.type !== "fabric" && version.type !== "forge"}
                      <div class="text-xs dark:text-white/30 text-black/30">
                        {new Date(version.releaseTime).toLocaleDateString()}
                      </div>
                    {/if}
                    {#if version.javaVersion}
                      <div class="flex items-center gap-1 text-xs dark:text-white/40 text-black/40">
                        <span class="opacity-60">☕</span>
                        <span class="font-medium">Java {version.javaVersion}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
              
              <div class="relative z-10 flex items-center gap-2">
                {#if version.isInstalled === true}
                  <button
                    onclick={(e) => showDeleteConfirmation(version.id, e)}
                    class="p-2 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete version"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18"></path>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                  </button>
                {/if}
                {#if isSelected}
                  <div class="text-indigo-500 dark:text-indigo-400">
                     <span class="text-lg">Selected</span>
                  </div>
                {/if}
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Right: Mod Loader Panel -->
    <div class="flex flex-col gap-4">
      <!-- Selected Version Info Card -->
      <div class="bg-gradient-to-br from-white/40 to-white/20 dark:from-white/10 dark:to-white/5 p-6 rounded-2xl border border-black/5 dark:border-white/10 backdrop-blur-md relative overflow-hidden group">
          <div class="absolute top-0 right-0 p-8 bg-indigo-500/20 blur-[60px] rounded-full group-hover:bg-indigo-500/30 transition-colors"></div>
          
          <h3 class="text-xs font-bold uppercase tracking-widest dark:text-white/40 text-black/40 mb-2 relative z-10">Current Selection</h3>
          {#if gameState.selectedVersion}
            <p class="font-mono text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-white/70 relative z-10 truncate mb-4">
                {gameState.selectedVersion}
            </p>

            <!-- Version Metadata -->
            {#if isLoadingMetadata}
              <div class="space-y-3 relative z-10">
                <div class="animate-pulse space-y-2">
                  <div class="h-4 bg-black/10 dark:bg-white/10 rounded w-3/4"></div>
                  <div class="h-4 bg-black/10 dark:bg-white/10 rounded w-1/2"></div>
                </div>
              </div>
            {:else if selectedVersionMetadata}
              <div class="space-y-3 relative z-10">
                <!-- Java Version -->
                {#if selectedVersionMetadata.javaVersion}
                  <div>
                    <div class="text-[10px] font-bold uppercase tracking-wider dark:text-white/40 text-black/40 mb-1">Java Version</div>
                    <div class="flex items-center gap-2">
                      <span class="text-lg opacity-60">☕</span>
                      <span class="text-sm dark:text-white text-black font-medium">
                        Java {selectedVersionMetadata.javaVersion}
                      </span>
                    </div>
                  </div>
                {/if}

                <!-- Installation Status -->
                <div>
                  <div class="text-[10px] font-bold uppercase tracking-wider dark:text-white/40 text-black/40 mb-1">Status</div>
                  <div class="flex items-center gap-2">
                    {#if selectedVersionMetadata.isInstalled === true}
                      <span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/30">
                        Installed
                      </span>
                    {:else if selectedVersionMetadata.isInstalled === false}
                      <span class="px-2 py-0.5 bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 text-[10px] font-bold rounded border border-zinc-500/30">
                        Not Installed
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          {:else}
            <p class="dark:text-white/20 text-black/20 italic relative z-10">None selected</p>
          {/if}
      </div>

      <!-- Mod Loader Selector Card -->
      <div class="bg-white/60 dark:bg-black/20 p-4 rounded-2xl border border-black/5 dark:border-white/5 backdrop-blur-sm flex-1 flex flex-col">
          <ModLoaderSelector
            selectedGameVersion={selectedBaseVersion()}
            onInstall={handleModLoaderInstall}
          />
      </div>

    </div>
  </div>

  <!-- Delete Version Confirmation Dialog -->
  {#if showDeleteDialog && versionToDelete}
    <div class="fixed inset-0 z-[200] bg-black/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl p-6 max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">Delete Version</h3>
        <p class="text-zinc-600 dark:text-zinc-400 text-sm mb-6">
          Are you sure you want to delete version <span class="text-gray-900 dark:text-white font-mono font-medium">{versionToDelete}</span>? This action cannot be undone.
        </p>
        <div class="flex gap-3 justify-end">
          <button
            onclick={cancelDelete}
            class="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onclick={confirmDelete}
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

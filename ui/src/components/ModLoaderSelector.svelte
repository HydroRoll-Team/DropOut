<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import type {
    FabricGameVersion,
    FabricLoaderVersion,
    ForgeVersion,
    ModLoaderType,
  } from "../types";
  import { Loader2, Download, AlertCircle, Check, ChevronDown, CheckCircle } from 'lucide-svelte';
  import { logsState } from "../stores/logs.svelte";
  import { instancesState } from "../stores/instances.svelte";

  interface Props {
    selectedGameVersion: string;
    onInstall: (versionId: string) => void;
  }

  let { selectedGameVersion, onInstall }: Props = $props();

  // State
  let selectedLoader = $state<ModLoaderType>("vanilla");
  let isLoading = $state(false);
  let isInstalling = $state(false);
  let error = $state<string | null>(null);
  let isVersionInstalled = $state(false);

  // Fabric state
  let fabricLoaders = $state<FabricLoaderVersion[]>([]);
  let selectedFabricLoader = $state("");
  let isFabricDropdownOpen = $state(false);

  // Forge state
  let forgeVersions = $state<ForgeVersion[]>([]);
  let selectedForgeVersion = $state("");
  let isForgeDropdownOpen = $state(false);

  let fabricDropdownRef = $state<HTMLDivElement | null>(null);
  let forgeDropdownRef = $state<HTMLDivElement | null>(null);

  // Check if version is installed when game version changes
  $effect(() => {
    if (selectedGameVersion) {
      checkInstallStatus();
    }
  });

  // Load mod loader versions when game version or loader type changes
  $effect(() => {
    if (selectedGameVersion && selectedLoader !== "vanilla") {
      loadModLoaderVersions();
    }
  });

  async function checkInstallStatus() {
    if (!selectedGameVersion || !instancesState.activeInstanceId) {
      isVersionInstalled = false;
      return;
    }
    try {
      isVersionInstalled = await invoke<boolean>("check_version_installed", {
        instanceId: instancesState.activeInstanceId,
        versionId: selectedGameVersion,
      });
    } catch (e) {
      console.error("Failed to check install status:", e);
      isVersionInstalled = false;
    }
  }

  async function loadModLoaderVersions() {
    isLoading = true;
    error = null;

    try {
      if (selectedLoader === "fabric") {
        const loaders = await invoke<any[]>("get_fabric_loaders_for_version", {
          gameVersion: selectedGameVersion,
        });
        fabricLoaders = loaders.map((l) => l.loader);
        if (fabricLoaders.length > 0) {
          const stable = fabricLoaders.find((l) => l.stable);
          selectedFabricLoader = stable?.version || fabricLoaders[0].version;
        }
      } else if (selectedLoader === "forge") {
        forgeVersions = await invoke<ForgeVersion[]>(
          "get_forge_versions_for_game",
          {
            gameVersion: selectedGameVersion,
          }
        );
        if (forgeVersions.length > 0) {
          const recommended = forgeVersions.find((v) => v.recommended);
          const latest = forgeVersions.find((v) => v.latest);
          selectedForgeVersion =
            recommended?.version || latest?.version || forgeVersions[0].version;
        }
      }
    } catch (e) {
      error = `Failed to load ${selectedLoader} versions: ${e}`;
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  async function installVanilla() {
    if (!selectedGameVersion) {
      error = "Please select a Minecraft version first";
      return;
    }

    isInstalling = true;
    error = null;
    logsState.addLog("info", "Installer", `Starting installation of ${selectedGameVersion}...`);

    if (!instancesState.activeInstanceId) {
      error = "Please select an instance first";
      return;
    }
    try {
      await invoke("install_version", {
        instanceId: instancesState.activeInstanceId,
        versionId: selectedGameVersion,
      });
      logsState.addLog("info", "Installer", `Successfully installed ${selectedGameVersion}`);
      isVersionInstalled = true;
      onInstall(selectedGameVersion);
    } catch (e) {
      error = `Failed to install: ${e}`;
      logsState.addLog("error", "Installer", `Installation failed: ${e}`);
      console.error(e);
    } finally {
      isInstalling = false;
    }
  }

  async function installModLoader() {
    if (!selectedGameVersion) {
      error = "Please select a Minecraft version first";
      return;
    }

    if (!instancesState.activeInstanceId) {
      error = "Please select an instance first";
      isInstalling = false;
      return;
    }

    isInstalling = true;
    error = null;

    try {
      // First install the base game if not installed
      if (!isVersionInstalled) {
        logsState.addLog("info", "Installer", `Installing base game ${selectedGameVersion} first...`);
        await invoke("install_version", {
          instanceId: instancesState.activeInstanceId,
          versionId: selectedGameVersion,
        });
        isVersionInstalled = true;
      }

      // Then install the mod loader
      if (selectedLoader === "fabric" && selectedFabricLoader) {
        logsState.addLog("info", "Installer", `Installing Fabric ${selectedFabricLoader} for ${selectedGameVersion}...`);
        const result = await invoke<any>("install_fabric", {
          instanceId: instancesState.activeInstanceId,
          gameVersion: selectedGameVersion,
          loaderVersion: selectedFabricLoader,
        });
        logsState.addLog("info", "Installer", `Fabric installed successfully: ${result.id}`);
        onInstall(result.id);
      } else if (selectedLoader === "forge" && selectedForgeVersion) {
        logsState.addLog("info", "Installer", `Installing Forge ${selectedForgeVersion} for ${selectedGameVersion}...`);
        const result = await invoke<any>("install_forge", {
          instanceId: instancesState.activeInstanceId,
          gameVersion: selectedGameVersion,
          forgeVersion: selectedForgeVersion,
        });
        logsState.addLog("info", "Installer", `Forge installed successfully: ${result.id}`);
        onInstall(result.id);
      }
    } catch (e) {
      error = `Failed to install ${selectedLoader}: ${e}`;
      logsState.addLog("error", "Installer", `Installation failed: ${e}`);
      console.error(e);
    } finally {
      isInstalling = false;
    }
  }

  function onLoaderChange(loader: ModLoaderType) {
    selectedLoader = loader;
    error = null;
    if (loader !== "vanilla" && selectedGameVersion) {
      loadModLoaderVersions();
    }
  }

  function handleFabricClickOutside(e: MouseEvent) {
    if (fabricDropdownRef && !fabricDropdownRef.contains(e.target as Node)) {
      isFabricDropdownOpen = false;
    }
  }

  function handleForgeClickOutside(e: MouseEvent) {
    if (forgeDropdownRef && !forgeDropdownRef.contains(e.target as Node)) {
      isForgeDropdownOpen = false;
    }
  }

  $effect(() => {
    if (isFabricDropdownOpen) {
      document.addEventListener('click', handleFabricClickOutside);
      return () => document.removeEventListener('click', handleFabricClickOutside);
    }
  });

  $effect(() => {
    if (isForgeDropdownOpen) {
      document.addEventListener('click', handleForgeClickOutside);
      return () => document.removeEventListener('click', handleForgeClickOutside);
    }
  });

  let selectedFabricLabel = $derived(
    fabricLoaders.find(l => l.version === selectedFabricLoader)
      ? `${selectedFabricLoader}${fabricLoaders.find(l => l.version === selectedFabricLoader)?.stable ? ' (stable)' : ''}`
      : selectedFabricLoader || 'Select version'
  );

  let selectedForgeLabel = $derived(
    forgeVersions.find(v => v.version === selectedForgeVersion)
      ? `${selectedForgeVersion}${forgeVersions.find(v => v.version === selectedForgeVersion)?.recommended ? ' (Recommended)' : ''}`
      : selectedForgeVersion || 'Select version'
  );
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
      <h3 class="text-xs font-bold uppercase tracking-widest text-zinc-500">Loader Type</h3>
  </div>

  <!-- Loader Type Tabs - Simple Clean Style -->
  <div class="flex p-1 bg-zinc-100 dark:bg-zinc-900/50 rounded-sm border border-zinc-200 dark:border-white/5">
    {#each ['vanilla', 'fabric', 'forge'] as loader}
        <button
        class="flex-1 px-3 py-2 rounded-sm text-sm font-medium transition-all duration-200 capitalize
        {selectedLoader === loader
            ? 'bg-white dark:bg-white/10 text-black dark:text-white shadow-sm'
            : 'text-zinc-500 dark:text-zinc-500 hover:text-black dark:hover:text-white'}"
        onclick={() => onLoaderChange(loader as ModLoaderType)}
        disabled={isInstalling}
        >
        {loader}
        </button>
    {/each}
  </div>

  <!-- Content Area -->
  <div class="min-h-[100px] flex flex-col justify-center">
    {#if !selectedGameVersion}
        <div class="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-200 rounded-sm text-sm">
           <AlertCircle size={16} />
           <span>Please select a Minecraft version first.</span>
        </div>
        
    {:else if selectedLoader === "vanilla"}
        <div class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div class="text-center p-4 border border-dashed border-zinc-200 dark:border-white/10 rounded-sm text-zinc-500 text-sm">
               Standard Minecraft experience. No modifications.
            </div>
            
            {#if isVersionInstalled}
                <div class="flex items-center justify-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-sm text-sm">
                    <CheckCircle size={16} />
                    <span>Version {selectedGameVersion} is installed</span>
                </div>
            {:else}
                <button
                    class="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-sm font-bold text-sm transition-all flex items-center justify-center gap-2"
                    onclick={installVanilla}
                    disabled={isInstalling}
                >
                    {#if isInstalling}
                        <Loader2 class="animate-spin" size={16} />
                        Installing...
                    {:else}
                        <Download size={16} />
                        Install {selectedGameVersion}
                    {/if}
                </button>
            {/if}
        </div>
        
    {:else if isLoading}
        <div class="flex flex-col items-center gap-3 text-sm text-zinc-500 py-6">
            <Loader2 class="animate-spin" size={20} />
            <span>Fetching {selectedLoader} manifest...</span>
        </div>
        
    {:else if error}
        <div class="p-4 bg-red-50 border border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300 rounded-sm text-sm break-words">
            {error}
        </div>
        
    {:else if selectedLoader === "fabric"}
        <div class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {#if fabricLoaders.length === 0}
            <div class="text-center p-4 text-sm text-zinc-500 italic">
            No Fabric versions available for {selectedGameVersion}
            </div>
        {:else}
            <div>
            <label for="fabric-loader-select" class="block text-[10px] uppercase font-bold text-zinc-500 mb-2"
            >Loader Version</label
            >
            <!-- Custom Fabric Dropdown -->
            <div class="relative" bind:this={fabricDropdownRef}>
                <button
                    type="button"
                    onclick={() => isFabricDropdownOpen = !isFabricDropdownOpen}
                    disabled={isInstalling}
                    class="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left
                           bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md 
                           text-sm text-gray-900 dark:text-white
                           hover:border-zinc-400 dark:hover:border-zinc-600 
                           focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                           transition-colors cursor-pointer outline-none disabled:opacity-50"
                >
                    <span class="truncate">{selectedFabricLabel}</span>
                    <ChevronDown 
                        size={14} 
                        class="shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 {isFabricDropdownOpen ? 'rotate-180' : ''}" 
                    />
                </button>

                {#if isFabricDropdownOpen}
                    <div 
                        class="absolute z-50 w-full mt-1 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md shadow-xl
                               max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150"
                    >
                        {#each fabricLoaders as loader}
                            <button
                                type="button"
                                onclick={() => { selectedFabricLoader = loader.version; isFabricDropdownOpen = false; }}
                                class="w-full flex items-center justify-between px-3 py-2 text-sm text-left
                                       transition-colors outline-none cursor-pointer
                                       {loader.version === selectedFabricLoader 
                                         ? 'bg-indigo-600 text-white' 
                                         : 'text-gray-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
                            >
                                <span class="truncate">{loader.version} {loader.stable ? "(stable)" : ""}</span>
                                {#if loader.version === selectedFabricLoader}
                                    <Check size={14} class="shrink-0 ml-2" />
                                {/if}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
            </div>
            
            <button
                class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-sm font-bold text-sm transition-all flex items-center justify-center gap-2"
                onclick={installModLoader}
                disabled={isInstalling || !selectedFabricLoader}
            >
                {#if isInstalling}
                    <Loader2 class="animate-spin" size={16} />
                    Installing...
                {:else}
                    <Download size={16} />
                    Install Fabric {selectedFabricLoader}
                {/if}
            </button>
        {/if}
        </div>
        
    {:else if selectedLoader === "forge"}
        <div class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {#if forgeVersions.length === 0}
            <div class="text-center p-4 text-sm text-zinc-500 italic">
            No Forge versions available for {selectedGameVersion}
            </div>
        {:else}
            <div>
            <label for="forge-version-select" class="block text-[10px] uppercase font-bold text-zinc-500 mb-2"
                >Forge Version</label
            >
            <!-- Custom Forge Dropdown -->
            <div class="relative" bind:this={forgeDropdownRef}>
                <button
                    type="button"
                    onclick={() => isForgeDropdownOpen = !isForgeDropdownOpen}
                    disabled={isInstalling}
                    class="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left
                           bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md 
                           text-sm text-gray-900 dark:text-white
                           hover:border-zinc-400 dark:hover:border-zinc-600 
                           focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                           transition-colors cursor-pointer outline-none disabled:opacity-50"
                >
                    <span class="truncate">{selectedForgeLabel}</span>
                    <ChevronDown 
                        size={14} 
                        class="shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 {isForgeDropdownOpen ? 'rotate-180' : ''}" 
                    />
                </button>

                {#if isForgeDropdownOpen}
                    <div 
                        class="absolute z-50 w-full mt-1 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md shadow-xl
                               max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150"
                    >
                        {#each forgeVersions as version}
                            <button
                                type="button"
                                onclick={() => { selectedForgeVersion = version.version; isForgeDropdownOpen = false; }}
                                class="w-full flex items-center justify-between px-3 py-2 text-sm text-left
                                       transition-colors outline-none cursor-pointer
                                       {version.version === selectedForgeVersion 
                                         ? 'bg-indigo-600 text-white' 
                                         : 'text-gray-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
                            >
                                <span class="truncate">{version.version} {version.recommended ? "(Recommended)" : ""}</span>
                                {#if version.version === selectedForgeVersion}
                                    <Check size={14} class="shrink-0 ml-2" />
                                {/if}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
            </div>
            
            <button
                class="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-sm font-bold text-sm transition-all flex items-center justify-center gap-2"
                onclick={installModLoader}
                disabled={isInstalling || !selectedForgeVersion}
            >
                {#if isInstalling}
                    <Loader2 class="animate-spin" size={16} />
                    Installing...
                {:else}
                    <Download size={16} />
                    Install Forge {selectedForgeVersion}
                {/if}
            </button>
        {/if}
        </div>
    {/if}
  </div>
</div>

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import type {
    FabricGameVersion,
    FabricLoaderVersion,
    ForgeVersion,
    ModLoaderType,
  } from "../types";
  import { Loader2, Download, AlertCircle, Check } from 'lucide-svelte';

  interface Props {
    selectedGameVersion: string;
    onInstall: (versionId: string) => void;
  }

  let { selectedGameVersion, onInstall }: Props = $props();

  // State
  let selectedLoader = $state<ModLoaderType>("vanilla");
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Fabric state
  let fabricLoaders = $state<FabricLoaderVersion[]>([]);
  let selectedFabricLoader = $state("");

  // Forge state
  let forgeVersions = $state<ForgeVersion[]>([]);
  let selectedForgeVersion = $state("");

  // Load mod loader versions when game version changes
  $effect(() => {
    if (selectedGameVersion && selectedLoader !== "vanilla") {
      loadModLoaderVersions();
    }
  });

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
          // Select first stable version or first available
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
          // Select recommended version first, then latest
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

  async function installModLoader() {
    if (!selectedGameVersion) {
      error = "Please select a Minecraft version first";
      return;
    }

    isLoading = true;
    error = null;

    try {
      if (selectedLoader === "fabric" && selectedFabricLoader) {
        const result = await invoke<any>("install_fabric", {
          gameVersion: selectedGameVersion,
          loaderVersion: selectedFabricLoader,
        });
        onInstall(result.id);
      } else if (selectedLoader === "forge" && selectedForgeVersion) {
        const result = await invoke<any>("install_forge", {
          gameVersion: selectedGameVersion,
          forgeVersion: selectedForgeVersion,
        });
        onInstall(result.id);
      }
    } catch (e) {
      error = `Failed to install ${selectedLoader}: ${e}`;
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  function onLoaderChange(loader: ModLoaderType) {
    selectedLoader = loader;
    error = null;
    if (loader !== "vanilla" && selectedGameVersion) {
      loadModLoaderVersions();
    }
  }
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
        >
        {loader}
        </button>
    {/each}
  </div>

  <!-- Content Area -->
  <div class="min-h-[100px] flex flex-col justify-center">
    {#if selectedLoader === "vanilla"}
        <div class="text-center p-6 border border-dashed border-zinc-200 dark:border-white/10 rounded-sm text-zinc-500 text-sm">
           Standard Minecraft experience. No modifications.
        </div>
        
    {:else if !selectedGameVersion}
        <div class="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-200 rounded-sm text-sm">
           <AlertCircle size={16} />
           <span>Please select a base Minecraft version first.</span>
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
        <div>
            <label for="fabric-loader-select" class="block text-[10px] uppercase font-bold text-zinc-500 mb-2"
            >Loader Version</label
            >
            <div class="relative">
                <select
                id="fabric-loader-select"
                class="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 text-gray-900 dark:text-white transition-colors cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600"
                bind:value={selectedFabricLoader}
                >
                {#each fabricLoaders as loader}
                    <option value={loader.version}>
                    {loader.version} {loader.stable ? "(stable)" : ""}
                    </option>
                {/each}
                </select>
            </div>
        </div>
        
        <button
            class="w-full bg-black dark:bg-white text-white dark:text-black py-2.5 px-4 rounded-sm font-bold text-sm transition-all hover:opacity-90 flex items-center justify-center gap-2"
            onclick={installModLoader}
            disabled={isLoading || !selectedFabricLoader}
        >
            <Download size={16} />
            Install Fabric
        </button>
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
            <div class="relative">
                <select
                    id="forge-version-select"
                    class="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 text-gray-900 dark:text-white transition-colors cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600"
                    bind:value={selectedForgeVersion}
                >
                    {#each forgeVersions as version}
                    <option value={version.version}>
                        {version.version}
                        {version.recommended ? " (Recommended)" : ""}
                    </option>
                    {/each}
                </select>
            </div>
            </div>
            
            <button
            class="w-full bg-black dark:bg-white text-white dark:text-black py-2.5 px-4 rounded-sm font-bold text-sm transition-all hover:opacity-90 flex items-center justify-center gap-2"
            onclick={installModLoader}
            disabled={isLoading || !selectedForgeVersion}
            >
            <Download size={16} />
            Install Forge
            </button>
        {/if}
        </div>
    {/if}
  </div>
</div>

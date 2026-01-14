<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import type {
    FabricGameVersion,
    FabricLoaderVersion,
    ForgeVersion,
    ModLoaderType,
  } from "../types";

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

<div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
  <h3 class="text-sm font-semibold text-zinc-400 mb-3">Mod Loader</h3>

  <!-- Loader Type Tabs -->
  <div class="flex gap-1 mb-4 bg-zinc-900 rounded-lg p-1">
    <button
      class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors {selectedLoader ===
      'vanilla'
        ? 'bg-zinc-700 text-white'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}"
      onclick={() => onLoaderChange("vanilla")}
    >
      Vanilla
    </button>
    <button
      class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors {selectedLoader ===
      'fabric'
        ? 'bg-blue-600 text-white'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}"
      onclick={() => onLoaderChange("fabric")}
    >
      Fabric
    </button>
    <button
      class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors {selectedLoader ===
      'forge'
        ? 'bg-orange-600 text-white'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}"
      onclick={() => onLoaderChange("forge")}
    >
      Forge
    </button>
  </div>

  {#if selectedLoader === "vanilla"}
    <p class="text-sm text-zinc-500">
      Launch the selected Minecraft version without any mod loaders.
    </p>
  {:else if !selectedGameVersion}
    <p class="text-sm text-zinc-500">
      Select a Minecraft version first to see available {selectedLoader} versions.
    </p>
  {:else if isLoading}
    <div class="flex items-center gap-2 text-sm text-zinc-400">
      <svg
        class="animate-spin h-4 w-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      Loading {selectedLoader} versions...
    </div>
  {:else if error}
    <p class="text-sm text-red-400">{error}</p>
  {:else if selectedLoader === "fabric"}
    <div class="space-y-3">
      <div>
        <label for="fabric-loader-select" class="block text-xs text-zinc-500 mb-1"
          >Loader Version</label
        >
        <select
          id="fabric-loader-select"
          class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          bind:value={selectedFabricLoader}
        >
          {#each fabricLoaders as loader}
            <option value={loader.version}>
              {loader.version}
              {loader.stable ? "(stable)" : ""}
            </option>
          {/each}
        </select>
      </div>
      <button
        class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onclick={installModLoader}
        disabled={isLoading || !selectedFabricLoader}
      >
        Install Fabric {selectedFabricLoader}
      </button>
    </div>
  {:else if selectedLoader === "forge"}
    <div class="space-y-3">
      {#if forgeVersions.length === 0}
        <p class="text-sm text-zinc-500">
          No Forge versions available for Minecraft {selectedGameVersion}
        </p>
      {:else}
        <div>
          <label for="forge-version-select" class="block text-xs text-zinc-500 mb-1"
            >Forge Version</label
          >
          <select
            id="forge-version-select"
            class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            bind:value={selectedForgeVersion}
          >
            {#each forgeVersions as version}
              <option value={version.version}>
                {version.version}
                {version.recommended ? "⭐ recommended" : ""}
                {version.latest ? "(latest)" : ""}
              </option>
            {/each}
          </select>
        </div>
        <button
          class="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={installModLoader}
          disabled={isLoading || !selectedForgeVersion}
        >
          Install Forge {selectedForgeVersion}
        </button>
      {/if}
    </div>
  {/if}
</div>

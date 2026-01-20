<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { X, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-svelte";
  import { instancesState } from "../stores/instances.svelte";
  import { gameState } from "../stores/game.svelte";
  import type { Version, Instance, FabricLoaderEntry, ForgeVersion } from "../types";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  // Wizard steps: 1 = Name, 2 = Version, 3 = Mod Loader
  let currentStep = $state(1);
  let instanceName = $state("");
  let selectedVersion = $state<Version | null>(null);
  let modLoaderType = $state<"vanilla" | "fabric" | "forge">("vanilla");
  let selectedFabricLoader = $state("");
  let selectedForgeLoader = $state("");
  let creating = $state(false);
  let errorMessage = $state("");

  // Mod loader lists
  let fabricLoaders = $state<FabricLoaderEntry[]>([]);
  let forgeVersions = $state<ForgeVersion[]>([]);
  let loadingLoaders = $state(false);

  // Version list filtering
  let versionSearch = $state("");
  let versionFilter = $state<"all" | "release" | "snapshot">("release");

  // Filtered versions
  let filteredVersions = $derived(() => {
    let versions = gameState.versions || [];
    
    // Filter by type
    if (versionFilter !== "all") {
      versions = versions.filter((v) => v.type === versionFilter);
    }

    // Search filter
    if (versionSearch) {
      versions = versions.filter((v) =>
        v.id.toLowerCase().includes(versionSearch.toLowerCase())
      );
    }

    return versions;
  });

  // Fetch mod loaders when entering step 3
  async function loadModLoaders() {
    if (!selectedVersion) return;
    
    loadingLoaders = true;
    try {
      if (modLoaderType === "fabric") {
        const loaders = await invoke<FabricLoaderEntry[]>("get_fabric_loaders_for_version", {
          gameVersion: selectedVersion.id,
        });
        fabricLoaders = loaders;
        if (loaders.length > 0) {
          selectedFabricLoader = loaders[0].loader.version;
        }
      } else if (modLoaderType === "forge") {
        const versions = await invoke<ForgeVersion[]>("get_forge_versions_for_game", {
          gameVersion: selectedVersion.id,
        });
        forgeVersions = versions;
        if (versions.length > 0) {
          selectedForgeLoader = versions[0].version;
        }
      }
    } catch (err) {
      errorMessage = `Failed to load ${modLoaderType} versions: ${err}`;
    } finally {
      loadingLoaders = false;
    }
  }

  // Watch for mod loader type changes and load loaders
  $effect(() => {
    if (currentStep === 3 && modLoaderType !== "vanilla") {
      loadModLoaders();
    }
  });

  // Reset modal state
  function resetModal() {
    currentStep = 1;
    instanceName = "";
    selectedVersion = null;
    modLoaderType = "vanilla";
    selectedFabricLoader = "";
    selectedForgeLoader = "";
    creating = false;
    errorMessage = "";
    versionSearch = "";
    versionFilter = "release";
  }

  function handleClose() {
    if (!creating) {
      resetModal();
      onClose();
    }
  }

  function goToStep(step: number) {
    errorMessage = "";
    currentStep = step;
  }

  function validateStep1() {
    if (!instanceName.trim()) {
      errorMessage = "Please enter an instance name";
      return false;
    }
    return true;
  }

  function validateStep2() {
    if (!selectedVersion) {
      errorMessage = "Please select a Minecraft version";
      return false;
    }
    return true;
  }

  async function handleNext() {
    errorMessage = "";
    
    if (currentStep === 1) {
      if (validateStep1()) {
        goToStep(2);
      }
    } else if (currentStep === 2) {
      if (validateStep2()) {
        goToStep(3);
      }
    }
  }

  async function handleCreate() {
    if (!validateStep1() || !validateStep2()) return;

    creating = true;
    errorMessage = "";

    try {
      // Step 1: Create instance
      const instance: Instance = await invoke("create_instance", {
        name: instanceName.trim(),
      });

      // Step 2: Install vanilla version
      await invoke("install_version", {
        instanceId: instance.id,
        versionId: selectedVersion!.id,
      });

      // Step 3: Install mod loader if selected
      if (modLoaderType === "fabric" && selectedFabricLoader) {
        await invoke("install_fabric", {
          instanceId: instance.id,
          gameVersion: selectedVersion!.id,
          loaderVersion: selectedFabricLoader,
        });
      } else if (modLoaderType === "forge" && selectedForgeLoader) {
        await invoke("install_forge", {
          instanceId: instance.id,
          gameVersion: selectedVersion!.id,
          forgeVersion: selectedForgeLoader,
        });
      } else {
        // Update instance with vanilla version_id
        await invoke("update_instance", {
          instance: { ...instance, version_id: selectedVersion!.id },
        });
      }

      // Reload instances
      await instancesState.loadInstances();

      // Success! Close modal
      resetModal();
      onClose();
    } catch (error) {
      errorMessage = String(error);
      creating = false;
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between p-6 border-b border-zinc-700"
      >
        <div>
          <h2 class="text-xl font-bold text-white">Create New Instance</h2>
          <p class="text-sm text-zinc-400 mt-1">
            Step {currentStep} of 3
          </p>
        </div>
        <button
          onclick={handleClose}
          disabled={creating}
          class="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Progress indicator -->
      <div class="flex gap-2 px-6 pt-4">
        <div
          class="flex-1 h-1 rounded-full transition-colors {currentStep >= 1
            ? 'bg-indigo-500'
            : 'bg-zinc-700'}"
        ></div>
        <div
          class="flex-1 h-1 rounded-full transition-colors {currentStep >= 2
            ? 'bg-indigo-500'
            : 'bg-zinc-700'}"
        ></div>
        <div
          class="flex-1 h-1 rounded-full transition-colors {currentStep >= 3
            ? 'bg-indigo-500'
            : 'bg-zinc-700'}"
        ></div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        {#if currentStep === 1}
          <!-- Step 1: Name -->
          <div class="space-y-4">
            <div>
              <label
                for="instance-name"
                class="block text-sm font-medium text-white/90 mb-2"
                >Instance Name</label
              >
              <input
                id="instance-name"
                type="text"
                bind:value={instanceName}
                placeholder="My Minecraft Instance"
                class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={creating}
              />
            </div>
            <p class="text-xs text-zinc-400">
              Give your instance a memorable name
            </p>
          </div>
        {:else if currentStep === 2}
          <!-- Step 2: Version Selection -->
          <div class="space-y-4">
            <div class="flex gap-4">
              <div class="flex-1 relative">
                <Search
                  size={16}
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="text"
                  bind:value={versionSearch}
                  placeholder="Search versions..."
                  class="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div class="flex gap-2">
                {#each [
                  { value: "all", label: "All" },
                  { value: "release", label: "Release" },
                  { value: "snapshot", label: "Snapshot" },
                ] as filter}
                  <button
                    onclick={() => {
                      versionFilter = filter.value as "all" | "release" | "snapshot";
                    }}
                    class="px-4 py-2 rounded-lg text-sm font-medium transition-colors {versionFilter ===
                    filter.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'}"
                  >
                    {filter.label}
                  </button>
                {/each}
              </div>
            </div>

            <div class="max-h-96 overflow-y-auto space-y-2">
              {#each filteredVersions() as version}
                <button
                  onclick={() => (selectedVersion = version)}
                  class="w-full p-3 rounded-lg border transition-colors text-left {selectedVersion?.id ===
                  version.id
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'}"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-medium">{version.id}</span>
                    <span
                      class="text-xs px-2 py-1 rounded-full {version.type ===
                      'release'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400'}"
                    >
                      {version.type}
                    </span>
                  </div>
                </button>
              {/each}

              {#if filteredVersions().length === 0}
                <div class="text-center py-8 text-zinc-500">
                  No versions found
                </div>
              {/if}
            </div>
          </div>
        {:else if currentStep === 3}
          <!-- Step 3: Mod Loader -->
          <div class="space-y-4">
            <div>
              <div class="text-sm font-medium text-white/90 mb-3">
                Mod Loader Type
              </div>
              <div class="flex gap-3">
                {#each [
                  { value: "vanilla", label: "Vanilla" },
                  { value: "fabric", label: "Fabric" },
                  { value: "forge", label: "Forge" },
                ] as loader}
                  <button
                    onclick={() => {
                      modLoaderType = loader.value as "vanilla" | "fabric" | "forge";
                    }}
                    class="flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors {modLoaderType ===
                    loader.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'}"
                  >
                    {loader.label}
                  </button>
                {/each}
              </div>
            </div>

            {#if modLoaderType === "fabric"}
              <div>
                <label for="fabric-loader" class="block text-sm font-medium text-white/90 mb-2">
                  Fabric Loader Version
                </label>
                {#if loadingLoaders}
                  <div class="flex items-center gap-2 text-zinc-400">
                    <Loader2 size={16} class="animate-spin" />
                    Loading Fabric versions...
                  </div>
                {:else if fabricLoaders.length > 0}
                  <select
                    id="fabric-loader"
                    bind:value={selectedFabricLoader}
                    class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {#each fabricLoaders as loader}
                      <option value={loader.loader.version}>
                        {loader.loader.version} {loader.loader.stable ? "(Stable)" : "(Beta)"}
                      </option>
                    {/each}
                  </select>
                {:else}
                  <p class="text-sm text-red-400">No Fabric loaders available for this version</p>
                {/if}
              </div>
            {:else if modLoaderType === "forge"}
              <div>
                <label for="forge-version" class="block text-sm font-medium text-white/90 mb-2">
                  Forge Version
                </label>
                {#if loadingLoaders}
                  <div class="flex items-center gap-2 text-zinc-400">
                    <Loader2 size={16} class="animate-spin" />
                    Loading Forge versions...
                  </div>
                {:else if forgeVersions.length > 0}
                  <select
                    id="forge-version"
                    bind:value={selectedForgeLoader}
                    class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {#each forgeVersions as version}
                      <option value={version.version}>
                        {version.version}
                      </option>
                    {/each}
                  </select>
                {:else}
                  <p class="text-sm text-red-400">No Forge versions available for this version</p>
                {/if}
              </div>
            {:else if modLoaderType === "vanilla"}
              <p class="text-sm text-zinc-400">
                Create a vanilla Minecraft instance without any mod loaders
              </p>
            {/if}
          </div>
        {/if}

        {#if errorMessage}
          <div
            class="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
          >
            {errorMessage}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-between gap-3 p-6 border-t border-zinc-700"
      >
        <button
          onclick={() => goToStep(currentStep - 1)}
          disabled={currentStep === 1 || creating}
          class="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <div class="flex gap-3">
          <button
            onclick={handleClose}
            disabled={creating}
            class="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          {#if currentStep < 3}
            <button
              onclick={handleNext}
              disabled={creating}
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              Next
              <ChevronRight size={16} />
            </button>
          {:else}
            <button
              onclick={handleCreate}
              disabled={creating ||
                !instanceName.trim() ||
                !selectedVersion ||
                (modLoaderType === "fabric" && !selectedFabricLoader) ||
                (modLoaderType === "forge" && !selectedForgeLoader)}
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {#if creating}
                <Loader2 size={16} class="animate-spin" />
                Creating...
              {:else}
                Create Instance
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

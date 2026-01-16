<script lang="ts">
  import { ChevronDown, ChevronUp, X } from "lucide-svelte";
  import { onMount } from "svelte";
  import { gameState } from "../stores/game.svelte";
  import { instancesState } from "../stores/instances.svelte";
  import { settingsState } from "../stores/settings.svelte";
  import type { Instance } from "../types";

  // Form state
  let name = $state("");
  let versionId = $state("");
  let javaPath = $state("");
  let minMemory = $state<number | undefined>(undefined);
  let maxMemory = $state<number | undefined>(undefined);
  let width = $state<number | undefined>(undefined);
  let height = $state<number | undefined>(undefined);
  let jvmArgs = $state("");

  let showAdvanced = $state(false);
  let isSaving = $state(false);
  let versionSearch = $state("");

  // Filter versions
  let filteredVersions = $derived(() => {
    if (!versionSearch.trim()) {
      return gameState.versions.filter((v) => v.type === "release").slice(0, 20);
    }
    const query = versionSearch.toLowerCase();
    return gameState.versions
      .filter((v) => v.id.toLowerCase().includes(query))
      .slice(0, 20);
  });

  // Initialize form with existing instance data
  onMount(() => {
    if (instancesState.editingInstance) {
      const inst = instancesState.editingInstance;
      name = inst.name;
      versionId = inst.version_id;
      javaPath = inst.java_path || "";
      minMemory = inst.min_memory;
      maxMemory = inst.max_memory;
      width = inst.width;
      height = inst.height;
      jvmArgs = inst.jvm_args || "";
    } else {
      // Default values for new instance
      name = "";
      versionId = gameState.latestRelease?.id || "";
    }

    // Load Java installations for selection
    if (settingsState.javaInstallations.length === 0) {
      settingsState.detectJava();
    }
  });

  async function handleSubmit() {
    if (!name.trim() || !versionId) return;

    isSaving = true;

    try {
      if (instancesState.isCreating) {
        // Create new instance
        const instance = await instancesState.createInstance(
          name.trim(),
          versionId
        );

        // If advanced settings were set, update the instance
        if (instance && (javaPath || minMemory || maxMemory || width || height || jvmArgs)) {
          const updated: Instance = {
            ...instance,
            java_path: javaPath || undefined,
            min_memory: minMemory,
            max_memory: maxMemory,
            width: width,
            height: height,
            jvm_args: jvmArgs || undefined,
          };
          await instancesState.updateInstance(updated);
        }
      } else if (instancesState.editingInstance) {
        // Update existing instance
        const updated: Instance = {
          ...instancesState.editingInstance,
          name: name.trim(),
          version_id: versionId,
          java_path: javaPath || undefined,
          min_memory: minMemory,
          max_memory: maxMemory,
          width: width,
          height: height,
          jvm_args: jvmArgs || undefined,
        };
        await instancesState.updateInstance(updated);
      }

      instancesState.closeEditModal();
    } finally {
      isSaving = false;
    }
  }

  function handleClose() {
    instancesState.closeEditModal();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
  onclick={handleClose}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5"
    >
      <h2 class="text-xl font-bold dark:text-white">
        {instancesState.isCreating ? "Create Instance" : "Edit Instance"}
      </h2>
      <button
        class="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        onclick={handleClose}
      >
        <X size={20} class="dark:text-white/50" />
      </button>
    </div>

    <!-- Form -->
    <form
      class="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar"
      onsubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <!-- Name -->
      <div>
        <label
          for="instance-name"
          class="block text-sm font-medium dark:text-white/70 text-black/70 mb-2"
        >
          Instance Name
        </label>
        <input
          id="instance-name"
          type="text"
          bind:value={name}
          placeholder="My Instance"
          class="w-full px-4 py-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl dark:text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
          required
        />
      </div>

      <!-- Version -->
      <div>
        <label
          for="version-search"
          class="block text-sm font-medium dark:text-white/70 text-black/70 mb-2"
        >
          Minecraft Version
        </label>
        <div class="relative">
          <input
            id="version-search"
            type="text"
            bind:value={versionSearch}
            placeholder="Search versions..."
            class="w-full px-4 py-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl dark:text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          {#if versionSearch || !versionId}
            <div
              class="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 rounded-xl shadow-lg z-10"
            >
              {#each filteredVersions() as version}
                <button
                  type="button"
                  class="w-full px-4 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10 dark:text-white text-sm
                    {versionId === version.id
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    : ''}"
                  onclick={() => {
                    versionId = version.id;
                    versionSearch = "";
                  }}
                >
                  <span class="font-mono">{version.id}</span>
                  <span class="ml-2 text-xs opacity-50">{version.type}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        {#if versionId && !versionSearch}
          <div
            class="mt-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg inline-flex items-center gap-2"
          >
            <span class="text-sm font-mono text-indigo-600 dark:text-indigo-400"
              >{versionId}</span
            >
            <button
              type="button"
              class="text-indigo-500 hover:text-indigo-600"
              onclick={() => (versionId = "")}
            >
              <X size={14} />
            </button>
          </div>
        {/if}
      </div>

      <!-- Advanced Settings Toggle -->
      <button
        type="button"
        class="flex items-center gap-2 text-sm font-medium dark:text-white/50 text-black/50 hover:dark:text-white/70 hover:text-black/70 transition-colors"
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        {#if showAdvanced}
          <ChevronUp size={16} />
        {:else}
          <ChevronDown size={16} />
        {/if}
        Advanced Settings
      </button>

      {#if showAdvanced}
        <div
          class="space-y-4 p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5"
        >
          <!-- Java Path -->
          <div>
            <label
              for="java-path"
              class="block text-sm font-medium dark:text-white/70 text-black/70 mb-2"
            >
              Java Path (optional)
            </label>
            <select
              id="java-path"
              bind:value={javaPath}
              class="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 rounded-xl dark:text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
            >
              <option value="">Use global setting</option>
              {#each settingsState.javaInstallations as java}
                <option value={java.path}>
                  Java {java.version} ({java.is_64bit ? "64-bit" : "32-bit"})
                </option>
              {/each}
            </select>
          </div>

          <!-- Memory -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label
                for="min-memory"
                class="block text-sm font-medium dark:text-white/70 text-black/70 mb-2"
              >
                Min Memory (MB)
              </label>
              <input
                id="min-memory"
                type="number"
                bind:value={minMemory}
                placeholder="Use global"
                min="512"
                class="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 rounded-xl dark:text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
            <div>
              <label
                for="max-memory"
                class="block text-sm font-medium dark:text-white/70 text-black/70 mb-2"
              >
                Max Memory (MB)
              </label>
              <input
                id="max-memory"
                type="number"
                bind:value={maxMemory}
                placeholder="Use global"
                min="512"
                class="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 rounded-xl dark:text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
          </div>

          <!-- Resolution -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label
                for="window-width"
                class="block text-sm font-medium dark:text-white/70 text-black/70 mb-2"
              >
                Window Width
              </label>
              <input
                id="window-width"
                type="number"
                bind:value={width}
                placeholder="Use global"
                min="640"
                class="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 rounded-xl dark:text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
            <div>
              <label
                for="window-height"
                class="block text-sm font-medium dark:text-white/70 text-black/70 mb-2"
              >
                Window Height
              </label>
              <input
                id="window-height"
                type="number"
                bind:value={height}
                placeholder="Use global"
                min="480"
                class="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 rounded-xl dark:text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
          </div>

          <!-- JVM Args -->
          <div>
            <label
              for="jvm-args"
              class="block text-sm font-medium dark:text-white/70 text-black/70 mb-2"
            >
              Custom JVM Arguments
            </label>
            <input
              id="jvm-args"
              type="text"
              bind:value={jvmArgs}
              placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=50"
              class="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 rounded-xl dark:text-white font-mono text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
            <p class="mt-1 text-xs dark:text-white/30 text-black/30">
              Additional JVM arguments for this instance
            </p>
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex gap-3 pt-4">
        <button
          type="button"
          class="flex-1 px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium"
          onclick={handleClose}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || !versionId || isSaving}
          class="flex-1 px-4 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white font-medium transition-colors"
        >
          {isSaving
            ? "Saving..."
            : instancesState.isCreating
              ? "Create"
              : "Save"}
        </button>
      </div>
    </form>
  </div>
</div>

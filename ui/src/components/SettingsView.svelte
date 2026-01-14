<script lang="ts">
  import { settingsState } from "../stores/settings.svelte";
</script>

<div class="p-8 bg-zinc-900 h-full overflow-y-auto">
  <h2 class="text-3xl font-bold mb-8">Settings</h2>

  <div class="space-y-6 max-w-2xl">
    <!-- Java Path -->
    <div class="bg-zinc-800/50 p-6 rounded-lg border border-zinc-700">
      <label
        for="java-path"
        class="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide"
        >Java Executable Path</label
      >
      <div class="flex gap-2">
        <input
          id="java-path"
          bind:value={settingsState.settings.java_path}
          type="text"
          class="bg-zinc-950 text-white flex-1 p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none font-mono text-sm"
          placeholder="e.g. java, /usr/bin/java"
        />
        <button
          onclick={() => settingsState.detectJava()}
          disabled={settingsState.isDetectingJava}
          class="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-4 py-2 rounded transition-colors whitespace-nowrap"
        >
          {settingsState.isDetectingJava ? "Detecting..." : "Auto Detect"}
        </button>
      </div>
      
      {#if settingsState.javaInstallations.length > 0}
        <div class="mt-4 space-y-2">
          <p class="text-xs text-zinc-400 uppercase font-bold">Detected Java Installations:</p>
          {#each settingsState.javaInstallations as java}
            <button
              onclick={() => settingsState.selectJava(java.path)}
              class="w-full text-left p-3 bg-zinc-950 rounded border transition-colors {settingsState.settings.java_path === java.path ? 'border-indigo-500 bg-indigo-950/30' : 'border-zinc-700 hover:border-zinc-500'}"
            >
              <div class="flex justify-between items-center">
                <div>
                  <span class="text-white font-mono text-sm">{java.version}</span>
                  <span class="text-zinc-500 text-xs ml-2">{java.is_64bit ? "64-bit" : "32-bit"}</span>
                </div>
                {#if settingsState.settings.java_path === java.path}
                  <span class="text-indigo-400 text-xs">Selected</span>
                {/if}
              </div>
              <div class="text-zinc-500 text-xs font-mono truncate mt-1">{java.path}</div>
            </button>
          {/each}
        </div>
      {/if}
      
      <p class="text-xs text-zinc-500 mt-2">
        The command or path to the Java Runtime Environment. Click "Auto Detect" to find installed Java versions.
      </p>
    </div>

    <!-- Memory -->
    <div class="bg-zinc-800/50 p-6 rounded-lg border border-zinc-700">
      <h3
        class="block text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wide"
        >Memory Allocation (RAM)</h3>

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="min-memory" class="block text-xs text-zinc-500 mb-1"
            >Minimum (MB)</label
          >
          <input
            id="min-memory"
            bind:value={settingsState.settings.min_memory}
            type="number"
            class="bg-zinc-950 text-white w-full p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none"
          />
        </div>
        <div>
          <label for="max-memory" class="block text-xs text-zinc-500 mb-1"
            >Maximum (MB)</label
          >
          <input
            id="max-memory"
            bind:value={settingsState.settings.max_memory}
            type="number"
            class="bg-zinc-950 text-white w-full p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>
    </div>

    <!-- Resolution -->
    <div class="bg-zinc-800/50 p-6 rounded-lg border border-zinc-700">
      <h3
        class="block text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wide"
        >Game Window Size</h3>
      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="window-width" class="block text-xs text-zinc-500 mb-1">Width</label>
          <input
            id="window-width"
            bind:value={settingsState.settings.width}
            type="number"
            class="bg-zinc-950 text-white w-full p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none"
          />
        </div>
        <div>
          <label for="window-height" class="block text-xs text-zinc-500 mb-1">Height</label>
          <input
            id="window-height"
            bind:value={settingsState.settings.height}
            type="number"
            class="bg-zinc-950 text-white w-full p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>
    </div>

    <div class="pt-4">
      <button
        onclick={() => settingsState.saveSettings()}
        class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded shadow-lg transition-transform active:scale-95"
      >
        Save Settings
      </button>
    </div>
  </div>
</div>

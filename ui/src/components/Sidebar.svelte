<script lang="ts">
  import { uiState } from '../stores/ui.svelte';
</script>

<aside
  class="w-20 lg:w-64 bg-zinc-950 flex flex-col items-center lg:items-start transition-all duration-300 border-r border-zinc-800 shrink-0"
>
  <div
    class="h-20 w-full flex items-center justify-center lg:justify-start lg:px-6 border-b border-zinc-800/50"
  >
    <!-- Icon Logo (Visible on small) -->
    <div
      class="lg:hidden text-2xl font-black bg-clip-text text-transparent bg-gradient-to-tr from-indigo-400 to-purple-400"
    >
      D
    </div>
    <!-- Full Logo (Visible on large) -->
    <div
      class="hidden lg:block font-bold text-xl tracking-wider text-indigo-400"
    >
      DROP<span class="text-white">OUT</span>
    </div>
  </div>

  <nav class="flex-1 w-full flex flex-col gap-2 p-3">
    <button
      class="group flex items-center lg:gap-4 justify-center lg:justify-start w-full px-0 lg:px-4 py-3 rounded-lg hover:bg-zinc-800 {uiState.currentView ===
      'home'
        ? 'bg-zinc-800/80 text-white'
        : 'text-zinc-400'} transition-all relative"
      onclick={() => uiState.setView("home")}
    >
      <span class="text-xl relative z-10">🏠</span>
      <span
        class="hidden lg:block font-medium relative z-10 transition-opacity"
        >Home</span
      >
    </button>
    <button
      class="group flex items-center lg:gap-4 justify-center lg:justify-start w-full px-0 lg:px-4 py-3 rounded-lg hover:bg-zinc-800 {uiState.currentView ===
      'versions'
        ? 'bg-zinc-800/80 text-white'
        : 'text-zinc-400'} transition-all"
      onclick={() => uiState.setView("versions")}
    >
      <span class="text-xl">📦</span>
      <span class="hidden lg:block font-medium">Versions</span>
    </button>
    <button
      class="group flex items-center lg:gap-4 justify-center lg:justify-start w-full px-0 lg:px-4 py-3 rounded-lg hover:bg-zinc-800 {uiState.currentView ===
      'settings'
        ? 'bg-zinc-800/80 text-white'
        : 'text-zinc-400'} transition-all"
      onclick={() => uiState.setView("settings")}
    >
      <span class="text-xl">⚙️</span>
      <span class="hidden lg:block font-medium">Settings</span>
    </button>
  </nav>

  <div
    class="p-4 w-full border-t border-zinc-800 flex justify-center lg:justify-start"
  >
    <div class="text-xs text-zinc-600 font-mono">v{uiState.appVersion}</div>
  </div>
</aside>

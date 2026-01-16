<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { authState } from "../stores/auth.svelte";
  import { gameState } from "../stores/game.svelte";
  import { uiState } from "../stores/ui.svelte";
  import { instancesState } from "../stores/instances.svelte";
  import { Terminal, ChevronDown, Play, User, Check } from 'lucide-svelte';

  interface InstalledVersion {
    id: string;
    type: string;
  }

  let isVersionDropdownOpen = $state(false);
  let dropdownRef: HTMLDivElement;
  let installedVersions = $state<InstalledVersion[]>([]);
  let isLoadingVersions = $state(true);
  let downloadCompleteUnlisten: UnlistenFn | null = null;
  let versionDeletedUnlisten: UnlistenFn | null = null;

  // Load installed versions on mount
  $effect(() => {
    loadInstalledVersions();
    setupEventListeners();
    return () => {
      if (downloadCompleteUnlisten) {
        downloadCompleteUnlisten();
      }
      if (versionDeletedUnlisten) {
        versionDeletedUnlisten();
      }
    };
  });

  async function setupEventListeners() {
    // Refresh list when a download completes
    downloadCompleteUnlisten = await listen("download-complete", () => {
      loadInstalledVersions();
    });
    // Refresh list when a version is deleted
    versionDeletedUnlisten = await listen("version-deleted", () => {
      loadInstalledVersions();
    });
  }

  async function loadInstalledVersions() {
    if (!instancesState.activeInstanceId) {
      installedVersions = [];
      isLoadingVersions = false;
      return;
    }
    isLoadingVersions = true;
    try {
      installedVersions = await invoke<InstalledVersion[]>("list_installed_versions", {
        instanceId: instancesState.activeInstanceId,
      });
      // If no version is selected but we have installed versions, select the first one
      if (!gameState.selectedVersion && installedVersions.length > 0) {
        gameState.selectedVersion = installedVersions[0].id;
      }
    } catch (e) {
      console.error("Failed to load installed versions:", e);
    } finally {
      isLoadingVersions = false;
    }
  }

  let versionOptions = $derived(
    isLoadingVersions 
      ? [{ id: "loading", type: "loading", label: "Loading..." }]
      : installedVersions.length === 0
        ? [{ id: "empty", type: "empty", label: "No versions installed" }]
        : installedVersions.map(v => ({
            ...v,
            label: `${v.id}${v.type !== 'release' ? ` (${v.type})` : ''}`
          }))
  );

  function selectVersion(id: string) {
    if (id !== "loading" && id !== "empty") {
      gameState.selectedVersion = id;
      isVersionDropdownOpen = false;
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      isVersionDropdownOpen = false;
    }
  }

  $effect(() => {
    if (isVersionDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });

  function getVersionTypeColor(type: string) {
    switch (type) {
      case 'fabric': return 'text-indigo-400';
      case 'forge': return 'text-orange-400';
      case 'snapshot': return 'text-amber-400';
      case 'modpack': return 'text-purple-400';
      default: return 'text-emerald-400';
    }
  }
</script>

<div
  class="h-20 bg-white/80 dark:bg-[#09090b]/90 border-t dark:border-white/10 border-black/5 flex items-center px-8 justify-between z-20 backdrop-blur-md"
>
  <!-- Account Area -->
  <div class="flex items-center gap-6">
    <div
      class="group flex items-center gap-4 cursor-pointer"
      onclick={() => authState.openLoginModal()}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === "Enter" && authState.openLoginModal()}
    >
      <div
        class="w-10 h-10 rounded-sm bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden transition-all group-hover:border-zinc-400 dark:group-hover:border-zinc-500"
      >
        {#if authState.currentAccount}
          <img
            src={`https://minotar.net/avatar/${authState.currentAccount.username}/48`}
            alt={authState.currentAccount.username}
            class="w-full h-full"
          />
        {:else}
          <User size={20} class="text-zinc-400" />
        {/if}
      </div>
      <div>
        <div class="font-bold dark:text-white text-gray-900 text-sm group-hover:text-black dark:group-hover:text-zinc-200 transition-colors">
          {authState.currentAccount ? authState.currentAccount.username : "Login Account"}
        </div>
        <div class="text-[10px] uppercase tracking-wider dark:text-zinc-500 text-gray-500 flex items-center gap-2">
          {#if authState.currentAccount}
            {#if authState.currentAccount.type === "Microsoft"}
              {#if authState.currentAccount.expires_at && authState.currentAccount.expires_at * 1000 < Date.now()}
                <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span class="text-red-400">Expired</span>
              {:else}
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Online
              {/if}
            {:else}
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Offline
            {/if}
          {:else}
            <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
            Guest
          {/if}
        </div>
      </div>
    </div>
    
    <div class="h-8 w-px dark:bg-white/10 bg-black/10"></div>
    
    <!-- Console Toggle -->
    <button
      class="text-xs font-mono dark:text-zinc-500 text-gray-500 dark:hover:text-white hover:text-black transition-colors flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-black/5 dark:hover:bg-white/5"
      onclick={() => uiState.toggleConsole()}
    >
      <Terminal size={14} />
      {uiState.showConsole ? "HIDE LOGS" : "SHOW LOGS"}
    </button>
  </div>

  <!-- Action Area -->
  <div class="flex items-center gap-4">
    <div class="flex flex-col items-end mr-2">
      <!-- Custom Version Dropdown -->
      <div class="relative" bind:this={dropdownRef}>
        <button
            type="button"
            onclick={() => isVersionDropdownOpen = !isVersionDropdownOpen}
            disabled={installedVersions.length === 0 && !isLoadingVersions}
            class="flex items-center justify-between gap-2 w-56 px-4 py-2.5 text-left
                   dark:bg-zinc-900 bg-zinc-50 border dark:border-zinc-700 border-zinc-300 rounded-md 
                   text-sm font-mono dark:text-white text-gray-900
                   dark:hover:border-zinc-600 hover:border-zinc-400 
                   focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30
                   transition-colors cursor-pointer outline-none
                   disabled:opacity-50 disabled:cursor-not-allowed"
          >
          <span class="truncate">
            {#if isLoadingVersions}
              Loading...
            {:else if installedVersions.length === 0}
              No versions installed
            {:else}
              {gameState.selectedVersion || "Select version"}
            {/if}
          </span>
          <ChevronDown 
            size={14} 
            class="shrink-0 dark:text-zinc-500 text-zinc-400 transition-transform duration-200 {isVersionDropdownOpen ? 'rotate-180' : ''}" 
          />
        </button>

        {#if isVersionDropdownOpen && installedVersions.length > 0}
          <div 
            class="absolute z-50 w-full mt-1 py-1 dark:bg-zinc-900 bg-white border dark:border-zinc-700 border-zinc-300 rounded-md shadow-xl
                   max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150 bottom-full mb-1 right-0"
          >
            {#each versionOptions as version}
              <button
                type="button"
                onclick={() => selectVersion(version.id)}
                disabled={version.id === "loading" || version.id === "empty"}
                class="w-full flex items-center justify-between px-3 py-2 text-sm font-mono text-left
                       transition-colors outline-none
                       {version.id === gameState.selectedVersion 
                         ? 'bg-indigo-600 text-white' 
                         : 'dark:text-zinc-300 text-gray-700 dark:hover:bg-zinc-800 hover:bg-zinc-100'}
                       {version.id === 'loading' || version.id === 'empty' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
              >
                <span class="truncate flex items-center gap-2">
                  {version.id}
                  {#if version.type && version.type !== 'release' && version.type !== 'loading' && version.type !== 'empty'}
                    <span class="text-[10px] uppercase {version.id === gameState.selectedVersion ? 'text-white/70' : getVersionTypeColor(version.type)}">
                      {version.type}
                    </span>
                  {/if}
                </span>
                {#if version.id === gameState.selectedVersion}
                  <Check size={14} class="shrink-0 ml-2" />
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <button
      onclick={() => gameState.startGame()}
      disabled={installedVersions.length === 0 || !gameState.selectedVersion}
      class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white h-14 px-10 rounded-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/20 flex items-center gap-3 font-bold text-lg tracking-widest uppercase"
    >
      <Play size={24} fill="currentColor" />
      <span>Launch</span>
    </button>
  </div>
</div>

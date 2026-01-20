<script lang="ts">
  import { uiState } from '../stores/ui.svelte';
  import { Home, Package, Settings, Bot, Folder } from 'lucide-svelte';
</script>

<aside
  class="w-20 lg:w-64 dark:bg-[#09090b] bg-white border-r dark:border-white/10 border-gray-200 flex flex-col items-center lg:items-start transition-all duration-300 shrink-0 py-6 z-20"
>
  <!-- Logo Area -->
  <div
    class="h-16 w-full flex items-center justify-center lg:justify-start lg:px-6 mb-6"
  >
    <!-- Icon Logo (Small) -->
    <div class="lg:hidden text-black dark:text-white">
      <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M25 25 L50 50" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <path d="M25 75 L50 50" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <path d="M50 50 L75 50" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <circle cx="25" cy="25" r="8" fill="currentColor" stroke="none" />
        <circle cx="25" cy="50" r="8" fill="currentColor" stroke="none" />
        <circle cx="25" cy="75" r="8" fill="currentColor" stroke="none" />
        <circle cx="50" cy="50" r="10" fill="currentColor" stroke="none" />
        <circle cx="75" cy="50" r="8" fill="currentColor" stroke="none" />
      </svg>
    </div>
    <!-- Full Logo (Large) -->
    <div
      class="hidden lg:flex items-center gap-3 font-bold text-xl tracking-tighter dark:text-white text-black"
    >
      <!-- Neural Network Dropout Logo -->
      <svg width="42" height="42" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0">
        <!-- Lines -->
        <path d="M25 25 L50 50" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <path d="M25 75 L50 50" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <path d="M50 50 L75 50" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        
        <!-- Input Layer (Left) -->
        <circle cx="25" cy="25" r="8" fill="currentColor" stroke="none" />
        <circle cx="25" cy="50" r="8" fill="currentColor" stroke="none" />
        <circle cx="25" cy="75" r="8" fill="currentColor" stroke="none" />

        <!-- Hidden Layer (Middle) - Dropout visualization -->
        <!-- Dropped units (dashed) -->
        <circle cx="50" cy="25" r="7" stroke="currentColor" stroke-width="2" stroke-dasharray="4 2" fill="none" class="opacity-30" />
        <circle cx="50" cy="75" r="7" stroke="currentColor" stroke-width="2" stroke-dasharray="4 2" fill="none" class="opacity-30" />
        <!-- Active unit -->
        <circle cx="50" cy="50" r="10" fill="currentColor" stroke="none" />

        <!-- Output Layer (Right) -->
        <circle cx="75" cy="50" r="8" fill="currentColor" stroke="none" />
      </svg>
      
      <span>DROPOUT</span>
    </div>
  </div>

  <!-- Navigation -->
  <nav class="flex-1 w-full flex flex-col gap-1 px-3">
    <!-- Nav Item Helper -->
    {#snippet navItem(view: any, Icon: any, label: string)}
      <button
        class="group flex items-center lg:gap-3 justify-center lg:justify-start w-full px-0 lg:px-4 py-2.5 rounded-sm transition-all duration-200 relative
        {uiState.currentView === view
          ? 'bg-black/5 dark:bg-white/10 dark:text-white text-black font-medium'
          : 'dark:text-zinc-400 text-zinc-500 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'}"
        onclick={() => uiState.setView(view)}
      >
        <Icon size={20} strokeWidth={uiState.currentView === view ? 2.5 : 2} />
        <span class="hidden lg:block text-sm relative z-10">{label}</span>
        
        <!-- Active Indicator -->
        {#if uiState.currentView === view}
           <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-black dark:bg-white rounded-r-full hidden lg:block"></div>
        {/if}
      </button>
    {/snippet}

    {@render navItem('home', Home, 'Overview')}
    {@render navItem('instances', Folder, 'Instances')}
    {@render navItem('versions', Package, 'Versions')}
    {@render navItem('guide', Bot, 'Assistant')}
    {@render navItem('settings', Settings, 'Settings')}
  </nav>

  <!-- Footer Info -->
  <div
    class="p-4 w-full flex justify-center lg:justify-start lg:px-6 opacity-40 hover:opacity-100 transition-opacity"
  >
    <div class="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">v{uiState.appVersion}</div>
  </div>
</aside>

<script lang="ts">
  import { getVersion } from "@tauri-apps/api/app";
  // import { convertFileSrc } from "@tauri-apps/api/core"; // Removed duplicate, handled by import below or inline
  import { onDestroy, onMount } from "svelte";
  import DownloadMonitor from "./lib/DownloadMonitor.svelte";
  import GameConsole from "./lib/GameConsole.svelte";
// Components
  import BottomBar from "./components/BottomBar.svelte";
  import HomeView from "./components/HomeView.svelte";
  import LoginModal from "./components/LoginModal.svelte";
  import ParticleBackground from "./components/ParticleBackground.svelte";
  import SettingsView from "./components/SettingsView.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import StatusToast from "./components/StatusToast.svelte";
  import VersionsView from "./components/VersionsView.svelte";
// Stores
  import { authState } from "./stores/auth.svelte";
  import { gameState } from "./stores/game.svelte";
  import { settingsState } from "./stores/settings.svelte";
  import { uiState } from "./stores/ui.svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";

  let mouseX = $state(0);
  let mouseY = $state(0);

  function handleMouseMove(e: MouseEvent) {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
  }

  onMount(async () => {
    authState.checkAccount();
    await settingsState.loadSettings();
    await settingsState.detectJava();
    gameState.loadVersions();
    getVersion().then((v) => (uiState.appVersion = v));
    window.addEventListener("mousemove", handleMouseMove);
  });
  
  $effect(() => {
    // ENFORCE DARK MODE: Always add 'dark' class and attribute
    // This combined with the @variant dark in app.css ensures dark mode is always active
    // regardless of system preference settings.
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    
    // Ensure 'light' class is never present
    document.documentElement.classList.remove('light');
  });

  onDestroy(() => {
    if (typeof window !== 'undefined')
      window.removeEventListener("mousemove", handleMouseMove);
  });
</script>

<div
  class="relative h-screen w-screen overflow-hidden dark:text-white text-gray-900 font-sans selection:bg-indigo-500/30"
>
  <!-- Modern Animated Background -->
  <div class="absolute inset-0 z-0 bg-[#09090b] dark:bg-[#09090b] bg-gray-100 overflow-hidden">
    {#if settingsState.settings.custom_background_path}
      <img
        src={convertFileSrc(settingsState.settings.custom_background_path)}
        alt="Background"
        class="absolute inset-0 w-full h-full object-cover transition-transform duration-[20s] ease-linear hover:scale-105"
        onerror={(e) => console.error("Failed to load main background:", e)}
      />
      <!-- Dimming Overlay for readability -->
      <div class="absolute inset-0 bg-black/50 "></div>
    {:else if settingsState.settings.enable_visual_effects}
      <!-- Original Gradient (Dark Only / or Adjusted for Light) -->
      {#if settingsState.settings.theme === 'dark'}
          <div 
            class="absolute inset-0 opacity-60 bg-gradient-to-br from-emerald-900 via-zinc-900 to-indigo-950"
          ></div>
      {:else}
           <!-- Light Mode Gradient -->
           <div 
            class="absolute inset-0 opacity-100 bg-gradient-to-br from-emerald-100 via-gray-100 to-indigo-100"
          ></div>
      {/if}

      {#if uiState.currentView === "home"}
        <ParticleBackground />
      {/if}

      <div 
        class="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-black/50 dark:from-zinc-900 dark:to-black/50 from-gray-100 to-transparent"
      ></div>
    {/if}
    
    <!-- Subtle Grid Overlay -->
    <div class="absolute inset-0 z-0 opacity-10 dark:opacity-10 opacity-30 pointer-events-none" 
         style="background-image: linear-gradient({settingsState.settings.theme === 'dark' ? '#ffffff' : '#000000'} 1px, transparent 1px), linear-gradient(90deg, {settingsState.settings.theme === 'dark' ? '#ffffff' : '#000000'} 1px, transparent 1px); background-size: 40px 40px; mask-image: radial-gradient(circle at 50% 50%, black 30%, transparent 70%);">
    </div>
  </div>

  <!-- Content Wrapper -->
  <div class="relative z-10 flex h-full p-4 gap-4 text-gray-900 dark:text-white">
    <!-- Floating Sidebar -->
    <Sidebar />

    <!-- Main Content Area - Transparent & Flat -->
    <main class="flex-1 flex flex-col relative min-w-0 overflow-hidden transition-all duration-300">
      
      <!-- Window Drag Region -->
      <div
        class="h-8 w-full absolute top-0 left-0 z-50 drag-region"
        data-tauri-drag-region
      ></div>

      <!-- App Content -->
      <div class="flex-1 relative overflow-hidden flex flex-col">
          <!-- Views Container -->
          <div class="flex-1 relative overflow-hidden">
             {#if uiState.currentView === "home"}
               <HomeView mouseX={mouseX} mouseY={mouseY} />
             {:else if uiState.currentView === "versions"}
               <VersionsView />
             {:else if uiState.currentView === "settings"}
               <SettingsView />
             {/if}
          </div>
          
          <!-- Download Monitor Overlay -->
          <div class="absolute bottom-20 left-4 right-4 pointer-events-none z-20">
             <div class="pointer-events-auto">
                 <DownloadMonitor />
             </div>
          </div>
          
          <!-- Bottom Bar -->
          {#if uiState.currentView === "home"}
            <BottomBar />
          {/if}
      </div>
    </main>
  </div>

  <LoginModal />
  <StatusToast />
  
  {#if uiState.showConsole}
    <div class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8">
        <div class="w-full h-full max-w-6xl max-h-[85vh] bg-[#1e1e1e] rounded-lg overflow-hidden border border-zinc-700 shadow-2xl relative flex flex-col">
            <GameConsole />
        </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #000;
  }
  
  /* Modern Scrollbar */
  :global(*::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }
  
  :global(*::-webkit-scrollbar-track) {
    background: transparent;
  }
  
  :global(*::-webkit-scrollbar-thumb) {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 999px;
  }
  
  :global(*::-webkit-scrollbar-thumb:hover) {
    background: rgba(255, 255, 255, 0.25);
  }
</style>

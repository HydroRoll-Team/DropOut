<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";

  let status = "Ready";

  async function startGame() {
    status = "Launching (Simulated)...";
    console.log("Invoking start_game...");
    try {
        const msg = await invoke("start_game");
        console.log("Response:", msg);
        status = msg as string;
    } catch (e) {
        console.error(e);
        status = "Error: " + e;
    }
  }
</script>

<div class="flex h-screen bg-zinc-900 text-white font-sans overflow-hidden select-none">
  <!-- Sidebar -->
  <aside class="w-20 lg:w-64 bg-zinc-950 flex flex-col items-center lg:items-start transition-all duration-300 border-r border-zinc-800 shrink-0">
    <div class="h-20 w-full flex items-center justify-center lg:justify-start lg:px-6 border-b border-zinc-800/50">
        <!-- Icon Logo (Visible on small) -->
        <div class="lg:hidden text-2xl font-black bg-clip-text text-transparent bg-gradient-to-tr from-indigo-400 to-purple-400">D</div>
        <!-- Full Logo (Visible on large) -->
        <div class="hidden lg:block font-bold text-xl tracking-wider text-indigo-400">DROP<span class="text-white">OUT</span></div>
    </div>
    
    <nav class="flex-1 w-full flex flex-col gap-2 p-3">
      <button class="group flex items-center lg:gap-4 justify-center lg:justify-start w-full px-0 lg:px-4 py-3 rounded-lg hover:bg-zinc-800 bg-zinc-800/50 text-zinc-100 transition-all relative">
        <span class="text-xl relative z-10">🏠</span>
        <span class="hidden lg:block font-medium relative z-10 transition-opacity">Home</span>
        <!-- Tooltip for small screen (optional, simple css approach) -->
      </button>
      <button class="group flex items-center lg:gap-4 justify-center lg:justify-start w-full px-0 lg:px-4 py-3 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all">
        <span class="text-xl">📦</span>
        <span class="hidden lg:block font-medium">Versions</span>
      </button>
      <button class="group flex items-center lg:gap-4 justify-center lg:justify-start w-full px-0 lg:px-4 py-3 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all">
        <span class="text-xl">⚙️</span>
        <span class="hidden lg:block font-medium">Settings</span>
      </button>
    </nav>
    
    <div class="p-4 w-full border-t border-zinc-800 flex justify-center lg:justify-start">
      <div class="text-xs text-zinc-600 font-mono">v0.1.3</div>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 flex flex-col relative min-w-0">
    <!-- Top Bar (Window Controls Placeholder) -->
    <div class="h-8 w-full bg-zinc-900/50 absolute top-0 left-0 z-50 drag-region" data-tauri-drag-region>
        <!-- Windows/macOS controls would go here or be handled by OS -->
    </div>

    <!-- Background / Poster area -->
    <div class="flex-1 bg-gradient-to-br from-zinc-800 to-black relative overflow-hidden group">
        <!-- Background Image -->
        <div class="absolute inset-0 z-0 opacity-40 bg-[url('https://www.minecraft.net/content/dam/games/minecraft/key-art/Minecraft-KeyArt-02_800x450.jpg')] bg-cover bg-center transition-transform duration-[10s] ease-linear group-hover:scale-105"></div>
        <div class="absolute inset-0 z-0 bg-gradient-to-t from-zinc-900 via-transparent to-black/50"></div>

        <div class="absolute bottom-24 left-8 z-10 p-4">
            <h1 class="text-6xl font-black mb-2 tracking-tight text-white drop-shadow-lg">MINECRAFT</h1>
            <div class="flex items-center gap-2 text-zinc-300">
                <span class="bg-zinc-800 text-xs px-2 py-1 rounded border border-zinc-600">JAVA EDITION</span>
                <span class="text-lg">Release 1.20.4</span>
            </div>
        </div>
    </div>

    <!-- Bottom Bar -->
    <div class="h-24 bg-zinc-900 border-t border-zinc-800 flex items-center px-8 justify-between z-20 shadow-2xl">
        <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg flex items-center justify-center text-white font-bold text-xl">S</div>
            <div>
                <div class="font-bold text-white text-lg">Steve</div>
                <div class="text-xs text-zinc-400 flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Online
                </div>
            </div>
        </div>

        <div class="flex items-center gap-4">
            <div class="flex flex-col items-end mr-2">
                 <label class="text-xs text-zinc-500 mb-1 uppercase font-bold tracking-wider">Version</label>
                 <select class="bg-zinc-950 text-zinc-200 border border-zinc-700 rounded px-4 py-2 hover:border-zinc-500 transition-colors cursor-pointer outline-none focus:ring-1 focus:ring-indigo-500 w-48">
                    <option>Latest Release (1.20.4)</option>
                    <option>1.19.2</option>
                    <option>1.8.9</option>
                </select>
            </div>
           
            <button
                onclick={startGame}
                class="bg-green-600 hover:bg-green-500 text-white font-bold h-14 px-12 rounded transition-all transform active:scale-95 shadow-[0_0_15px_rgba(22,163,74,0.4)] hover:shadow-[0_0_25px_rgba(22,163,74,0.6)] flex flex-col items-center justify-center uppercase tracking-wider text-lg"
            >
                Play
                <span class="text-[10px] font-normal opacity-80 normal-case tracking-normal">Click to launch</span>
            </button>
        </div>
    </div>
  </main>

  <!-- Overlay Status (Toast) -->
  {#if status !== "Ready"}
  <div class="absolute top-12 right-12 bg-zinc-800/90 backdrop-blur border border-zinc-600 p-4 rounded-lg shadow-2xl max-w-sm animate-in fade-in slide-in-from-top-4 duration-300">
      <div class="text-xs text-zinc-400 uppercase font-bold mb-1">Status</div>
      <div class="font-mono text-sm whitespace-pre-wrap">{status}</div>
  </div>
  {/if}
</div>

<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { settingsState } from "../stores/settings.svelte";

  async function selectBackground() {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        settingsState.settings.custom_background_path = selected;
        settingsState.saveSettings();
      }
    } catch (e) {
      console.error("Failed to select background:", e);
    }
  }

  function clearBackground() {
    settingsState.settings.custom_background_path = undefined;
    settingsState.saveSettings();
  }
</script>

<div class="h-full flex flex-col p-6 overflow-hidden">
  <div class="flex items-center justify-between mb-6">
     <h2 class="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r dark:from-white dark:to-white/60 from-gray-900 to-gray-600">Settings</h2>
  </div>

  <div class="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar pb-10">

    <!-- Appearance / Background -->
    <div class="dark:bg-black/20 bg-white/60 p-6 rounded-2xl border dark:border-white/5 border-black/5 shadow-sm backdrop-blur-sm">
      <h3 class="text-xs font-bold uppercase tracking-widest dark:text-white/40 text-black/40 mb-6 flex items-center gap-2">
        Appearance
      </h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium dark:text-white/70 text-black/70 mb-3">Custom Background Image</label>
          
          <div class="flex items-center gap-6">
            <!-- Preview -->
            <div class="w-40 h-24 rounded-xl overflow-hidden dark:bg-black/50 bg-gray-200 border dark:border-white/10 border-black/10 relative group shadow-lg">
              {#if settingsState.settings.custom_background_path}
                <img
                  src={convertFileSrc(settingsState.settings.custom_background_path)}
                  alt="Background Preview"
                  class="w-full h-full object-cover"
                />
              {:else}
                <div class="w-full h-full bg-gradient-to-br from-emerald-900 via-zinc-900 to-indigo-950 opacity-100"></div>
                <div class="absolute inset-0 flex items-center justify-center text-[10px] text-white/50 bg-black/20 ">Default Gradient</div>
              {/if}
            </div>

            <!-- Actions -->
            <div class="flex flex-col gap-2">
              <button
                onclick={selectBackground}
                class="dark:bg-white/10 dark:hover:bg-white/20 bg-black/5 hover:bg-black/10 dark:text-white text-black px-4 py-2 rounded-lg text-sm transition-colors border dark:border-white/5 border-black/5"
              >
                Select Image
              </button>
              
              {#if settingsState.settings.custom_background_path}
                <button
                  onclick={clearBackground}
                  class="text-red-400 hover:text-red-300 text-sm px-4 py-1 text-left transition-colors"
                >
                  Reset to Default
                </button>
              {/if}
            </div>
          </div>
          <p class="text-xs dark:text-white/30 text-black/40 mt-3">
            Select an image from your computer to replace the default gradient background.
            Supported formats: PNG, JPG, WEBP, GIF.
          </p>
        </div>

        <!-- Visual Settings -->
        <div class="pt-4 border-t dark:border-white/5 border-black/5 space-y-4">
             <div class="flex items-center justify-between">
                <div>
                   <h4 class="text-sm font-medium dark:text-white/90 text-black/80" id="visual-effects-label">Visual Effects</h4>
                   <p class="text-xs dark:text-white/40 text-black/50 mt-1">Enable particle effects and animated gradients. (Default: On)</p>
                </div>
                <button 
                    aria-labelledby="visual-effects-label"
                    onclick={() => { settingsState.settings.enable_visual_effects = !settingsState.settings.enable_visual_effects; settingsState.saveSettings(); }}
                    class="w-11 h-6 rounded-full transition-colors duration-200 ease-in-out relative focus:outline-none {settingsState.settings.enable_visual_effects ? 'bg-indigo-500' : 'dark:bg-white/10 bg-black/10'}"
                >
                    <div class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ease-in-out {settingsState.settings.enable_visual_effects ? 'translate-x-5' : 'translate-x-0'}"></div>
                </button>
             </div>

             {#if settingsState.settings.enable_visual_effects}
                 <div class="flex items-center justify-between pl-2 border-l-2 dark:border-white/5 border-black/5 ml-1">
                    <div>
                       <h4 class="text-sm font-medium dark:text-white/90 text-black/80" id="theme-effect-label">Theme Effect</h4>
                       <p class="text-xs dark:text-white/40 text-black/50 mt-1">Select the active visual theme.</p>
                    </div>
                    <select
                        aria-labelledby="theme-effect-label"
                        bind:value={settingsState.settings.active_effect}
                        onchange={() => settingsState.saveSettings()}
                        class="dark:bg-black/40 bg-white dark:text-white text-black text-xs px-3 py-2 rounded-lg border dark:border-white/10 border-black/10 outline-none focus:border-indigo-500/50 appearance-none cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                        <option value="saturn">Saturn (Saturn)</option>
                        <option value="constellation">Network (Constellation)</option>
                    </select>
                 </div>
             {/if}

             <div class="flex items-center justify-between">
                <div>
                   <h4 class="text-sm font-medium dark:text-white/90 text-black/80" id="gpu-acceleration-label">GPU Acceleration</h4>
                   <p class="text-xs dark:text-white/40 text-black/50 mt-1">Enable GPU acceleration for the interface. (Default: Off, Requires Restart)</p>
                </div>
                <button 
                    aria-labelledby="gpu-acceleration-label"
                    onclick={() => { settingsState.settings.enable_gpu_acceleration = !settingsState.settings.enable_gpu_acceleration; settingsState.saveSettings(); }}
                    class="w-11 h-6 rounded-full transition-colors duration-200 ease-in-out relative focus:outline-none {settingsState.settings.enable_gpu_acceleration ? 'bg-indigo-500' : 'dark:bg-white/10 bg-black/10'}"
                >
                    <div class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ease-in-out {settingsState.settings.enable_gpu_acceleration ? 'translate-x-5' : 'translate-x-0'}"></div>
                </button>
             </div>
             
             <!-- Color Theme Switcher -->
             <div class="flex items-center justify-between pt-4 border-t dark:border-white/5 border-black/5 opacity-50 cursor-not-allowed">
                <div>
                   <h4 class="text-sm font-medium dark:text-white/90 text-black/80" id="color-theme-label">Color Theme</h4>
                   <p class="text-xs dark:text-white/40 text-black/50 mt-1">Interface color mode. (Locked to Dark)</p>
                </div>
                <div class="flex items-center bg-black/5 dark:bg-white/5 rounded-lg p-1 pointer-events-none">
                    <button
                        disabled
                        class="px-3 py-1 rounded-md text-xs font-medium transition-all text-gray-500 dark:text-gray-600"
                    >
                        Light
                    </button>
                    <button
                        disabled
                        class="px-3 py-1 rounded-md text-xs font-medium transition-all bg-indigo-500 text-white shadow-sm"
                    >
                        Dark
                    </button>
                </div>
             </div>
        </div>
      </div>
    </div>

    <!-- Java Path -->
    <div class="dark:bg-black/20 bg-white/60 p-6 rounded-2xl border dark:border-white/5 border-black/5 shadow-sm backdrop-blur-sm">
      <h3 class="text-xs font-bold uppercase tracking-widest text-white/40 mb-6 flex items-center gap-2">
        Java Environment
      </h3>
      <div class="space-y-4">
        <div>
             <label for="java-path" class="block text-sm font-medium text-white/70 mb-2">Java Executable Path</label>
             <div class="flex gap-2">
                <input
                id="java-path"
                bind:value={settingsState.settings.java_path}
                type="text"
                class="bg-black/40 text-white flex-1 px-4 py-3 rounded-xl border border-white/10 focus:border-indigo-500/50 outline-none font-mono text-xs transition-colors"
                placeholder="e.g. java, /usr/bin/java"
                />
                <button
                onclick={() => settingsState.detectJava()}
                disabled={settingsState.isDetectingJava}
                class="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white px-4 py-2 rounded-xl border border-white/5 transition-colors whitespace-nowrap text-sm font-medium"
                >
                {settingsState.isDetectingJava ? "Detecting..." : "Auto Detect"}
                </button>
                <button
                onclick={() => settingsState.openJavaDownloadModal()}
                class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition-colors whitespace-nowrap text-sm font-medium"
                >
                Download Java
                </button>
            </div>
        </div>
      
      {#if settingsState.javaInstallations.length > 0}
        <div class="mt-4 space-y-2">
          <p class="text-[10px] text-white/30 uppercase font-bold tracking-wider">Detected Installations</p>
          {#each settingsState.javaInstallations as java}
            <button
              onclick={() => settingsState.selectJava(java.path)}
              class="w-full text-left p-3 rounded-lg border transition-all duration-200 group
              {settingsState.settings.java_path === java.path 
                ? 'bg-indigo-500/20 border-indigo-500/30' 
                : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10'}"
            >
              <div class="flex justify-between items-center">
                <div>
                  <span class="text-white font-mono text-xs font-bold">{java.version}</span>
                  <span class="text-white/40 text-[10px] ml-2">{java.is_64bit ? "64-bit" : "32-bit"}</span>
                </div>
                {#if settingsState.settings.java_path === java.path}
                  <span class="text-indigo-300 text-[10px] font-bold uppercase tracking-wider">Selected</span>
                {/if}
              </div>
              <div class="text-white/30 text-[10px] font-mono truncate mt-1 group-hover:text-white/50">{java.path}</div>
            </button>
          {/each}
        </div>
      {/if}
      </div>
    </div>

    <!-- Memory -->
    <div class="bg-black/20 p-6 rounded-2xl border border-white/5 ">
      <h3 class="text-xs font-bold uppercase tracking-widest text-white/40 mb-6 flex items-center gap-2">
        Memory Allocation (RAM)
      </h3>
      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="min-memory" class="block text-sm font-medium text-white/70 mb-2">Minimum (MB)</label>
          <input
            id="min-memory"
            bind:value={settingsState.settings.min_memory}
            type="number"
            class="bg-black/40 text-white w-full px-4 py-3 rounded-xl border border-white/10 focus:border-indigo-500/50 outline-none transition-colors"
          />
        </div>
        <div>
          <label for="max-memory" class="block text-sm font-medium text-white/70 mb-2">Maximum (MB)</label>
          <input
            id="max-memory"
            bind:value={settingsState.settings.max_memory}
            type="number"
            class="bg-black/40 text-white w-full px-4 py-3 rounded-xl border border-white/10 focus:border-indigo-500/50 outline-none transition-colors"
          />
        </div>
      </div>
    </div>

    <!-- Resolution -->
    <div class="bg-black/20 p-6 rounded-2xl border border-white/5 ">
      <h3 class="text-xs font-bold uppercase tracking-widest text-white/40 mb-6 flex items-center gap-2">
        Game Window Size
      </h3>
      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="window-width" class="block text-sm font-medium text-white/70 mb-2">Width</label>
          <input
            id="window-width"
            bind:value={settingsState.settings.width}
            type="number"
            class="bg-black/40 text-white w-full px-4 py-3 rounded-xl border border-white/10 focus:border-indigo-500/50 outline-none transition-colors"
          />
        </div>
        <div>
          <label for="window-height" class="block text-sm font-medium text-white/70 mb-2">Height</label>
          <input
            id="window-height"
            bind:value={settingsState.settings.height}
            type="number"
            class="bg-black/40 text-white w-full px-4 py-3 rounded-xl border border-white/10 focus:border-indigo-500/50 outline-none transition-colors"
          />
        </div>
      </div>
    </div>

    <!-- Download Settings -->
    <div class="bg-black/20 p-6 rounded-2xl border border-white/5 ">
        <h3 class="text-xs font-bold uppercase tracking-widest text-white/40 mb-6 flex items-center gap-2">
            Network
        </h3>
        <div>
            <label for="download-threads" class="block text-sm font-medium text-white/70 mb-2">Concurrent Download Threads</label>
            <input
              id="download-threads"
              bind:value={settingsState.settings.download_threads}
              type="number"
              min="1"
              max="128"
              class="bg-black/40 text-white w-full px-4 py-3 rounded-xl border border-white/10 focus:border-indigo-500/50 outline-none transition-colors"
            />
            <p class="text-xs text-white/30 mt-2">Higher values usually mean faster downloads but use more CPU/Network.</p>
        </div>
    </div>

    <div class="pt-4 flex justify-end">
      <button
        onclick={() => settingsState.saveSettings()}
        class="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
      >
        Save Settings
      </button>
    </div>
  </div>
</div>

<!-- Java Download Modal -->
{#if settingsState.showJavaDownloadModal}
  <div class="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm bg-black/70">
    <div class="bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl w-[900px] max-w-[95vw] h-[600px] max-h-[90vh] flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-5 border-b border-white/10">
        <h3 class="text-xl font-bold text-white">Download Java</h3>
        <button
          aria-label="Close dialog"
          onclick={() => settingsState.closeJavaDownloadModal()}
          disabled={settingsState.isDownloadingJava}
          class="text-white/40 hover:text-white/80 disabled:opacity-50 transition-colors p-1"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Main Content Area -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left Sidebar: Sources -->
        <div class="w-40 border-r border-white/10 p-3 flex flex-col gap-1">
          <span class="text-[10px] font-bold uppercase tracking-widest text-white/30 px-2 mb-2">Sources</span>
          
          <button
            disabled
            class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm opacity-40 cursor-not-allowed text-white/50"
          >
            <div class="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[10px]">M</div>
            Mojang
          </button>
          
          <button
            class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm bg-indigo-500/20 border border-indigo-500/40 text-white"
          >
            <div class="w-5 h-5 rounded bg-indigo-500 flex items-center justify-center text-[10px] font-bold">A</div>
            Adoptium
          </button>
          
          <button
            disabled
            class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm opacity-40 cursor-not-allowed text-white/50"
          >
            <div class="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[10px]">Z</div>
            Azul Zulu
          </button>
        </div>

        <!-- Center: Version Selection -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Toolbar -->
          <div class="flex items-center gap-3 p-4 border-b border-white/5">
            <!-- Search -->
            <div class="relative flex-1 max-w-xs">
              <input
                type="text"
                bind:value={settingsState.searchQuery}
                placeholder="Search versions..."
                class="w-full bg-black/30 text-white text-sm px-4 py-2 pl-9 rounded-lg border border-white/10 focus:border-indigo-500/50 outline-none"
              />
              <svg class="absolute left-3 top-2.5 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
            
            <!-- Recommended Filter -->
            <label class="flex items-center gap-2 text-sm text-white/60 cursor-pointer select-none">
              <input
                type="checkbox"
                bind:checked={settingsState.showOnlyRecommended}
                class="w-4 h-4 rounded border-white/20 bg-black/30 text-indigo-500 focus:ring-indigo-500/30"
              />
              LTS Only
            </label>

            <!-- Image Type Toggle -->
            <div class="flex items-center bg-black/30 rounded-lg p-0.5 border border-white/10">
              <button
                onclick={() => settingsState.selectedImageType = "jre"}
                class="px-3 py-1.5 rounded-md text-xs font-medium transition-all {settingsState.selectedImageType === 'jre' ? 'bg-indigo-500 text-white shadow' : 'text-white/50 hover:text-white/80'}"
              >
                JRE
              </button>
              <button
                onclick={() => settingsState.selectedImageType = "jdk"}
                class="px-3 py-1.5 rounded-md text-xs font-medium transition-all {settingsState.selectedImageType === 'jdk' ? 'bg-indigo-500 text-white shadow' : 'text-white/50 hover:text-white/80'}"
              >
                JDK
              </button>
            </div>
          </div>

          <!-- Loading State -->
          {#if settingsState.isLoadingCatalog}
            <div class="flex-1 flex items-center justify-center text-white/50">
              <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                <span class="text-sm">Loading Java versions...</span>
              </div>
            </div>
          {:else if settingsState.catalogError}
            <div class="flex-1 flex items-center justify-center text-red-400">
              <div class="flex flex-col items-center gap-3 text-center px-8">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <span class="text-sm">{settingsState.catalogError}</span>
                <button
                  onclick={() => settingsState.refreshCatalog()}
                  class="mt-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          {:else}
            <!-- Version List -->
            <div class="flex-1 overflow-auto p-4">
              <div class="space-y-2">
                {#each settingsState.availableMajorVersions as version}
                  {@const isLts = settingsState.javaCatalog?.lts_versions.includes(version)}
                  {@const isSelected = settingsState.selectedMajorVersion === version}
                  {@const releaseInfo = settingsState.javaCatalog?.releases.find(r => r.major_version === version && r.image_type === settingsState.selectedImageType)}
                  {@const isAvailable = releaseInfo?.is_available ?? false}
                  {@const installStatus = releaseInfo ? settingsState.getInstallStatus(releaseInfo) : 'download'}
                  
                  <button
                    onclick={() => settingsState.selectMajorVersion(version)}
                    disabled={!isAvailable}
                    class="w-full flex items-center gap-4 p-3 rounded-xl border transition-all text-left
                      {isSelected 
                        ? 'bg-indigo-500/20 border-indigo-500/50 ring-2 ring-indigo-500/30' 
                        : isAvailable 
                          ? 'bg-black/20 border-white/10 hover:bg-white/5 hover:border-white/20' 
                          : 'bg-black/10 border-white/5 opacity-40 cursor-not-allowed'}"
                  >
                    <!-- Version Number -->
                    <div class="w-14 text-center">
                      <span class="text-xl font-bold {isSelected ? 'text-white' : 'text-white/80'}">{version}</span>
                    </div>
                    
                    <!-- Version Details -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm text-white/70 font-mono truncate">{releaseInfo?.version ?? '--'}</span>
                        {#if isLts}
                          <span class="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded uppercase shrink-0">LTS</span>
                        {/if}
                      </div>
                      {#if releaseInfo}
                        <div class="text-[10px] text-white/40 truncate mt-0.5">
                          {releaseInfo.release_name} • {settingsState.formatBytes(releaseInfo.file_size)}
                        </div>
                      {/if}
                    </div>
                    
                    <!-- Install Status Badge -->
                    <div class="shrink-0">
                      {#if installStatus === 'installed'}
                        <span class="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded uppercase">Installed</span>
                      {:else if isAvailable}
                        <span class="px-2 py-1 bg-white/10 text-white/50 text-[10px] font-medium rounded">Download</span>
                      {:else}
                        <span class="px-2 py-1 bg-red-500/10 text-red-400/60 text-[10px] font-medium rounded">N/A</span>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Right Sidebar: Details -->
        <div class="w-64 border-l border-white/10 flex flex-col">
          <div class="p-4 border-b border-white/5">
            <span class="text-[10px] font-bold uppercase tracking-widest text-white/30">Details</span>
          </div>
          
          {#if settingsState.selectedRelease}
            <div class="flex-1 p-4 space-y-4 overflow-auto">
              <div>
                <div class="text-[10px] text-white/40 uppercase tracking-wider mb-1">Version</div>
                <div class="text-sm text-white font-mono">{settingsState.selectedRelease.version}</div>
              </div>
              
              <div>
                <div class="text-[10px] text-white/40 uppercase tracking-wider mb-1">Release Name</div>
                <div class="text-sm text-white">{settingsState.selectedRelease.release_name}</div>
              </div>
              
              <div>
                <div class="text-[10px] text-white/40 uppercase tracking-wider mb-1">Release Date</div>
                <div class="text-sm text-white">{settingsState.formatDate(settingsState.selectedRelease.release_date)}</div>
              </div>
              
              <div>
                <div class="text-[10px] text-white/40 uppercase tracking-wider mb-1">Size</div>
                <div class="text-sm text-white">{settingsState.formatBytes(settingsState.selectedRelease.file_size)}</div>
              </div>
              
              <div>
                <div class="text-[10px] text-white/40 uppercase tracking-wider mb-1">Type</div>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-white uppercase">{settingsState.selectedRelease.image_type}</span>
                  {#if settingsState.selectedRelease.is_lts}
                    <span class="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded">LTS</span>
                  {/if}
                </div>
              </div>
              
              <div>
                <div class="text-[10px] text-white/40 uppercase tracking-wider mb-1">Architecture</div>
                <div class="text-sm text-white">{settingsState.selectedRelease.architecture}</div>
              </div>
              
              {#if !settingsState.selectedRelease.is_available}
                <div class="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div class="text-xs text-red-400">Not available for your platform</div>
                </div>
              {/if}
            </div>
          {:else}
            <div class="flex-1 flex items-center justify-center text-white/30 text-sm p-4 text-center">
              Select a Java version to view details
            </div>
          {/if}
        </div>
      </div>

      <!-- Download Progress (MC Style) -->
      {#if settingsState.isDownloadingJava && settingsState.downloadProgress}
        <div class="border-t border-white/10 p-4 bg-zinc-900/90">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-white font-bold text-sm">Downloading Java</h3>
            <span class="text-xs text-zinc-400">{settingsState.downloadProgress.status}</span>
          </div>
          
          <!-- Progress Bar -->
          <div class="mb-2">
            <div class="flex justify-between text-[10px] text-zinc-400 mb-1">
              <span>{settingsState.downloadProgress.file_name}</span>
              <span>{Math.round(settingsState.downloadProgress.percentage)}%</span>
            </div>
            <div class="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
              <div 
                class="bg-gradient-to-r from-blue-500 to-cyan-400 h-2.5 rounded-full transition-all duration-200"
                style="width: {settingsState.downloadProgress.percentage}%"
              ></div>
            </div>
          </div>
          
          <!-- Speed & Stats -->
          <div class="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>
              {settingsState.formatBytes(settingsState.downloadProgress.speed_bytes_per_sec)}/s · 
              ETA: {settingsState.formatTime(settingsState.downloadProgress.eta_seconds)}
            </span>
            <span>
              {settingsState.formatBytes(settingsState.downloadProgress.downloaded_bytes)} / 
              {settingsState.formatBytes(settingsState.downloadProgress.total_bytes)}
            </span>
          </div>
        </div>
      {/if}

      <!-- Pending Downloads Alert -->
      {#if settingsState.pendingDownloads.length > 0 && !settingsState.isDownloadingJava}
        <div class="border-t border-amber-500/30 p-4 bg-amber-500/10">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <span class="text-sm text-amber-200">
                {settingsState.pendingDownloads.length} pending download(s) can be resumed
              </span>
            </div>
            <button
              onclick={() => settingsState.resumeDownloads()}
              class="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg text-sm font-medium transition-colors"
            >
              Resume All
            </button>
          </div>
        </div>
      {/if}

      <!-- Footer Actions -->
      <div class="flex items-center justify-between p-4 border-t border-white/10 bg-black/20">
        <button
          onclick={() => settingsState.refreshCatalog()}
          disabled={settingsState.isLoadingCatalog || settingsState.isDownloadingJava}
          class="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white/70 rounded-lg text-sm transition-colors"
        >
          <svg class="w-4 h-4 {settingsState.isLoadingCatalog ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>

        <div class="flex gap-3">
          {#if settingsState.isDownloadingJava}
            <button
              onclick={() => settingsState.cancelDownload()}
              class="px-5 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel Download
            </button>
          {:else}
            {@const isInstalled = settingsState.selectedRelease ? settingsState.getInstallStatus(settingsState.selectedRelease) === 'installed' : false}
            <button
              onclick={() => settingsState.closeJavaDownloadModal()}
              class="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Close
            </button>
            <button
              onclick={() => settingsState.downloadJava()}
              disabled={!settingsState.selectedRelease?.is_available || settingsState.isLoadingCatalog || isInstalled}
              class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isInstalled ? 'Already Installed' : 'Download & Install'}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

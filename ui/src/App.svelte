<script lang="ts">
  import { getVersion } from "@tauri-apps/api/app";
  import { onMount } from "svelte";
  import DownloadMonitor from "./lib/DownloadMonitor.svelte";
  import GameConsole from "./lib/GameConsole.svelte";

  let status = "Ready";
  let showConsole = false;
  let currentView = "home";
  let statusTimeout: any;
  let appVersion = "...";

  // Watch for status changes to auto-dismiss
  $: if (status !== "Ready") {
    if (statusTimeout) clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      status = "Ready";
    }, 5000);
  }

  interface Version {
    id: string;
    type: string;
    url: string;
    time: string;
    releaseTime: string;
  }

  interface Account {
    type: "Offline" | "Microsoft";
    username: string;
    uuid: string;
  }

  interface DeviceCodeResponse {
    user_code: string;
    device_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
    message?: string;
  }

  interface LauncherConfig {
    min_memory: number;
    max_memory: number;
    java_path: string;
    width: number;
    height: number;
  }

  interface JavaInstallation {
    path: string;
    version: string;
    is_64bit: boolean;
  }

  interface JavaDownloadInfo {
    version: string;
    release_name: string;
    download_url: string;
    file_name: string;
    file_size: number;
    checksum: string | null;
    image_type: string;
  }

  let versions: Version[] = [];
  let selectedVersion = "";
  let currentAccount: Account | null = null;
  let settings: LauncherConfig = {
    min_memory: 1024,
    max_memory: 2048,
    java_path: "java",
    width: 854,
    height: 480,
  };
  let javaInstallations: JavaInstallation[] = [];
  let isDetectingJava = false;

  let availableJavaVersions: number[] = [];
  let selectedJavaVersion = 21;
  let selectedImageType: "jre" | "jdk" = "jre";
  let isDownloadingJava = false;
  let javaDownloadStatus = "";
  let showJavaDownloadModal = false;

  // Login UI State
  let isLoginModalOpen = false;
  let loginMode: "select" | "offline" | "microsoft" = "select";
  let offlineUsername = "";
  let deviceCodeData: DeviceCodeResponse | null = null;
  let msLoginLoading = false;
  let msLoginStatus = "Waiting for authorization...";
  let isPollingRequestActive = false;
  
  // Components
  import Sidebar from "./components/Sidebar.svelte";
  import HomeView from "./components/HomeView.svelte";
  import VersionsView from "./components/VersionsView.svelte";
  import SettingsView from "./components/SettingsView.svelte";
  import BottomBar from "./components/BottomBar.svelte";
  import LoginModal from "./components/LoginModal.svelte";
  import StatusToast from "./components/StatusToast.svelte";

  // Stores
  import { uiState } from "./stores/ui.svelte";
  import { authState } from "./stores/auth.svelte";
  import { settingsState } from "./stores/settings.svelte";
  import { gameState } from "./stores/game.svelte";

  onMount(async () => {
    authState.checkAccount();
    settingsState.loadSettings();
    gameState.loadVersions();
    getVersion().then((v) => (uiState.appVersion = v));
  });

  async function checkAccount() {
    try {
      const acc = await invoke("get_active_account");
      currentAccount = acc as Account | null;
    } catch (e) {
      console.error("Failed to check account:", e);
    }
  }

  async function loadSettings() {
    try {
      settings = await invoke("get_settings");
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async function saveSettings() {
    try {
      await invoke("save_settings", { config: settings });
      status = "Settings saved!";
    } catch (e) {
      console.error("Failed to save settings:", e);
      status = "Error saving settings: " + e;
    }
  }

  async function detectJava() {
    isDetectingJava = true;
    try {
      javaInstallations = await invoke("detect_java");
      if (javaInstallations.length === 0) {
        status = "No Java installations found";
      } else {
        status = `Found ${javaInstallations.length} Java installation(s)`;
      }
    } catch (e) {
      console.error("Failed to detect Java:", e);
      status = "Error detecting Java: " + e;
    } finally {
      isDetectingJava = false;
    }
  }

  function selectJava(path: string) {
    settings.java_path = path;
  }

  async function openJavaDownloadModal() {
    showJavaDownloadModal = true;
    javaDownloadStatus = "";
    try {
      availableJavaVersions = await invoke("fetch_available_java_versions");
      // Default selection logic
      if (availableJavaVersions.includes(21)) {
        selectedJavaVersion = 21;
      } else if (availableJavaVersions.includes(17)) {
        selectedJavaVersion = 17;
      } else if (availableJavaVersions.length > 0) {
        selectedJavaVersion = availableJavaVersions[availableJavaVersions.length - 1];
      }
    } catch (e) {
      console.error("Failed to fetch available Java versions:", e);
      javaDownloadStatus = "Error fetching Java versions: " + e;
    }
  }

  function closeJavaDownloadModal() {
    if (!isDownloadingJava) {
      showJavaDownloadModal = false;
    }
  }

  async function downloadJava() {
    isDownloadingJava = true;
    javaDownloadStatus = `Downloading Java ${selectedJavaVersion} ${selectedImageType.toUpperCase()}...`;
    
    try {
      const result: JavaInstallation = await invoke("download_adoptium_java", {
        majorVersion: selectedJavaVersion,
        imageType: selectedImageType,
        customPath: null,
      });
      
      javaDownloadStatus = `Java ${selectedJavaVersion} installed at ${result.path}`;
      settings.java_path = result.path;
      
      await detectJava();
      
      setTimeout(() => {
        showJavaDownloadModal = false;
        status = `Java ${selectedJavaVersion} is ready to use!`;
      }, 1500);
    } catch (e) {
      console.error("Failed to download Java:", e);
      javaDownloadStatus = "Download failed: " + e;
    } finally {
      isDownloadingJava = false;
    }
  }

  // --- Auth Functions ---

  function openLoginModal() {
    if (currentAccount) {
      if (confirm("Logout " + currentAccount.username + "?")) {
        invoke("logout").then(() => (currentAccount = null));
      }
      return;
    }
    // Reset state
    isLoginModalOpen = true;
    loginMode = "select";
    offlineUsername = "";
    deviceCodeData = null;
    msLoginLoading = false;
  }

  function closeLoginModal() {
    stopPolling();
    isLoginModalOpen = false;
  }

  async function performOfflineLogin() {
    if (!offlineUsername) return;
    try {
      currentAccount = (await invoke("login_offline", {
        username: offlineUsername,
      })) as Account;
      isLoginModalOpen = false;
    } catch (e) {
      alert("Login failed: " + e);
    }
  }

  let pollInterval: any;

  // Cleanup on destroy/close
  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  async function startMicrosoftLogin() {
    loginMode = "microsoft";
    msLoginLoading = true;
    msLoginStatus = "Waiting for authorization...";
    stopPolling(); // Ensure no duplicates

    try {
      deviceCodeData = (await invoke(
        "start_microsoft_login"
      )) as DeviceCodeResponse;

      // UX Improvements: Auto Copy & Auto Open
      if (deviceCodeData) {
        try {
          await navigator.clipboard.writeText(deviceCodeData.user_code);
        } catch (e) {
          console.error("Clipboard failed", e);
        }

        openLink(deviceCodeData.verification_uri);

        // Start Polling
        console.log("Starting polling for token...");
        const intervalMs = (deviceCodeData.interval || 5) * 1000;
        pollInterval = setInterval(
          () => checkLoginStatus(deviceCodeData!.device_code),
          intervalMs
        );
      }
    } catch (e) {
      alert("Failed to start Microsoft login: " + e);
      loginMode = "select"; // Go back
    } finally {
      msLoginLoading = false;
    }
  }

  async function checkLoginStatus(deviceCode: string) {
    if (isPollingRequestActive) return;
    isPollingRequestActive = true;

    console.log("Polling Microsoft API...");
    try {
      // This will fail with "authorization_pending" until user logs in
      currentAccount = (await invoke("complete_microsoft_login", {
        deviceCode,
      })) as Account;

      // If success:
      console.log("Login Successful!", currentAccount);
      stopPolling();
      isLoginModalOpen = false;
      status = "Welcome back, " + currentAccount.username;
    } catch (e: any) {
      const errStr = e.toString();
      if (errStr.includes("authorization_pending")) {
        console.log("Status: Waiting for user to authorize...");
        // Keep checking
      } else {
        // Real error
        console.error("Polling Error:", errStr);
        msLoginStatus = "Error: " + errStr;
        
        // Optional: Stop polling on fatal errors?
        // expired_token should stop it.
        if (
          errStr.includes("expired_token") ||
          errStr.includes("access_denied")
        ) {
          stopPolling();
          alert("Login failed: " + errStr);
          loginMode = "select";
        }
      }
    } finally {
      isPollingRequestActive = false;
    }
  }

  // Clean up manual button to just be a status indicator or 'Retry Now'
  async function completeMicrosoftLogin() {
    if (deviceCodeData) checkLoginStatus(deviceCodeData.device_code);
  }

  function openLink(url: string) {
    open(url);
  }

  async function startGame() {
    if (!currentAccount) {
      alert("Please login first!");
      openLoginModal();
      return;
    }

    if (!selectedVersion) {
      alert("Please select a version!");
      return;
    }

    status = "Preparing to launch " + selectedVersion + "...";
    console.log("Invoking start_game for version:", selectedVersion);
    try {
      const msg = await invoke("start_game", { versionId: selectedVersion });
      console.log("Response:", msg);
      status = msg as string;
    } catch (e) {
      console.error(e);
      status = "Error: " + e;
    }
  }
</script>

<div
  class="flex h-screen bg-zinc-900 text-white font-sans overflow-hidden select-none"
>
  <Sidebar />

  <!-- Main Content -->
  <main class="flex-1 flex flex-col relative min-w-0">
    <DownloadMonitor />
    <!-- Top Bar (Window Controls Placeholder) -->
    <div
      class="h-8 w-full bg-zinc-900/50 absolute top-0 left-0 z-50 drag-region"
      data-tauri-drag-region
    >
      <!-- Windows/macOS controls would go here or be handled by OS -->
    </div>

    <!-- Background / Poster area -->
    <div class="flex-1 relative overflow-hidden group">
      {#if currentView === "home"}
        <!-- Background Image - Using gradient fallback -->
        <div
          class="absolute inset-0 z-0 opacity-60 bg-gradient-to-br from-emerald-900 via-zinc-900 to-indigo-950 transition-transform duration-[10s] ease-linear group-hover:scale-105"
        ></div>
        <div
          class="absolute inset-0 z-0 bg-gradient-to-t from-zinc-900 via-transparent to-black/50"
        ></div>

        <div class="absolute bottom-24 left-8 z-10 p-4">
          <h1
            class="text-6xl font-black mb-2 tracking-tight text-white drop-shadow-lg"
          >
            MINECRAFT
          </h1>
          <div class="flex items-center gap-2 text-zinc-300">
            <span
              class="bg-zinc-800 text-xs px-2 py-1 rounded border border-zinc-600"
              >JAVA EDITION</span
            >
            <span class="text-lg">Release 1.20.4</span>
          </div>
        </div>
      {:else if currentView === "versions"}
        <div class="p-8 h-full overflow-y-auto bg-zinc-900">
          <h2 class="text-3xl font-bold mb-6">Versions</h2>
          <div class="grid gap-2">
            {#if versions.length === 0}
              <div class="text-zinc-500">Loading versions...</div>
            {:else}
              {#each versions as version}
                <button
                  class="flex items-center justify-between p-4 bg-zinc-800 rounded hover:bg-zinc-700 transition text-left border border-zinc-700 {selectedVersion ===
                  version.id
                    ? 'border-green-500 bg-zinc-800/80 ring-1 ring-green-500'
                    : ''}"
                  onclick={() => (selectedVersion = version.id)}
                >
                  <div>
                    <div class="font-bold font-mono text-lg">{version.id}</div>
                    <div class="text-xs text-zinc-400 capitalize">
                      {version.type} • {new Date(
                        version.releaseTime
                      ).toLocaleDateString()}
                    </div>
                  </div>
                  {#if selectedVersion === version.id}
                    <div class="text-green-500 font-bold text-sm">SELECTED</div>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>
      {:else if currentView === "settings"}
        <div class="p-8 bg-zinc-900 h-full overflow-y-auto">
          <h2 class="text-3xl font-bold mb-8">Settings</h2>

          <div class="space-y-6 max-w-2xl">
            <!-- Java Path -->
            <div class="bg-zinc-800/50 p-6 rounded-lg border border-zinc-700">
              <label
                class="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide"
                >Java Executable Path</label
              >
              <div class="flex gap-2">
                <input
                  bind:value={settings.java_path}
                  type="text"
                  class="bg-zinc-950 text-white flex-1 p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none font-mono text-sm"
                  placeholder="e.g. java, /usr/bin/java"
                />
                <button
                  onclick={detectJava}
                  disabled={isDetectingJava}
                  class="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-4 py-2 rounded transition-colors whitespace-nowrap"
                >
                  {isDetectingJava ? "Detecting..." : "Auto Detect"}
                </button>
                <button
                  onclick={openJavaDownloadModal}
                  class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded transition-colors whitespace-nowrap"
                >
                  Download Java
                </button>
              </div>
              
              {#if javaInstallations.length > 0}
                <div class="mt-4 space-y-2">
                  <p class="text-xs text-zinc-400 uppercase font-bold">Detected Java Installations:</p>
                  {#each javaInstallations as java}
                    <button
                      onclick={() => selectJava(java.path)}
                      class="w-full text-left p-3 bg-zinc-950 rounded border transition-colors {settings.java_path === java.path ? 'border-indigo-500 bg-indigo-950/30' : 'border-zinc-700 hover:border-zinc-500'}"
                    >
                      <div class="flex justify-between items-center">
                        <div>
                          <span class="text-white font-mono text-sm">{java.version}</span>
                          <span class="text-zinc-500 text-xs ml-2">{java.is_64bit ? "64-bit" : "32-bit"}</span>
                        </div>
                        {#if settings.java_path === java.path}
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
              <label
                class="block text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wide"
                >Memory Allocation (RAM)</label
              >

              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label class="block text-xs text-zinc-500 mb-1"
                    >Minimum (MB)</label
                  >
                  <input
                    bind:value={settings.min_memory}
                    type="number"
                    class="bg-zinc-950 text-white w-full p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs text-zinc-500 mb-1"
                    >Maximum (MB)</label
                  >
                  <input
                    bind:value={settings.max_memory}
                    type="number"
                    class="bg-zinc-950 text-white w-full p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <!-- Resolution -->
            <div class="bg-zinc-800/50 p-6 rounded-lg border border-zinc-700">
              <label
                class="block text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wide"
                >Game Window Size</label
              >
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label class="block text-xs text-zinc-500 mb-1">Width</label>
                  <input
                    bind:value={settings.width}
                    type="number"
                    class="bg-zinc-950 text-white w-full p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label class="block text-xs text-zinc-500 mb-1">Height</label>
                  <input
                    bind:value={settings.height}
                    type="number"
                    class="bg-zinc-950 text-white w-full p-3 rounded border border-zinc-700 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div class="pt-4">
              <button
                onclick={saveSettings}
                class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded shadow-lg transition-transform active:scale-95"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      {#if uiState.currentView === "home"}
        <HomeView />
      {:else if uiState.currentView === "versions"}
        <VersionsView />
      {:else if uiState.currentView === "settings"}
        <SettingsView />
      {/if}
    </div>

    <BottomBar />
  </main>

  <!-- Login Modal -->
  {#if isLoginModalOpen}
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div
        class="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-0 duration-200"
      >
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold text-white">Login</h2>
          <button
            onclick={closeLoginModal}
            class="text-zinc-500 hover:text-white transition group"
          >
            ✕
          </button>
        </div>

        {#if loginMode === "select"}
          <div class="space-y-4">
            <button
              onclick={startMicrosoftLogin}
              class="w-full flex items-center justify-center gap-3 bg-[#2F2F2F] hover:bg-[#3F3F3F] text-white p-4 rounded-lg font-bold border border-transparent hover:border-zinc-500 transition-all group"
            >
              <!-- Microsoft Logo SVG -->
              <svg
                class="w-5 h-5"
                viewBox="0 0 23 23"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                ><path fill="#f35325" d="M1 1h10v10H1z" /><path
                  fill="#81bc06"
                  d="M12 1h10v10H12z"
                /><path fill="#05a6f0" d="M1 12h10v10H1z" /><path
                  fill="#ffba08"
                  d="M12 12h10v10H12z"
                /></svg
              >
              Microsoft Account
            </button>

            <div class="relative py-2">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-zinc-700"></div>
              </div>
              <div class="relative flex justify-center text-xs uppercase">
                <span class="bg-zinc-900 px-2 text-zinc-500">OR</span>
              </div>
            </div>

            <div class="space-y-2">
              <input
                type="text"
                bind:value={offlineUsername}
                placeholder="Offline Username"
                class="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-white focus:border-indigo-500 outline-none"
                onkeydown={(e) => e.key === "Enter" && performOfflineLogin()}
              />
              <button
                onclick={performOfflineLogin}
                class="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-3 rounded font-medium transition-colors"
              >
                Offline Login
              </button>
            </div>
          </div>
        {:else if loginMode === "microsoft"}
          <div class="text-center">
            {#if msLoginLoading && !deviceCodeData}
              <div class="py-8 text-zinc-400 animate-pulse">
                Starting login flow...
              </div>
            {:else if deviceCodeData}
              <div class="space-y-4">
                <p class="text-sm text-zinc-400">1. Go to this URL:</p>
                <button
                  onclick={() =>
                    deviceCodeData && openLink(deviceCodeData.verification_uri)}
                  class="text-indigo-400 hover:text-indigo-300 underline break-all font-mono text-sm"
                >
                  {deviceCodeData.verification_uri}
                </button>

                <p class="text-sm text-zinc-400 mt-2">2. Enter this code:</p>
                <div
                  class="bg-zinc-950 p-4 rounded border border-zinc-700 font-mono text-2xl tracking-widest text-center select-all cursor-pointer hover:border-indigo-500 transition-colors"
                  onclick={() =>
                    navigator.clipboard.writeText(
                      deviceCodeData?.user_code || ""
                    )}
                >
                  {deviceCodeData.user_code}
                </div>
                <p class="text-xs text-zinc-500">Click code to copy</p>

                <div class="pt-6 space-y-3">
                     <div class="flex flex-col items-center gap-3">
                         <div class="animate-spin rounded-full h-6 w-6 border-2 border-zinc-600 border-t-indigo-500"></div>
                         <span class="text-sm text-zinc-400 font-medium break-all text-center">{msLoginStatus}</span>
                     </div>
                     <p class="text-xs text-zinc-600">This window will update automatically.</p>
                </div>
                
                <button
                  onclick={() => { stopPolling(); loginMode = "select"; }}
                  class="text-xs text-zinc-500 hover:text-zinc-300 mt-6 underline"
                  >Cancel</button
                >
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Overlay Status (Toast) -->
  {#if status !== "Ready"}
    <div
      class="absolute top-12 right-12 bg-zinc-800/90 backdrop-blur border border-zinc-600 p-4 rounded-lg shadow-2xl max-w-sm animate-in fade-in slide-in-from-top-4 duration-300 z-50 group"
    >
      <div class="flex justify-between items-start mb-1">
        <div class="text-xs text-zinc-400 uppercase font-bold">Status</div>
        <button
          onclick={() => (status = "Ready")}
          class="text-zinc-500 hover:text-white transition -mt-1 -mr-1 p-1"
        >
          ✕
        </button>
      </div>
      <div class="font-mono text-sm whitespace-pre-wrap mb-2">{status}</div>
      <div class="w-full bg-zinc-700/50 h-1 rounded-full overflow-hidden">
        <div
          class="h-full bg-indigo-500 animate-[progress_5s_linear_forwards] origin-left w-full"
        ></div>
      </div>
    </div>
  {/if}

  {#if showJavaDownloadModal}
    <div
      class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm"
      onclick={closeJavaDownloadModal}
    >
      <div
        class="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-bold">Download Java (Adoptium)</h3>
          {#if !isDownloadingJava}
            <button
              onclick={closeJavaDownloadModal}
              class="text-zinc-500 hover:text-white transition text-xl"
            >
              ✕
            </button>
          {/if}
        </div>
        <div class="space-y-4">
          <!-- Version Selection -->
          <div>
            <label class="block text-sm font-bold text-zinc-400 mb-2">Java Version</label>
            <select
              bind:value={selectedJavaVersion}
              disabled={isDownloadingJava}
              class="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-white focus:border-indigo-500 outline-none disabled:opacity-50"
            >
              {#each availableJavaVersions as ver}
                <option value={ver}>
                  Java {ver} {ver === 21 ? "(Recommended)" : ver === 17 ? "(LTS)" : ver === 8 ? "(Legacy)" : ""}
                </option>
              {/each}
            </select>
            <p class="text-xs text-zinc-500 mt-1">
              MC 1.20.5+ requires Java 21, MC 1.17-1.20.4 requires Java 17, older versions require Java 8
            </p>
          </div>

          <!-- Image Type Selection -->
          <div>
            <label class="block text-sm font-bold text-zinc-400 mb-2">Type</label>
            <div class="flex gap-3">
              <button
                onclick={() => selectedImageType = "jre"}
                disabled={isDownloadingJava}
                class="flex-1 p-3 rounded border transition-colors disabled:opacity-50 {selectedImageType === 'jre' ? 'border-indigo-500 bg-indigo-950/30 text-white' : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500'}"
              >
                <div class="font-bold">JRE</div>
                <div class="text-xs opacity-70">runtime environment</div>
              </button>
              <button
                onclick={() => selectedImageType = "jdk"}
                disabled={isDownloadingJava}
                class="flex-1 p-3 rounded border transition-colors disabled:opacity-50 {selectedImageType === 'jdk' ? 'border-indigo-500 bg-indigo-950/30 text-white' : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500'}"
              >
                <div class="font-bold">JDK</div>
                <div class="text-xs opacity-70">development kit</div>
              </button>
            </div>
          </div>

          <!-- Status -->
          {#if javaDownloadStatus}
            <div class="p-3 rounded {javaDownloadStatus.startsWith('✓') ? 'bg-green-950/50 border border-green-700 text-green-400' : javaDownloadStatus.includes('failed') || javaDownloadStatus.includes('Failed') ? 'bg-red-950/50 border border-red-700 text-red-400' : 'bg-zinc-800 border border-zinc-700 text-zinc-300'}">
              <p class="text-sm">{javaDownloadStatus}</p>
            </div>
          {/if}

          <!-- Download Button -->
          <button
            onclick={downloadJava}
            disabled={isDownloadingJava || availableJavaVersions.length === 0}
            class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded font-bold transition-colors flex items-center justify-center gap-2"
          >
            {#if isDownloadingJava}
              <div class="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
              Downloading...
            {:else}
              Download Java {selectedJavaVersion} {selectedImageType.toUpperCase()}
            {/if}
          </button>

          <p class="text-xs text-zinc-500 text-center">
            Provided by <a href="https://adoptium.net" class="text-indigo-400 hover:underline" onclick={(e) => { e.preventDefault(); openLink("https://adoptium.net"); }}>Eclipse Adoptium</a>
          </p>
        </div>
      </div>
    </div>
  {/if}

  <style>
    @keyframes progress {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }
  </style>
  <LoginModal />
  <StatusToast />

  <GameConsole visible={uiState.showConsole} />
</div>

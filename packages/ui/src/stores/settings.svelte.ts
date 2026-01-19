import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  JavaCatalog,
  JavaDownloadProgress,
  JavaDownloadSource,
  JavaInstallation,
  JavaReleaseInfo,
  LauncherConfig,
  ModelInfo,
  PendingJavaDownload,
} from "../types";
import { uiState } from "./ui.svelte";

export class SettingsState {
  settings = $state<LauncherConfig>({
    min_memory: 1024,
    max_memory: 2048,
    java_path: "java",
    width: 854,
    height: 480,
    download_threads: 32,
    enable_gpu_acceleration: false,
    enable_visual_effects: true,
    active_effect: "constellation",
    theme: "dark",
    custom_background_path: undefined,
    log_upload_service: "paste.rs",
    pastebin_api_key: undefined,
    assistant: {
      enabled: true,
      llm_provider: "ollama",
      ollama_endpoint: "http://localhost:11434",
      ollama_model: "llama3",
      openai_api_key: undefined,
      openai_endpoint: "https://api.openai.com/v1",
      openai_model: "gpt-3.5-turbo",
      system_prompt:
        "You are a helpful Minecraft expert assistant. You help players with game issues, mod installation, performance optimization, and gameplay tips. Analyze any game logs provided and give concise, actionable advice.",
      response_language: "auto",
      tts_enabled: false,
      tts_provider: "disabled",
    },
    use_shared_caches: false,
    keep_legacy_per_instance_storage: true,
    feature_flags: {
      demo_user: false,
      quick_play_enabled: false,
      quick_play_path: undefined,
      quick_play_singleplayer: true,
      quick_play_multiplayer_server: undefined,
    },
  });

  // Convert background path to proper asset URL
  get backgroundUrl(): string | undefined {
    if (this.settings.custom_background_path) {
      return convertFileSrc(this.settings.custom_background_path);
    }
    return undefined;
  }
  javaInstallations = $state<JavaInstallation[]>([]);
  isDetectingJava = $state(false);

  // Java download modal state
  showJavaDownloadModal = $state(false);
  selectedDownloadSource = $state<JavaDownloadSource>("adoptium");

  // Java catalog state
  javaCatalog = $state<JavaCatalog | null>(null);
  isLoadingCatalog = $state(false);
  catalogError = $state("");

  // Version selection state
  selectedMajorVersion = $state<number | null>(null);
  selectedImageType = $state<"jre" | "jdk">("jre");
  showOnlyRecommended = $state(true);
  searchQuery = $state("");

  // Download progress state
  isDownloadingJava = $state(false);
  downloadProgress = $state<JavaDownloadProgress | null>(null);
  javaDownloadStatus = $state("");

  // Pending downloads
  pendingDownloads = $state<PendingJavaDownload[]>([]);

  // AI Model lists
  ollamaModels = $state<ModelInfo[]>([]);
  openaiModels = $state<ModelInfo[]>([]);
  isLoadingOllamaModels = $state(false);
  isLoadingOpenaiModels = $state(false);
  ollamaModelsError = $state("");
  openaiModelsError = $state("");

  // Config Editor state
  showConfigEditor = $state(false);
  rawConfigContent = $state("");
  configFilePath = $state("");
  configEditorError = $state("");

  // Event listener cleanup
  private progressUnlisten: UnlistenFn | null = null;

  async openConfigEditor() {
    this.configEditorError = "";
    try {
      const path = await invoke<string>("get_config_path");
      const content = await invoke<string>("read_raw_config");
      this.configFilePath = path;
      this.rawConfigContent = content;
      this.showConfigEditor = true;
    } catch (e) {
      console.error("Failed to open config editor:", e);
      uiState.setStatus(`Failed to open config: ${e}`);
    }
  }

  async saveRawConfig(content: string, closeAfterSave = true) {
    try {
      await invoke("save_raw_config", { content });
      // Reload settings to ensure UI is in sync
      await this.loadSettings();
      if (closeAfterSave) {
        this.showConfigEditor = false;
      }
      uiState.setStatus("Configuration saved successfully!");
    } catch (e) {
      console.error("Failed to save config:", e);
      this.configEditorError = String(e);
    }
  }

  closeConfigEditor() {
    this.showConfigEditor = false;
    this.rawConfigContent = "";
    this.configEditorError = "";
  }

  // Computed: filtered releases based on selection
  get filteredReleases(): JavaReleaseInfo[] {
    if (!this.javaCatalog) return [];

    let releases = this.javaCatalog.releases;

    // Filter by major version if selected
    if (this.selectedMajorVersion !== null) {
      releases = releases.filter((r) => r.major_version === this.selectedMajorVersion);
    }

    // Filter by image type
    releases = releases.filter((r) => r.image_type === this.selectedImageType);

    // Filter by recommended (LTS) versions
    if (this.showOnlyRecommended) {
      releases = releases.filter((r) => r.is_lts);
    }

    // Filter by search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      releases = releases.filter(
        (r) =>
          r.release_name.toLowerCase().includes(query) ||
          r.version.toLowerCase().includes(query) ||
          r.major_version.toString().includes(query),
      );
    }

    return releases;
  }

  // Computed: available major versions for display
  get availableMajorVersions(): number[] {
    if (!this.javaCatalog) return [];
    let versions = [...this.javaCatalog.available_major_versions];

    // Filter by LTS if showOnlyRecommended is enabled
    if (this.showOnlyRecommended) {
      versions = versions.filter((v) => this.javaCatalog!.lts_versions.includes(v));
    }

    // Sort descending (newest first)
    return versions.sort((a, b) => b - a);
  }

  // Get installation status for a release: 'installed' | 'download'
  getInstallStatus(release: JavaReleaseInfo): "installed" | "download" {
    // Find installed Java that matches the major version and image type (by path pattern)
    const matchingInstallations = this.javaInstallations.filter((inst) => {
      // Check if this is a DropOut-managed Java (path contains temurin-XX-jre/jdk pattern)
      const pathLower = inst.path.toLowerCase();
      const pattern = `temurin-${release.major_version}-${release.image_type}`;
      return pathLower.includes(pattern);
    });

    // If any matching installation exists, it's installed
    return matchingInstallations.length > 0 ? "installed" : "download";
  }

  // Computed: selected release details
  get selectedRelease(): JavaReleaseInfo | null {
    if (!this.javaCatalog || this.selectedMajorVersion === null) return null;
    return (
      this.javaCatalog.releases.find(
        (r) =>
          r.major_version === this.selectedMajorVersion && r.image_type === this.selectedImageType,
      ) || null
    );
  }

  async loadSettings() {
    try {
      const result = await invoke<LauncherConfig>("get_settings");
      this.settings = result;
      // Force dark mode
      if (this.settings.theme !== "dark") {
        this.settings.theme = "dark";
        this.saveSettings();
      }
      // Ensure custom_background_path is reactive
      if (!this.settings.custom_background_path) {
        this.settings.custom_background_path = undefined;
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async saveSettings() {
    try {
      // Ensure we clean up any invalid paths before saving
      if (this.settings.custom_background_path === "") {
        this.settings.custom_background_path = undefined;
      }

      await invoke("save_settings", { config: this.settings });
      uiState.setStatus("Settings saved!");
    } catch (e) {
      console.error("Failed to save settings:", e);
      uiState.setStatus("Error saving settings: " + e);
    }
  }

  async detectJava() {
    this.isDetectingJava = true;
    try {
      this.javaInstallations = await invoke("detect_java");
      if (this.javaInstallations.length === 0) {
        uiState.setStatus("No Java installations found");
      } else {
        uiState.setStatus(`Found ${this.javaInstallations.length} Java installation(s)`);
      }
    } catch (e) {
      console.error("Failed to detect Java:", e);
      uiState.setStatus("Error detecting Java: " + e);
    } finally {
      this.isDetectingJava = false;
    }
  }

  selectJava(path: string) {
    this.settings.java_path = path;
  }

  async openJavaDownloadModal() {
    this.showJavaDownloadModal = true;
    this.javaDownloadStatus = "";
    this.catalogError = "";
    this.downloadProgress = null;

    // Setup progress event listener
    await this.setupProgressListener();

    // Load catalog
    await this.loadJavaCatalog(false);

    // Check for pending downloads
    await this.loadPendingDownloads();
  }

  async closeJavaDownloadModal() {
    if (!this.isDownloadingJava) {
      this.showJavaDownloadModal = false;
      // Cleanup listener
      if (this.progressUnlisten) {
        this.progressUnlisten();
        this.progressUnlisten = null;
      }
    }
  }

  private async setupProgressListener() {
    if (this.progressUnlisten) {
      this.progressUnlisten();
    }

    this.progressUnlisten = await listen<JavaDownloadProgress>(
      "java-download-progress",
      (event) => {
        this.downloadProgress = event.payload;
        this.javaDownloadStatus = event.payload.status;

        if (event.payload.status === "Completed") {
          this.isDownloadingJava = false;
          setTimeout(async () => {
            await this.detectJava();
            uiState.setStatus(`Java installed successfully!`);
          }, 500);
        } else if (event.payload.status === "Error") {
          this.isDownloadingJava = false;
        }
      },
    );
  }

  async loadJavaCatalog(forceRefresh: boolean) {
    this.isLoadingCatalog = true;
    this.catalogError = "";

    try {
      const command = forceRefresh ? "refresh_java_catalog" : "fetch_java_catalog";
      this.javaCatalog = await invoke<JavaCatalog>(command);

      // Auto-select first LTS version
      if (this.selectedMajorVersion === null && this.javaCatalog.lts_versions.length > 0) {
        // Select most recent LTS (21 or highest)
        const ltsVersions = [...this.javaCatalog.lts_versions].sort((a, b) => b - a);
        this.selectedMajorVersion = ltsVersions[0];
      }
    } catch (e) {
      console.error("Failed to load Java catalog:", e);
      this.catalogError = `Failed to load Java catalog: ${e}`;
    } finally {
      this.isLoadingCatalog = false;
    }
  }

  async refreshCatalog() {
    await this.loadJavaCatalog(true);
    uiState.setStatus("Java catalog refreshed");
  }

  async loadPendingDownloads() {
    try {
      this.pendingDownloads = await invoke<PendingJavaDownload[]>("get_pending_java_downloads");
    } catch (e) {
      console.error("Failed to load pending downloads:", e);
    }
  }

  selectMajorVersion(version: number) {
    this.selectedMajorVersion = version;
  }

  async downloadJava() {
    if (!this.selectedRelease || !this.selectedRelease.is_available) {
      uiState.setStatus("Selected Java version is not available for this platform");
      return;
    }

    this.isDownloadingJava = true;
    this.javaDownloadStatus = "Starting download...";
    this.downloadProgress = null;

    try {
      const result: JavaInstallation = await invoke("download_adoptium_java", {
        majorVersion: this.selectedMajorVersion,
        imageType: this.selectedImageType,
        customPath: null,
      });

      this.settings.java_path = result.path;
      await this.detectJava();

      setTimeout(() => {
        this.showJavaDownloadModal = false;
        uiState.setStatus(`Java ${this.selectedMajorVersion} is ready to use!`);
      }, 1500);
    } catch (e) {
      console.error("Failed to download Java:", e);
      this.javaDownloadStatus = `Download failed: ${e}`;
    } finally {
      this.isDownloadingJava = false;
    }
  }

  async cancelDownload() {
    try {
      await invoke("cancel_java_download");
      this.isDownloadingJava = false;
      this.javaDownloadStatus = "Download cancelled";
      this.downloadProgress = null;
      await this.loadPendingDownloads();
    } catch (e) {
      console.error("Failed to cancel download:", e);
    }
  }

  async resumeDownloads() {
    if (this.pendingDownloads.length === 0) return;

    this.isDownloadingJava = true;
    this.javaDownloadStatus = "Resuming download...";

    try {
      const installed = await invoke<JavaInstallation[]>("resume_java_downloads");
      if (installed.length > 0) {
        this.settings.java_path = installed[0].path;
        await this.detectJava();
        uiState.setStatus(`Resumed and installed ${installed.length} Java version(s)`);
      }
      await this.loadPendingDownloads();
    } catch (e) {
      console.error("Failed to resume downloads:", e);
      this.javaDownloadStatus = `Resume failed: ${e}`;
    } finally {
      this.isDownloadingJava = false;
    }
  }

  // Format bytes to human readable
  formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  // Format seconds to human readable
  formatTime(seconds: number): string {
    if (seconds === 0 || !isFinite(seconds)) return "--";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  // Format date string
  formatDate(dateStr: string | null): string {
    if (!dateStr) return "--";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return "--";
    }
  }

  // Legacy compatibility
  get availableJavaVersions(): number[] {
    return this.availableMajorVersions;
  }

  // AI Model loading methods
  async loadOllamaModels() {
    this.isLoadingOllamaModels = true;
    this.ollamaModelsError = "";

    try {
      const models = await invoke<ModelInfo[]>("list_ollama_models", {
        endpoint: this.settings.assistant.ollama_endpoint,
      });
      this.ollamaModels = models;

      // If no model is selected or selected model isn't available, select the first one
      if (models.length > 0) {
        const currentModel = this.settings.assistant.ollama_model;
        const modelExists = models.some((m) => m.id === currentModel);
        if (!modelExists) {
          this.settings.assistant.ollama_model = models[0].id;
        }
      }
    } catch (e) {
      console.error("Failed to load Ollama models:", e);
      this.ollamaModelsError = String(e);
      this.ollamaModels = [];
    } finally {
      this.isLoadingOllamaModels = false;
    }
  }

  async loadOpenaiModels() {
    if (!this.settings.assistant.openai_api_key) {
      this.openaiModelsError = "API key required";
      this.openaiModels = [];
      return;
    }

    this.isLoadingOpenaiModels = true;
    this.openaiModelsError = "";

    try {
      const models = await invoke<ModelInfo[]>("list_openai_models");
      this.openaiModels = models;

      // If no model is selected or selected model isn't available, select the first one
      if (models.length > 0) {
        const currentModel = this.settings.assistant.openai_model;
        const modelExists = models.some((m) => m.id === currentModel);
        if (!modelExists) {
          this.settings.assistant.openai_model = models[0].id;
        }
      }
    } catch (e) {
      console.error("Failed to load OpenAI models:", e);
      this.openaiModelsError = String(e);
      this.openaiModels = [];
    } finally {
      this.isLoadingOpenaiModels = false;
    }
  }

  // Computed: get model options for current provider
  get currentModelOptions(): { value: string; label: string; details?: string }[] {
    const provider = this.settings.assistant.llm_provider;

    if (provider === "ollama") {
      if (this.ollamaModels.length === 0) {
        // Return fallback options if no models loaded
        return [
          { value: "llama3", label: "Llama 3" },
          { value: "llama3.1", label: "Llama 3.1" },
          { value: "llama3.2", label: "Llama 3.2" },
          { value: "mistral", label: "Mistral" },
          { value: "gemma2", label: "Gemma 2" },
          { value: "qwen2.5", label: "Qwen 2.5" },
          { value: "phi3", label: "Phi-3" },
          { value: "codellama", label: "Code Llama" },
        ];
      }
      return this.ollamaModels.map((m) => ({
        value: m.id,
        label: m.name,
        details: m.size ? `${m.size}${m.details ? ` - ${m.details}` : ""}` : m.details,
      }));
    } else if (provider === "openai") {
      if (this.openaiModels.length === 0) {
        // Return fallback options if no models loaded
        return [
          { value: "gpt-4o", label: "GPT-4o" },
          { value: "gpt-4o-mini", label: "GPT-4o Mini" },
          { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
          { value: "gpt-4", label: "GPT-4" },
          { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
        ];
      }
      return this.openaiModels.map((m) => ({
        value: m.id,
        label: m.name,
        details: m.details,
      }));
    }

    return [];
  }
}

export const settingsState = new SettingsState();

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { create } from "zustand";
import { downloadAdoptiumJava } from "@/client";
import type { ModelInfo } from "../types/bindings/assistant";
import type { LauncherConfig } from "../types/bindings/config";
import type {
  JavaDownloadProgress,
  PendingJavaDownload,
} from "../types/bindings/downloader";
import type {
  JavaCatalog,
  JavaInstallation,
  JavaReleaseInfo,
} from "../types/bindings/java";

type JavaDownloadSource = "adoptium" | "mojang" | "azul";

/**
 * State shape for settings store.
 *
 * Note: Uses camelCase naming to match ts-rs generated bindings (which now use
 * `serde(rename_all = "camelCase")`). When reading raw binding objects from
 * invoke, convert/mapping should be applied where necessary.
 */
interface SettingsState {
  // State
  settings: LauncherConfig;
  javaInstallations: JavaInstallation[];
  isDetectingJava: boolean;
  showJavaDownloadModal: boolean;
  selectedDownloadSource: JavaDownloadSource;
  javaCatalog: JavaCatalog | null;
  isLoadingCatalog: boolean;
  catalogError: string;
  selectedMajorVersion: number | null;
  selectedImageType: "jre" | "jdk";
  showOnlyRecommended: boolean;
  searchQuery: string;
  isDownloadingJava: boolean;
  downloadProgress: JavaDownloadProgress | null;
  javaDownloadStatus: string;
  pendingDownloads: PendingJavaDownload[];
  ollamaModels: ModelInfo[];
  openaiModels: ModelInfo[];
  isLoadingOllamaModels: boolean;
  isLoadingOpenaiModels: boolean;
  ollamaModelsError: string;
  openaiModelsError: string;
  showConfigEditor: boolean;
  rawConfigContent: string;
  configFilePath: string;
  configEditorError: string;

  // Computed / derived
  backgroundUrl: string | undefined;
  filteredReleases: JavaReleaseInfo[];
  availableMajorVersions: number[];
  installStatus: (
    version: number,
    imageType: string,
  ) => "installed" | "downloading" | "available";
  selectedRelease: JavaReleaseInfo | null;
  currentModelOptions: Array<{
    value: string;
    label: string;
    details?: string;
  }>;

  // Actions
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  // compatibility helper to mirror the older set({ key: value }) usage
  set: (patch: Partial<Record<string, unknown>>) => void;

  detectJava: () => Promise<void>;
  selectJava: (path: string) => void;

  openJavaDownloadModal: () => Promise<void>;
  closeJavaDownloadModal: () => void;
  loadJavaCatalog: (forceRefresh: boolean) => Promise<void>;
  refreshCatalog: () => Promise<void>;
  loadPendingDownloads: () => Promise<void>;
  selectMajorVersion: (version: number) => void;
  downloadJava: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  resumeDownloads: () => Promise<void>;

  openConfigEditor: () => Promise<void>;
  closeConfigEditor: () => void;
  saveRawConfig: () => Promise<void>;

  loadOllamaModels: () => Promise<void>;
  loadOpenaiModels: () => Promise<void>;

  setSetting: <K extends keyof LauncherConfig>(
    key: K,
    value: LauncherConfig[K],
  ) => void;
  setAssistantSetting: <K extends keyof LauncherConfig["assistant"]>(
    key: K,
    value: LauncherConfig["assistant"][K],
  ) => void;
  setFeatureFlag: <K extends keyof LauncherConfig["featureFlags"]>(
    key: K,
    value: LauncherConfig["featureFlags"][K],
  ) => void;

  // Private
  progressUnlisten: UnlistenFn | null;
}

/**
 * Default settings (camelCase) — lightweight defaults used until `get_settings`
 * returns real values.
 */
const defaultSettings: LauncherConfig = {
  minMemory: 1024,
  maxMemory: 2048,
  javaPath: "java",
  width: 854,
  height: 480,
  downloadThreads: 32,
  enableGpuAcceleration: false,
  enableVisualEffects: true,
  activeEffect: "constellation",
  theme: "dark",
  customBackgroundPath: null,
  logUploadService: "paste.rs",
  pastebinApiKey: null,
  assistant: {
    enabled: true,
    llmProvider: "ollama",
    ollamaEndpoint: "http://localhost:11434",
    ollamaModel: "llama3",
    openaiApiKey: null,
    openaiEndpoint: "https://api.openai.com/v1",
    openaiModel: "gpt-3.5-turbo",
    systemPrompt:
      "You are a helpful Minecraft expert assistant. You help players with game issues, mod installation, performance optimization, and gameplay tips. Analyze any game logs provided and give concise, actionable advice.",
    responseLanguage: "auto",
    ttsEnabled: false,
    ttsProvider: "disabled",
  },
  useSharedCaches: false,
  keepLegacyPerInstanceStorage: true,
  featureFlags: {
    demoUser: false,
    quickPlayEnabled: false,
    quickPlayPath: null,
    quickPlaySingleplayer: true,
    quickPlayMultiplayerServer: null,
  },
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // initial state
  settings: defaultSettings,
  javaInstallations: [],
  isDetectingJava: false,
  showJavaDownloadModal: false,
  selectedDownloadSource: "adoptium",
  javaCatalog: null,
  isLoadingCatalog: false,
  catalogError: "",
  selectedMajorVersion: null,
  selectedImageType: "jre",
  showOnlyRecommended: true,
  searchQuery: "",
  isDownloadingJava: false,
  downloadProgress: null,
  javaDownloadStatus: "",
  pendingDownloads: [],
  ollamaModels: [],
  openaiModels: [],
  isLoadingOllamaModels: false,
  isLoadingOpenaiModels: false,
  ollamaModelsError: "",
  openaiModelsError: "",
  showConfigEditor: false,
  rawConfigContent: "",
  configFilePath: "",
  configEditorError: "",
  progressUnlisten: null,

  // derived getters
  get backgroundUrl() {
    const { settings } = get();
    if (settings.customBackgroundPath) {
      return convertFileSrc(settings.customBackgroundPath);
    }
    return undefined;
  },

  get filteredReleases() {
    const {
      javaCatalog,
      selectedMajorVersion,
      selectedImageType,
      showOnlyRecommended,
      searchQuery,
    } = get();

    if (!javaCatalog) return [];

    let releases = javaCatalog.releases;

    if (selectedMajorVersion !== null) {
      releases = releases.filter(
        (r) => r.majorVersion === selectedMajorVersion,
      );
    }

    releases = releases.filter((r) => r.imageType === selectedImageType);

    if (showOnlyRecommended) {
      releases = releases.filter((r) => r.isLts);
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      releases = releases.filter(
        (r) =>
          r.version.toLowerCase().includes(q) ||
          (r.releaseName ?? "").toLowerCase().includes(q),
      );
    }

    // sort newest-first by parsed version number
    return releases.sort((a, b) => {
      const aVer = parseFloat(a.version.split("-")[0]);
      const bVer = parseFloat(b.version.split("-")[0]);
      return bVer - aVer;
    });
  },

  get availableMajorVersions() {
    return get().javaCatalog?.availableMajorVersions || [];
  },

  installStatus: (version: number, imageType: string) => {
    const {
      javaInstallations,
      pendingDownloads,
      isDownloadingJava,
      downloadProgress,
    } = get();

    const installed = javaInstallations.some(
      (inst) => parseInt(inst.version.split(".")[0], 10) === version,
    );
    if (installed) return "installed";

    if (
      isDownloadingJava &&
      downloadProgress?.fileName?.includes(`${version}`)
    ) {
      return "downloading";
    }

    const pending = pendingDownloads.some(
      (d) => d.majorVersion === version && d.imageType === imageType,
    );
    if (pending) return "downloading";

    return "available";
  },

  get selectedRelease() {
    const { javaCatalog, selectedMajorVersion, selectedImageType } = get();
    if (!javaCatalog || selectedMajorVersion === null) return null;
    return (
      javaCatalog.releases.find(
        (r) =>
          r.majorVersion === selectedMajorVersion &&
          r.imageType === selectedImageType,
      ) || null
    );
  },

  get currentModelOptions() {
    const { settings, ollamaModels, openaiModels } = get();
    const provider = settings.assistant.llmProvider;
    if (provider === "ollama") {
      return ollamaModels.map((m) => ({
        value: m.id,
        label: m.name,
        details: m.details || m.size || "",
      }));
    } else {
      return openaiModels.map((m) => ({
        value: m.id,
        label: m.name,
        details: m.details || "",
      }));
    }
  },

  // actions
  loadSettings: async () => {
    try {
      const result = await invoke<LauncherConfig>("get_settings");
      // result already uses camelCase fields from bindings
      set({ settings: result });

      // enforce dark theme at app-level if necessary
      if (result.theme !== "dark") {
        const updated = { ...result, theme: "dark" } as LauncherConfig;
        set({ settings: updated });
        await invoke("save_settings", { config: updated });
      }

      // ensure customBackgroundPath is undefined rather than null for reactiveness
      if (!result.customBackgroundPath) {
        set((s) => ({
          settings: { ...s.settings, customBackgroundPath: null },
        }));
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  },

  saveSettings: async () => {
    try {
      const { settings } = get();

      // Clean up empty strings to null where appropriate
      if ((settings.customBackgroundPath ?? "") === "") {
        set((state) => ({
          settings: { ...state.settings, customBackgroundPath: null },
        }));
      }

      await invoke("save_settings", { config: settings });
      toast.success("Settings saved!");
    } catch (e) {
      console.error("Failed to save settings:", e);
      toast.error(`Error saving settings: ${String(e)}`);
    }
  },

  set: (patch: Partial<Record<string, unknown>>) => {
    set(patch);
  },

  detectJava: async () => {
    set({ isDetectingJava: true });
    try {
      const installs = await invoke<JavaInstallation[]>("detect_java");
      set({ javaInstallations: installs });
      if (installs.length === 0) toast.info("No Java installations found");
      else toast.success(`Found ${installs.length} Java installation(s)`);
    } catch (e) {
      console.error("Failed to detect Java:", e);
      toast.error(`Error detecting Java: ${String(e)}`);
    } finally {
      set({ isDetectingJava: false });
    }
  },

  selectJava: (path: string) => {
    set((s) => ({ settings: { ...s.settings, javaPath: path } }));
  },

  openJavaDownloadModal: async () => {
    set({
      showJavaDownloadModal: true,
      javaDownloadStatus: "",
      catalogError: "",
      downloadProgress: null,
    });

    // attach event listener for download progress
    const state = get();
    if (state.progressUnlisten) {
      state.progressUnlisten();
    }

    const unlisten = await listen<JavaDownloadProgress>(
      "java-download-progress",
      (event) => {
        set({ downloadProgress: event.payload });
      },
    );

    set({ progressUnlisten: unlisten });

    // load catalog and pending downloads
    await get().loadJavaCatalog(false);
    await get().loadPendingDownloads();
  },

  closeJavaDownloadModal: () => {
    const { isDownloadingJava, progressUnlisten } = get();

    if (!isDownloadingJava) {
      set({ showJavaDownloadModal: false });
      if (progressUnlisten) {
        try {
          progressUnlisten();
        } catch {
          // ignore
        }
        set({ progressUnlisten: null });
      }
    }
  },

  loadJavaCatalog: async (forceRefresh: boolean) => {
    set({ isLoadingCatalog: true, catalogError: "" });
    try {
      const cmd = forceRefresh ? "refresh_java_catalog" : "get_java_catalog";
      const result = await invoke<JavaCatalog>(cmd);
      set({ javaCatalog: result, isLoadingCatalog: false });
    } catch (e) {
      console.error("Failed to load Java catalog:", e);
      set({ catalogError: String(e), isLoadingCatalog: false });
    }
  },

  refreshCatalog: async () => {
    await get().loadJavaCatalog(true);
  },

  loadPendingDownloads: async () => {
    try {
      const pending = await invoke<PendingJavaDownload[]>(
        "get_pending_java_downloads",
      );
      set({ pendingDownloads: pending });
    } catch (e) {
      console.error("Failed to load pending downloads:", e);
    }
  },

  selectMajorVersion: (version: number) => {
    set({ selectedMajorVersion: version });
  },

  downloadJava: async () => {
    const { selectedMajorVersion, selectedImageType, selectedDownloadSource } =
      get();
    if (!selectedMajorVersion) return;
    set({ isDownloadingJava: true, javaDownloadStatus: "Starting..." });
    try {
      const result = await downloadAdoptiumJava(
        selectedMajorVersion,
        selectedImageType,
        selectedDownloadSource,
      );
      set({
        javaDownloadStatus: `Java ${selectedMajorVersion} download started: ${result.path}`,
      });
      toast.success("Download started");
    } catch (e) {
      console.error("Failed to download Java:", e);
      toast.error(`Failed to start Java download: ${String(e)}`);
    } finally {
      set({ isDownloadingJava: false });
    }
  },

  cancelDownload: async () => {
    try {
      await invoke("cancel_java_download");
      toast.success("Cancelled Java download");
      set({ isDownloadingJava: false, javaDownloadStatus: "" });
    } catch (e) {
      console.error("Failed to cancel download:", e);
      toast.error(`Failed to cancel download: ${String(e)}`);
    }
  },

  resumeDownloads: async () => {
    try {
      const installed = await invoke<boolean>("resume_java_downloads");
      if (installed) toast.success("Resumed Java downloads");
      else toast.info("No downloads to resume");
    } catch (e) {
      console.error("Failed to resume downloads:", e);
      toast.error(`Failed to resume downloads: ${String(e)}`);
    }
  },

  openConfigEditor: async () => {
    try {
      const path = await invoke<string>("get_config_path");
      const content = await invoke<string>("read_config_raw");
      set({
        configFilePath: path,
        rawConfigContent: content,
        showConfigEditor: true,
      });
    } catch (e) {
      console.error("Failed to open config editor:", e);
      set({ configEditorError: String(e) });
    }
  },

  closeConfigEditor: () => {
    set({
      showConfigEditor: false,
      rawConfigContent: "",
      configFilePath: "",
      configEditorError: "",
    });
  },

  saveRawConfig: async () => {
    try {
      await invoke("write_config_raw", { content: get().rawConfigContent });
      toast.success("Config saved");
      set({ showConfigEditor: false });
    } catch (e) {
      console.error("Failed to save config:", e);
      set({ configEditorError: String(e) });
      toast.error(`Failed to save config: ${String(e)}`);
    }
  },

  loadOllamaModels: async () => {
    set({ isLoadingOllamaModels: true, ollamaModelsError: "" });
    try {
      const models = await invoke<ModelInfo[]>("get_ollama_models");
      set({ ollamaModels: models, isLoadingOllamaModels: false });
    } catch (e) {
      console.error("Failed to load Ollama models:", e);
      set({ isLoadingOllamaModels: false, ollamaModelsError: String(e) });
    }
  },

  loadOpenaiModels: async () => {
    set({ isLoadingOpenaiModels: true, openaiModelsError: "" });
    try {
      const models = await invoke<ModelInfo[]>("get_openai_models");
      set({ openaiModels: models, isLoadingOpenaiModels: false });
    } catch (e) {
      console.error("Failed to load OpenAI models:", e);
      set({ isLoadingOpenaiModels: false, openaiModelsError: String(e) });
    }
  },

  setSetting: (key, value) => {
    set((s) => ({
      settings: { ...s.settings, [key]: value } as unknown as LauncherConfig,
    }));
  },

  setAssistantSetting: (key, value) => {
    set((s) => ({
      settings: {
        ...s.settings,
        assistant: { ...s.settings.assistant, [key]: value },
      } as LauncherConfig,
    }));
  },

  setFeatureFlag: (key, value) => {
    set((s) => ({
      settings: {
        ...s.settings,
        featureFlags: { ...s.settings.featureFlags, [key]: value },
      } as LauncherConfig,
    }));
  },
}));

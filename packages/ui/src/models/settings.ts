import { toast } from "sonner";
import { create } from "zustand/react";
import { getConfigPath, getSettings, saveSettings } from "@/client";
import type { LauncherConfig } from "@/types";

export interface SettingsState {
  config: LauncherConfig | null;
  configPath: string | null;

  /* Theme getter */
  get theme(): string;
  /* Apply theme to the document */
  applyTheme: (theme?: string) => void;

  /* Refresh settings from the backend */
  refresh: () => Promise<void>;
  /* Save settings to the backend */
  save: () => Promise<void>;
  /* Update settings in the backend */
  update: (config: LauncherConfig) => Promise<void>;
  /* Merge settings with the current config without saving */
  merge: (config: Partial<LauncherConfig>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: null,
  configPath: null,

  get theme() {
    const { config } = get();
    return config?.theme || "dark";
  },
  applyTheme: (theme?: string) => {
    const { config } = get();
    if (!config) return;
    if (!theme) theme = config.theme;
    let themeValue = theme;
    if (theme === "system") {
      themeValue = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.setAttribute("data-theme", themeValue);
    document.documentElement.classList.add(themeValue);
    set({ config: { ...config, theme } });
  },

  refresh: async () => {
    const { applyTheme } = get();
    try {
      const settings = await getSettings();
      const path = await getConfigPath();
      set({ config: settings, configPath: path });
      applyTheme(settings.theme);
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast.error("Failed to load settings");
    }
  },
  save: async () => {
    const { config } = get();
    if (!config) return;
    await saveSettings(config);
  },
  update: async (config) => {
    await saveSettings(config);
    set({ config });
  },
  merge: (config) => {
    const { config: currentConfig } = get();
    if (!currentConfig) throw new Error("Settings not loaded");
    set({ config: { ...currentConfig, ...config } });
  },
}));

import { invoke } from "@tauri-apps/api/core";
import type { LauncherConfig, JavaInstallation } from "../types";
import { uiState } from "./ui.svelte";

export class SettingsState {
  settings = $state<LauncherConfig>({
    min_memory: 1024,
    max_memory: 2048,
    java_path: "java",
    width: 854,
    height: 480,
  });
  javaInstallations = $state<JavaInstallation[]>([]);
  isDetectingJava = $state(false);

  async loadSettings() {
    try {
      const result = await invoke<LauncherConfig>("get_settings");
      this.settings = result;
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async saveSettings() {
    try {
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
}

export const settingsState = new SettingsState();

import { invoke } from "@tauri-apps/api/core";
import type { Version } from "../types";
import { uiState } from "./ui.svelte";
import { authState } from "./auth.svelte";
import { instancesState } from "./instances.svelte";

export class GameState {
  versions = $state<Version[]>([]);
  selectedVersion = $state("");

  get latestRelease() {
    return this.versions.find((v) => v.type === "release");
  }

  async loadVersions() {
    try {
      this.versions = await invoke<Version[]>("get_versions");
      // Don't auto-select version here - let BottomBar handle version selection
      // based on installed versions only
    } catch (e) {
      console.error("Failed to fetch versions:", e);
      uiState.setStatus("Error fetching versions: " + e);
    }
  }

  async startGame() {
    if (!authState.currentAccount) {
      alert("Please login first!");
      authState.openLoginModal();
      return;
    }

    if (!this.selectedVersion) {
      alert("Please select a version!");
      return;
    }

    if (!instancesState.activeInstanceId) {
      alert("Please select an instance first!");
      uiState.setView("instances");
      return;
    }

    uiState.setStatus("Preparing to launch " + this.selectedVersion + "...");
    console.log(
      "Invoking start_game for version:",
      this.selectedVersion,
      "instance:",
      instancesState.activeInstanceId,
    );
    try {
      const msg = await invoke<string>("start_game", {
        instanceId: instancesState.activeInstanceId,
        versionId: this.selectedVersion,
      });
      console.log("Response:", msg);
      uiState.setStatus(msg);
    } catch (e) {
      console.error(e);
      uiState.setStatus("Error: " + e);
    }
  }
}

export const gameState = new GameState();

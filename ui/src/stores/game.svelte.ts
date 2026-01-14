import { invoke } from "@tauri-apps/api/core";
import type { Version } from "../types";
import { uiState } from "./ui.svelte";
import { authState } from "./auth.svelte";

export class GameState {
  versions = $state<Version[]>([]);
  selectedVersion = $state("");

  async loadVersions() {
    try {
      this.versions = await invoke<Version[]>("get_versions");
      if (this.versions.length > 0) {
        const latest = this.versions.find((v) => v.type === "release");
        this.selectedVersion = latest ? latest.id : this.versions[0].id;
      }
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

    uiState.setStatus("Preparing to launch " + this.selectedVersion + "...");
    console.log("Invoking start_game for version:", this.selectedVersion);
    try {
      const msg = await invoke<string>("start_game", { versionId: this.selectedVersion });
      console.log("Response:", msg);
      uiState.setStatus(msg);
    } catch (e) {
      console.error(e);
      uiState.setStatus("Error: " + e);
    }
  }
}

export const gameState = new GameState();

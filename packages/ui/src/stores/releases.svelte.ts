import { invoke } from "@tauri-apps/api/core";

export interface GithubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  html_url: string;
}

export class ReleasesState {
  releases = $state<GithubRelease[]>([]);
  isLoading = $state(false);
  isLoaded = $state(false);
  error = $state<string | null>(null);

  async loadReleases() {
    // If already loaded or currently loading, skip to prevent duplicate requests
    if (this.isLoaded || this.isLoading) return;

    this.isLoading = true;
    this.error = null;

    try {
      this.releases = await invoke<GithubRelease[]>("get_github_releases");
      this.isLoaded = true;
    } catch (e) {
      console.error("Failed to load releases:", e);
      this.error = String(e);
    } finally {
      this.isLoading = false;
    }
  }
}

export const releasesState = new ReleasesState();

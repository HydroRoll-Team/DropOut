export type ViewType = "home" | "versions" | "settings";

export interface Version {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

export interface Account {
  type: "Offline" | "Microsoft";
  username: string;
  uuid: string;
}

export interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message?: string;
}

export interface LauncherConfig {
  min_memory: number;
  max_memory: number;
  java_path: string;
  width: number;
  height: number;
  download_threads: number;
  custom_background_path?: string;
  enable_gpu_acceleration: boolean;
  enable_visual_effects: boolean;
  active_effect: string;
  theme: string;
}

export interface JavaInstallation {
  path: string;
  version: string;
  is_64bit: boolean;
}

export interface JavaDownloadInfo {
  version: string;
  release_name: string;
  download_url: string;
  file_name: string;
  file_size: number;
  checksum: string | null;
  image_type: string;
}

export interface JavaReleaseInfo {
  major_version: number;
  image_type: string;
  version: string;
  release_name: string;
  release_date: string | null;
  file_size: number;
  checksum: string | null;
  download_url: string;
  is_lts: boolean;
  is_available: boolean;
  architecture: string;
}

export interface JavaCatalog {
  releases: JavaReleaseInfo[];
  available_major_versions: number[];
  lts_versions: number[];
  cached_at: number;
}

export interface JavaDownloadProgress {
  file_name: string;
  downloaded_bytes: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
  eta_seconds: number;
  status: string;
  percentage: number;
}

export interface PendingJavaDownload {
  major_version: number;
  image_type: string;
  download_url: string;
  file_name: string;
  file_size: number;
  checksum: string | null;
  install_path: string;
  created_at: number;
}

export type JavaDownloadSource = "adoptium" | "mojang" | "azul";

// ==================== Fabric Types ====================

export interface FabricGameVersion {
  version: string;
  stable: boolean;
}

export interface FabricLoaderVersion {
  separator: string;
  build: number;
  maven: string;
  version: string;
  stable: boolean;
}

export interface FabricLoaderEntry {
  loader: FabricLoaderVersion;
  intermediary: {
    maven: string;
    version: string;
    stable: boolean;
  };
  launcherMeta: {
    version: number;
    mainClass: {
      client: string;
      server: string;
    };
  };
}

export interface InstalledFabricVersion {
  id: string;
  minecraft_version: string;
  loader_version: string;
  path: string;
}

// ==================== Forge Types ====================

export interface ForgeVersion {
  version: string;
  minecraft_version: string;
  recommended: boolean;
  latest: boolean;
}

export interface InstalledForgeVersion {
  id: string;
  minecraft_version: string;
  forge_version: string;
  path: string;
}

// ==================== Mod Loader Type ====================

export type ModLoaderType = "vanilla" | "fabric" | "forge";


import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  DeviceCodeResponse,
  FabricGameVersion,
  FabricLoaderEntry,
  FabricLoaderVersion,
  FileInfo,
  ForgeVersion,
  GithubRelease,
  InstalledFabricVersion,
  InstalledForgeVersion,
  InstalledVersion,
  Instance,
  JavaCatalog,
  JavaDownloadInfo,
  JavaInstallation,
  LauncherConfig,
  Message,
  MigrationResult,
  ModelInfo,
  PastebinResponse,
  PendingJavaDownload,
  Version,
  VersionMetadata,
} from "@/types";

export function assistantChat(messages: Message[]): Promise<Message> {
  return invoke<Message>("assistant_chat", {
    messages,
  });
}

export function assistantChatStream(messages: Message[]): Promise<string> {
  return invoke<string>("assistant_chat_stream", {
    messages,
  });
}

export function assistantCheckHealth(): Promise<boolean> {
  return invoke<boolean>("assistant_check_health");
}

export function cancelJavaDownload(): Promise<void> {
  return invoke<void>("cancel_java_download");
}

export function checkVersionInstalled(
  instanceId: string,
  versionId: string,
): Promise<boolean> {
  return invoke<boolean>("check_version_installed", {
    instanceId,
    versionId,
  });
}

export function completeMicrosoftLogin(deviceCode: string): Promise<Account> {
  return invoke<Account>("complete_microsoft_login", {
    deviceCode,
  });
}

export function createInstance(name: string): Promise<Instance> {
  return invoke<Instance>("create_instance", {
    name,
  });
}

export function deleteInstance(instanceId: string): Promise<void> {
  return invoke<void>("delete_instance", {
    instanceId,
  });
}

export function deleteInstanceFile(path: string): Promise<void> {
  return invoke<void>("delete_instance_file", {
    path,
  });
}

export function deleteVersion(
  instanceId: string,
  versionId: string,
): Promise<void> {
  return invoke<void>("delete_version", {
    instanceId,
    versionId,
  });
}

export function detectAllJavaInstallations(): Promise<JavaInstallation[]> {
  return invoke<JavaInstallation[]>("detect_all_java_installations");
}

export function detectJava(): Promise<JavaInstallation[]> {
  return invoke<JavaInstallation[]>("detect_java");
}

export function downloadAdoptiumJava(
  majorVersion: number,
  imageType: string,
  customPath: string | null,
): Promise<JavaInstallation> {
  return invoke<JavaInstallation>("download_adoptium_java", {
    majorVersion,
    imageType,
    customPath,
  });
}

export function duplicateInstance(
  instanceId: string,
  newName: string,
): Promise<Instance> {
  return invoke<Instance>("duplicate_instance", {
    instanceId,
    newName,
  });
}

export function fetchAdoptiumJava(
  majorVersion: number,
  imageType: string,
): Promise<JavaDownloadInfo> {
  return invoke<JavaDownloadInfo>("fetch_adoptium_java", {
    majorVersion,
    imageType,
  });
}

export function fetchAvailableJavaVersions(): Promise<number[]> {
  return invoke<number[]>("fetch_available_java_versions");
}

export function fetchJavaCatalog(): Promise<JavaCatalog> {
  return invoke<JavaCatalog>("fetch_java_catalog");
}

export function getActiveAccount(): Promise<Account | null> {
  return invoke<Account | null>("get_active_account");
}

export function getActiveInstance(): Promise<Instance | null> {
  return invoke<Instance | null>("get_active_instance");
}

export function getConfigPath(): Promise<string> {
  return invoke<string>("get_config_path");
}

export function getFabricGameVersions(): Promise<FabricGameVersion[]> {
  return invoke<FabricGameVersion[]>("get_fabric_game_versions");
}

export function getFabricLoaderVersions(): Promise<FabricLoaderVersion[]> {
  return invoke<FabricLoaderVersion[]>("get_fabric_loader_versions");
}

export function getFabricLoadersForVersion(
  gameVersion: string,
): Promise<FabricLoaderEntry[]> {
  return invoke<FabricLoaderEntry[]>("get_fabric_loaders_for_version", {
    gameVersion,
  });
}

export function getForgeGameVersions(): Promise<string[]> {
  return invoke<string[]>("get_forge_game_versions");
}

export function getForgeVersionsForGame(
  gameVersion: string,
): Promise<ForgeVersion[]> {
  return invoke<ForgeVersion[]>("get_forge_versions_for_game", {
    gameVersion,
  });
}

export function getGithubReleases(): Promise<GithubRelease[]> {
  return invoke<GithubRelease[]>("get_github_releases");
}

export function getInstance(instanceId: string): Promise<Instance> {
  return invoke<Instance>("get_instance", {
    instanceId,
  });
}

export function getPendingJavaDownloads(): Promise<PendingJavaDownload[]> {
  return invoke<PendingJavaDownload[]>("get_pending_java_downloads");
}

export function getRecommendedJava(
  requiredMajorVersion: number | null,
): Promise<JavaInstallation | null> {
  return invoke<JavaInstallation | null>("get_recommended_java", {
    requiredMajorVersion,
  });
}

export function getSettings(): Promise<LauncherConfig> {
  return invoke<LauncherConfig>("get_settings");
}

export function getVersionJavaVersion(
  instanceId: string,
  versionId: string,
): Promise<number | null> {
  return invoke<number | null>("get_version_java_version", {
    instanceId,
    versionId,
  });
}

export function getVersionMetadata(
  instanceId: string,
  versionId: string,
): Promise<VersionMetadata> {
  return invoke<VersionMetadata>("get_version_metadata", {
    instanceId,
    versionId,
  });
}

export function getVersions(instanceId: string): Promise<Version[]> {
  return invoke<Version[]>("get_versions", {
    instanceId,
  });
}

export function installFabric(
  instanceId: string,
  gameVersion: string,
  loaderVersion: string,
): Promise<InstalledFabricVersion> {
  return invoke<InstalledFabricVersion>("install_fabric", {
    instanceId,
    gameVersion,
    loaderVersion,
  });
}

export function installForge(
  instanceId: string,
  gameVersion: string,
  forgeVersion: string,
): Promise<InstalledForgeVersion> {
  return invoke<InstalledForgeVersion>("install_forge", {
    instanceId,
    gameVersion,
    forgeVersion,
  });
}

export function installVersion(
  instanceId: string,
  versionId: string,
): Promise<void> {
  return invoke<void>("install_version", {
    instanceId,
    versionId,
  });
}

export function isFabricInstalled(
  instanceId: string,
  gameVersion: string,
  loaderVersion: string,
): Promise<boolean> {
  return invoke<boolean>("is_fabric_installed", {
    instanceId,
    gameVersion,
    loaderVersion,
  });
}

export function listInstalledFabricVersions(
  instanceId: string,
): Promise<string[]> {
  return invoke<string[]>("list_installed_fabric_versions", {
    instanceId,
  });
}

export function listInstalledVersions(
  instanceId: string,
): Promise<InstalledVersion[]> {
  return invoke<InstalledVersion[]>("list_installed_versions", {
    instanceId,
  });
}

export function listInstanceDirectory(
  instanceId: string,
  folder: string,
): Promise<FileInfo[]> {
  return invoke<FileInfo[]>("list_instance_directory", {
    instanceId,
    folder,
  });
}

export function listInstances(): Promise<Instance[]> {
  return invoke<Instance[]>("list_instances");
}

export function listOllamaModels(endpoint: string): Promise<ModelInfo[]> {
  return invoke<ModelInfo[]>("list_ollama_models", {
    endpoint,
  });
}

export function listOpenaiModels(): Promise<ModelInfo[]> {
  return invoke<ModelInfo[]>("list_openai_models");
}

export function loginOffline(username: string): Promise<Account> {
  return invoke<Account>("login_offline", {
    username,
  });
}

export function logout(): Promise<void> {
  return invoke<void>("logout");
}

export function migrateSharedCaches(): Promise<MigrationResult> {
  return invoke<MigrationResult>("migrate_shared_caches");
}

export function openFileExplorer(path: string): Promise<void> {
  return invoke<void>("open_file_explorer", {
    path,
  });
}

export function readRawConfig(): Promise<string> {
  return invoke<string>("read_raw_config");
}

export function refreshAccount(): Promise<Account> {
  return invoke<Account>("refresh_account");
}

export function refreshJavaCatalog(): Promise<JavaCatalog> {
  return invoke<JavaCatalog>("refresh_java_catalog");
}

export function resumeJavaDownloads(): Promise<JavaInstallation[]> {
  return invoke<JavaInstallation[]>("resume_java_downloads");
}

export function saveRawConfig(content: string): Promise<void> {
  return invoke<void>("save_raw_config", {
    content,
  });
}

export function saveSettings(config: LauncherConfig): Promise<void> {
  return invoke<void>("save_settings", {
    config,
  });
}

export function setActiveInstance(instanceId: string): Promise<void> {
  return invoke<void>("set_active_instance", {
    instanceId,
  });
}

export function startGame(
  instanceId: string,
  versionId: string,
): Promise<string> {
  return invoke<string>("start_game", {
    instanceId,
    versionId,
  });
}

export function startMicrosoftLogin(): Promise<DeviceCodeResponse> {
  return invoke<DeviceCodeResponse>("start_microsoft_login");
}

export function updateInstance(instance: Instance): Promise<void> {
  return invoke<void>("update_instance", {
    instance,
  });
}

export function uploadToPastebin(content: string): Promise<PastebinResponse> {
  return invoke<PastebinResponse>("upload_to_pastebin", {
    content,
  });
}

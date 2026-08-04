import { invoke } from "@/lib/launcher-runtime";
import type {
  Account,
  AccountSummary,
  AssistantLogContext,
  ContentSearchResult,
  ContentVersion,
  ConversionApplyRequest,
  ConversionPreview,
  ConversionReport,
  ConversionTarget,
  DetectedLauncher,
  DeviceCodeResponse,
  FabricGameVersion,
  FabricLoaderEntry,
  FabricLoaderVersion,
  FileInfo,
  ForgeVersion,
  GithubRelease,
  ImportableInstance,
  InstalledFabricVersion,
  InstalledForgeVersion,
  InstalledVersion,
  Instance,
  InstanceRepairResult,
  JavaCatalog,
  JavaDownloadInfo,
  JavaInstallation,
  LauncherConfig,
  LaunchReadiness,
  MemoryAllocation,
  Message,
  MigrationImportReport,
  MigrationPreview,
  MigrationResult,
  ModelInfo,
  ModInfo,
  PastebinResponse,
  PendingJavaDownload,
  TrayDownloadStatus,
  Version,
  VersionMetadata,
} from "@/types";

export function applyContentConversion(
  request: ConversionApplyRequest,
): Promise<ConversionReport> {
  return invoke<ConversionReport>("apply_content_conversion", {
    request,
  });
}

export function assistantBeginStreamRequest(): Promise<string> {
  return invoke<string>("assistant_begin_stream_request");
}

export function assistantCancelStreamRequest(requestId: string): Promise<void> {
  return invoke<void>("assistant_cancel_stream_request", {
    requestId,
  });
}

export function assistantChat(
  messages: Message[],
  logContext: string | null,
): Promise<Message> {
  return invoke<Message>("assistant_chat", {
    messages,
    logContext,
  });
}

export function assistantChatStream(
  messages: Message[],
  logContext: string | null,
  requestId: string,
): Promise<string> {
  return invoke<string>("assistant_chat_stream", {
    messages,
    logContext,
    requestId,
  });
}

export function assistantCheckHealth(): Promise<boolean> {
  return invoke<boolean>("assistant_check_health");
}

export function cancelJavaDownload(): Promise<void> {
  return invoke<void>("cancel_java_download");
}

export function cancelLauncherImport(operationId: string): Promise<boolean> {
  return invoke<boolean>("cancel_launcher_import", {
    operationId,
  });
}

export function changeInstanceDirectory(
  instanceId: string,
  newDir: string,
  migrateFiles: boolean,
): Promise<Instance> {
  return invoke<Instance>("change_instance_directory", {
    instanceId,
    newDir,
    migrateFiles,
  });
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

export function convertModLoader(
  instanceId: string,
  targetLoader: string,
  loaderVersion: string,
): Promise<string> {
  return invoke<string>("convert_mod_loader", {
    instanceId,
    targetLoader,
    loaderVersion,
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

export function deleteMod(instanceId: string, fileName: string): Promise<void> {
  return invoke<void>("delete_mod", {
    instanceId,
    fileName,
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

export function detectLaunchers(): Promise<DetectedLauncher[]> {
  return invoke<DetectedLauncher[]>("detect_launchers");
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

export function downloadContentFile(
  instanceId: string,
  url: string,
  fileName: string,
  subfolder: string,
): Promise<string> {
  return invoke<string>("download_content_file", {
    instanceId,
    url,
    fileName,
    subfolder,
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

export function executeLauncherImport(
  operationId: string,
  sourcePath: string,
  newName: string | null,
): Promise<MigrationImportReport> {
  return invoke<MigrationImportReport>("execute_launcher_import", {
    operationId,
    sourcePath,
    newName,
  });
}

export function exportInstance(
  instanceId: string,
  archivePath: string,
): Promise<string> {
  return invoke<string>("export_instance", {
    instanceId,
    archivePath,
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

export function getAllAccounts(): Promise<AccountSummary[]> {
  return invoke<AccountSummary[]>("get_all_accounts");
}

export function getAssistantLogContext(
  lines: string[],
): Promise<AssistantLogContext> {
  return invoke<AssistantLogContext>("get_assistant_log_context", {
    lines,
  });
}

export function getConfigPath(): Promise<string> {
  return invoke<string>("get_config_path");
}

export function getContentVersions(
  projectId: string,
  gameVersions: string[],
  loaders: string[],
): Promise<ContentVersion[]> {
  return invoke<ContentVersion[]>("get_content_versions", {
    projectId,
    gameVersions,
    loaders,
  });
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

export function getLaunchReadiness(
  instanceId: string,
  versionId: string,
): Promise<LaunchReadiness> {
  return invoke<LaunchReadiness>("get_launch_readiness", {
    instanceId,
    versionId,
  });
}

export function getMemoryRecommendation(
  instanceId: string | null,
): Promise<MemoryAllocation> {
  return invoke<MemoryAllocation>("get_memory_recommendation", {
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

export function getVersions(): Promise<Version[]> {
  return invoke<Version[]>("get_versions");
}

export function getVersionsOfInstance(instanceId: string): Promise<Version[]> {
  return invoke<Version[]>("get_versions_of_instance", {
    instanceId,
  });
}

export function importFromLauncher(
  sourcePath: string,
  newName: string | null,
): Promise<Instance> {
  return invoke<Instance>("import_from_launcher", {
    sourcePath,
    newName,
  });
}

export function importInstance(
  archivePath: string,
  newName: string | null,
): Promise<Instance> {
  return invoke<Instance>("import_instance", {
    archivePath,
    newName,
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

export function previewContentConversion(
  instanceId: string,
  target: ConversionTarget,
): Promise<ConversionPreview> {
  return invoke<ConversionPreview>("preview_content_conversion", {
    instanceId,
    target,
  });
}

export function previewLauncherImport(
  sourcePath: string,
): Promise<MigrationPreview> {
  return invoke<MigrationPreview>("preview_launcher_import", {
    sourcePath,
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

export function refreshSystemTray(): Promise<void> {
  return invoke<void>("refresh_system_tray");
}

export function removeAccount(uuid: string): Promise<void> {
  return invoke<void>("remove_account", {
    uuid,
  });
}

export function repairInstances(): Promise<InstanceRepairResult> {
  return invoke<InstanceRepairResult>("repair_instances");
}

export function resumeJavaDownloads(): Promise<JavaInstallation[]> {
  return invoke<JavaInstallation[]>("resume_java_downloads");
}

export function rollbackContentConversion(
  operationId: string,
): Promise<boolean> {
  return invoke<boolean>("rollback_content_conversion", {
    operationId,
  });
}

export function rollbackLauncherImport(operationId: string): Promise<boolean> {
  return invoke<boolean>("rollback_launcher_import", {
    operationId,
  });
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

export function scanInstanceMods(instanceId: string): Promise<ModInfo[]> {
  return invoke<ModInfo[]>("scan_instance_mods", {
    instanceId,
  });
}

export function scanLauncherInstances(
  instancesDir: string,
): Promise<ImportableInstance[]> {
  return invoke<ImportableInstance[]>("scan_launcher_instances", {
    instancesDir,
  });
}

export function searchContent(
  query: string,
  projectType: string,
  gameVersions: string[],
  loaders: string[],
  sortBy: string,
  offset: number,
  limit: number,
): Promise<ContentSearchResult> {
  return invoke<ContentSearchResult>("search_content", {
    query,
    projectType,
    gameVersions,
    loaders,
    sortBy,
    offset,
    limit,
  });
}

export function setActiveInstance(instanceId: string): Promise<void> {
  return invoke<void>("set_active_instance", {
    instanceId,
  });
}

export function showMainWindow(): Promise<void> {
  return invoke<void>("show_main_window");
}

export function showSystemNotification(
  title: string,
  body: string,
): Promise<void> {
  return invoke<void>("show_system_notification", {
    title,
    body,
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

export function stopGame(): Promise<string> {
  return invoke<string>("stop_game");
}

export function switchAccount(uuid: string): Promise<Account> {
  return invoke<Account>("switch_account", {
    uuid,
  });
}

export function toggleMod(
  instanceId: string,
  fileName: string,
): Promise<ModInfo> {
  return invoke<ModInfo>("toggle_mod", {
    instanceId,
    fileName,
  });
}

export function updateInstance(instance: Instance): Promise<void> {
  return invoke<void>("update_instance", {
    instance,
  });
}

export function updateTrayDownloadStatus(
  status: TrayDownloadStatus,
): Promise<void> {
  return invoke<void>("update_tray_download_status", {
    status,
  });
}

export function uploadToPastebin(content: string): Promise<PastebinResponse> {
  return invoke<PastebinResponse>("upload_to_pastebin", {
    content,
  });
}

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use ts_rs::TS;

const MINECRAFT_GAME_DIRS: &[&str] = &[
    "config",
    "journeymap",
    "mods",
    "replay_recordings",
    "resourcepacks",
    "saves",
    "screenshots",
    "server-resource-packs",
    "shaderpacks",
    "schematics",
    "texturepacks",
];

const MINECRAFT_GAME_FILES: &[&str] = &[
    "options.txt",
    "optionsof.txt",
    "optionsshaders.txt",
    "servers.dat",
    "servers.dat_old",
    "icon.png",
];

const SKIPPED_GAME_DIRS: &[&str] = &[
    ".cache",
    "assets",
    "crash-reports",
    "libraries",
    "logs",
    "natives",
];

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct DetectedLauncher {
    pub launcher_type: String,
    pub instances_dir: PathBuf,
    pub instance_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct MigrationMemoryOverride {
    pub min: u32,
    pub max: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct MigrationContentGroup {
    pub id: String,
    pub relative_path: String,
    pub disposition: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct MigrationConflict {
    pub kind: String,
    pub message: String,
    pub suggested_resolution: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct MigrationPreview {
    pub source: ImportableInstance,
    pub suggested_name: String,
    pub name_conflict: bool,
    pub content: Vec<MigrationContentGroup>,
    pub conflicts: Vec<MigrationConflict>,
    pub warnings: Vec<String>,
    pub total_files: usize,
    pub total_bytes: u64,
    pub can_import: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct MigrationProgress {
    pub completed_files: usize,
    pub total_files: usize,
    pub completed_bytes: u64,
    pub total_bytes: u64,
    pub current_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct MigrationCopyResult {
    pub copied_files: usize,
    pub copied_bytes: u64,
    pub skipped_symlinks: usize,
    pub pending_remote_files: usize,
    pub imported_icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct MigrationProgressEvent {
    pub operation_id: String,
    pub progress: MigrationProgress,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct MigrationCompatibilityCheck {
    pub id: String,
    pub status: String,
    pub summary: String,
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct MigrationImportReport {
    pub operation_id: String,
    pub instance_id: String,
    pub instance_name: String,
    pub source_path: PathBuf,
    pub copied_files: usize,
    pub copied_bytes: u64,
    pub skipped_symlinks: usize,
    pub warnings: Vec<String>,
    pub compatibility_status: String,
    pub compatibility_checks: Vec<MigrationCompatibilityCheck>,
}

#[derive(Default)]
pub struct MigrationOperationState {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pending_cancellation: Mutex<HashSet<String>>,
    completed: Mutex<HashMap<String, String>>,
}

impl MigrationOperationState {
    pub fn begin(&self, operation_id: &str) -> Result<Arc<AtomicBool>, String> {
        let operation_id = operation_id.trim();
        if operation_id.is_empty() {
            return Err("Migration operation ID cannot be empty".into());
        }

        let mut active = self.active.lock().unwrap();
        if active.contains_key(operation_id) {
            return Err(format!(
                "Migration operation {operation_id} is already active"
            ));
        }
        let was_cancelled = self
            .pending_cancellation
            .lock()
            .unwrap()
            .remove(operation_id);
        let cancelled = Arc::new(AtomicBool::new(was_cancelled));
        active.insert(operation_id.to_string(), Arc::clone(&cancelled));
        Ok(cancelled)
    }

    pub fn cancel(&self, operation_id: &str) -> bool {
        let active = self.active.lock().unwrap();
        if let Some(cancelled) = active.get(operation_id) {
            cancelled.store(true, Ordering::SeqCst);
        } else {
            let operation_id = operation_id.trim();
            if operation_id.is_empty() {
                return false;
            }
            self.pending_cancellation
                .lock()
                .unwrap()
                .insert(operation_id.to_string());
        }
        true
    }

    pub fn finish(&self, operation_id: &str) {
        let mut active = self.active.lock().unwrap();
        active.remove(operation_id);
        self.pending_cancellation
            .lock()
            .unwrap()
            .remove(operation_id);
    }

    pub fn complete(&self, operation_id: &str, instance_id: &str) {
        self.finish(operation_id);
        self.completed
            .lock()
            .unwrap()
            .insert(operation_id.to_string(), instance_id.to_string());
    }

    pub fn take_completed(&self, operation_id: &str) -> Option<String> {
        self.completed.lock().unwrap().remove(operation_id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct ImportableInstance {
    pub source_path: PathBuf,
    pub game_dir: PathBuf,
    pub launcher_type: String,
    pub source_kind: String,
    pub version_id: Option<String>,
    pub name: String,
    pub minecraft_version: Option<String>,
    pub mod_loader: Option<String>,
    pub mod_loader_version: Option<String>,
    pub notes: Option<String>,
    pub memory_override: Option<MigrationMemoryOverride>,
    pub java_path_override: Option<String>,
    pub jvm_args_override: Option<String>,
    pub icon_source: Option<PathBuf>,
}

#[derive(Debug)]
struct ArchiveFilePlan {
    index: usize,
    relative_path: PathBuf,
    display_path: String,
    size: u64,
}

#[derive(Debug)]
struct LauncherArchivePlan {
    files: Vec<ArchiveFilePlan>,
    content: Vec<MigrationContentGroup>,
    conflicts: Vec<MigrationConflict>,
    warnings: Vec<String>,
    total_files: usize,
    total_bytes: u64,
    pending_remote_files: usize,
}

fn is_regular_directory(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_dir())
        .unwrap_or(false)
}

fn is_regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_file())
        .unwrap_or(false)
}

/// Scan common launcher install paths and return detected launchers.
pub fn detect_launchers() -> Vec<DetectedLauncher> {
    let candidates = launcher_candidates();
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter_map(|(launcher_type, path)| {
            if !seen.insert((launcher_type.clone(), path.clone())) {
                return None;
            }
            if !is_regular_directory(&path) {
                return None;
            }
            let count = count_instances(&path);
            if count == 0 {
                return None;
            }
            Some(DetectedLauncher {
                launcher_type,
                instances_dir: path,
                instance_count: count,
            })
        })
        .collect()
}

/// Scan a launcher's instances directory and parse each instance's metadata.
pub fn scan_instances(instances_dir: &Path) -> Result<Vec<ImportableInstance>, String> {
    if is_regular_file(instances_dir) {
        return import_metadata(instances_dir).map(|instance| vec![instance]);
    }
    if !is_regular_directory(instances_dir) {
        return Err(format!(
            "Migration source must be a regular file or directory: {}",
            instances_dir.display()
        ));
    }

    let mut result = Vec::new();
    let mut seen = HashSet::new();
    let mut scanned_version_roots = HashSet::new();

    push_if_importable(instances_dir, &mut seen, &mut result);

    let entries = fs::read_dir(instances_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !is_regular_directory(&path) {
            continue;
        }

        push_if_importable(&path, &mut seen, &mut result);

        if is_regular_directory(&path.join("versions")) {
            scan_minecraft_versions_once(&path, &mut scanned_version_roots, &mut seen, &mut result);
        }
    }

    let nested_instances = instances_dir.join("instances");
    if is_regular_directory(&nested_instances) {
        for entry in fs::read_dir(&nested_instances)
            .map_err(|error| error.to_string())?
            .flatten()
        {
            let path = entry.path();
            if is_regular_directory(&path) {
                push_if_importable(&path, &mut seen, &mut result);
            }
        }
    }

    if is_regular_directory(&instances_dir.join("versions")) {
        scan_minecraft_versions_once(
            instances_dir,
            &mut scanned_version_roots,
            &mut seen,
            &mut result,
        );
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

pub fn import_metadata(source_path: &Path) -> Result<ImportableInstance, String> {
    if is_regular_file(source_path) {
        return import_archive_metadata(source_path);
    }

    if let Some(instance) = parse_importable(source_path) {
        return Ok(instance);
    }

    if minecraft_version_json(source_path).is_some() {
        return Err(format!(
            "Failed to parse Minecraft version metadata from {}",
            source_path.display()
        ));
    }

    let name = source_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Imported".to_string());
    Ok(ImportableInstance {
        source_path: source_path.to_path_buf(),
        game_dir: source_path.to_path_buf(),
        launcher_type: "custom".into(),
        source_kind: "directory".into(),
        version_id: None,
        name,
        minecraft_version: None,
        mod_loader: None,
        mod_loader_version: None,
        notes: None,
        memory_override: None,
        java_path_override: None,
        jvm_args_override: None,
        icon_source: None,
    })
}

fn import_archive_metadata(source_path: &Path) -> Result<ImportableInstance, String> {
    let archive = inspect_launcher_archive(source_path)?;
    let info = archive.info;
    let launcher_type = match info.modpack_type.as_str() {
        "multimc" => "multimc",
        "modrinth" => "modrinth",
        "curseforge" => "curseforge",
        _ => "portable-archive",
    };

    Ok(ImportableInstance {
        source_path: source_path.to_path_buf(),
        game_dir: source_path.to_path_buf(),
        launcher_type: launcher_type.into(),
        source_kind: "archive".into(),
        version_id: info.minecraft_version.clone(),
        name: info.name,
        minecraft_version: info.minecraft_version,
        mod_loader: info.mod_loader,
        mod_loader_version: info.mod_loader_version,
        notes: None,
        memory_override: None,
        java_path_override: None,
        jvm_args_override: None,
        icon_source: None,
    })
}

fn inspect_launcher_archive(
    source_path: &Path,
) -> Result<crate::core::modpack::api::ParsedModpack, String> {
    let mut parsed = crate::core::modpack::api::inspect(source_path)?;
    if parsed.info.modpack_type != "unknown" && !parsed.override_prefixes.is_empty() {
        return Ok(parsed);
    }

    let file = fs::File::open(source_path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    let Some(prefix) = portable_archive_prefix(&mut archive) else {
        return Err(
            "Unsupported launcher archive: expected a MultiMC, Modrinth, CurseForge, or portable game-data package"
                .into(),
        );
    };

    parsed.info.modpack_type = "portable".into();
    parsed.override_prefixes = vec![prefix];
    Ok(parsed)
}

fn portable_archive_prefix(archive: &mut zip::ZipArchive<fs::File>) -> Option<String> {
    let mut wrapper_candidates = HashSet::new();
    for index in 0..archive.len() {
        let Ok(entry) = archive.by_index_raw(index) else {
            continue;
        };
        if entry.is_dir() || archive_entry_is_symlink(&entry) {
            continue;
        }
        let Some(relative) = safe_archive_relative(entry.name()) else {
            continue;
        };
        if archive_file_group(&relative)
            .is_some_and(|(disposition, _, _, _)| disposition == "include")
        {
            return Some(String::new());
        }

        let mut components = relative.components();
        let Some(wrapper) = components.next().and_then(|part| part.as_os_str().to_str()) else {
            continue;
        };
        let nested = components.collect::<PathBuf>();
        if archive_file_group(&nested)
            .is_some_and(|(disposition, _, _, _)| disposition == "include")
        {
            wrapper_candidates.insert(wrapper.to_string());
        }
    }
    (wrapper_candidates.len() == 1).then(|| {
        format!(
            "{}/",
            wrapper_candidates.into_iter().next().unwrap_or_default()
        )
    })
}

fn preview_archive(
    source: ImportableInstance,
    existing_names: &[String],
) -> Result<MigrationPreview, String> {
    let existing: HashSet<String> = existing_names
        .iter()
        .map(|name| name.trim().to_lowercase())
        .collect();
    let name_conflict = existing.contains(&source.name.trim().to_lowercase());
    let suggested_name = if name_conflict {
        unique_migration_name(&source.name, &source.launcher_type, &existing)
    } else {
        source.name.clone()
    };
    let mut plan = build_launcher_archive_plan(&source.source_path)?;
    if name_conflict {
        plan.conflicts.push(MigrationConflict {
            kind: "name".into(),
            message: format!("An instance named ‘{}’ already exists", source.name),
            suggested_resolution: format!("Import as ‘{suggested_name}’"),
        });
    }
    if source.minecraft_version.is_none() {
        plan.warnings.push(
            "Minecraft version could not be identified; select a version after import".into(),
        );
    }

    Ok(MigrationPreview {
        source,
        suggested_name,
        name_conflict,
        content: plan.content,
        conflicts: plan.conflicts,
        warnings: plan.warnings,
        total_files: plan.total_files,
        total_bytes: plan.total_bytes,
        can_import: plan.total_files > 0,
    })
}

fn build_launcher_archive_plan(source_path: &Path) -> Result<LauncherArchivePlan, String> {
    let parsed = inspect_launcher_archive(source_path)?;
    let file = fs::File::open(source_path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    let names = (0..archive.len())
        .filter_map(|index| {
            archive
                .by_index_raw(index)
                .ok()
                .map(|entry| entry.name().to_string())
        })
        .collect::<Vec<_>>();
    let mut prefixes = parsed.override_prefixes.clone();
    if parsed.info.modpack_type == "multimc" {
        prefixes = prefixes
            .into_iter()
            .find(|prefix| names.iter().any(|name| name.starts_with(prefix)))
            .into_iter()
            .collect();
    }

    let mut files = Vec::new();
    let mut content = Vec::new();
    let mut conflicts = Vec::new();
    let mut warnings = Vec::new();
    let mut destinations = HashSet::new();
    let mut visited_entries = HashSet::new();
    let mut total_files = 0usize;
    let mut total_bytes = 0u64;

    for prefix in prefixes {
        for index in 0..archive.len() {
            if visited_entries.contains(&index) {
                continue;
            }
            let entry = archive
                .by_index_raw(index)
                .map_err(|error| error.to_string())?;
            if entry.is_dir() {
                continue;
            }
            let Some(relative_name) = entry.name().strip_prefix(&prefix) else {
                continue;
            };
            if relative_name.is_empty() {
                continue;
            }
            visited_entries.insert(index);
            let size = entry.size();

            if archive_entry_is_symlink(&entry) {
                push_archive_group(
                    &mut content,
                    "archive-symlinks",
                    relative_name,
                    "unsupported",
                    size,
                    "Archive symbolic links are not followed",
                );
                continue;
            }

            let Some(relative_path) = safe_archive_relative(relative_name) else {
                push_archive_group(
                    &mut content,
                    "unsafe-archive-path",
                    relative_name,
                    "unsupported",
                    size,
                    "Unsafe archive path was rejected",
                );
                continue;
            };
            let Some((disposition, group_id, display_path, reason)) =
                archive_file_group(&relative_path)
            else {
                continue;
            };

            if disposition == "include" && !destinations.insert(relative_path.clone()) {
                let display = relative_path.to_string_lossy().to_string();
                conflicts.push(MigrationConflict {
                    kind: "archive-path".into(),
                    message: format!("Multiple archive entries target {display}"),
                    suggested_resolution: "The higher-priority archive entry will be used".into(),
                });
                push_archive_group(
                    &mut content,
                    "shadowed-archive-entry",
                    &display,
                    "skip",
                    size,
                    "A higher-priority archive entry targets the same path",
                );
                continue;
            }

            push_archive_group(
                &mut content,
                &group_id,
                &display_path,
                disposition,
                size,
                reason,
            );
            if disposition == "include" {
                total_files += 1;
                total_bytes = total_bytes.saturating_add(size);
                files.push(ArchiveFilePlan {
                    index,
                    display_path: relative_path.to_string_lossy().to_string(),
                    relative_path,
                    size,
                });
            }
        }
    }

    let pending_remote_files = parsed.files.len();
    if pending_remote_files > 0 {
        let remote_bytes = parsed
            .files
            .iter()
            .filter_map(|file| file.size)
            .fold(0u64, u64::saturating_add);
        content.push(MigrationContentGroup {
            id: "archive-dependencies".into(),
            relative_path: "manifest dependencies".into(),
            disposition: "unsupported".into(),
            file_count: pending_remote_files,
            total_bytes: remote_bytes,
            reason: Some(
                "Remote dependencies are reported for installation after migration".into(),
            ),
        });
    }
    let unsupported_count = content
        .iter()
        .filter(|group| group.disposition == "unsupported")
        .count();
    if unsupported_count > 0 {
        warnings.push(format!(
            "{unsupported_count} unsupported archive content group(s) will not be copied"
        ));
    }
    if total_files == 0 {
        warnings.push("The archive contains no portable local game data to copy".into());
    }

    Ok(LauncherArchivePlan {
        files,
        content,
        conflicts,
        warnings,
        total_files,
        total_bytes,
        pending_remote_files,
    })
}

fn safe_archive_relative(name: &str) -> Option<PathBuf> {
    if name.is_empty() || name.starts_with('/') || name.contains('\\') || name.contains('\0') {
        return None;
    }
    let mut path = PathBuf::new();
    for component in name.split('/') {
        if component.is_empty() || component == "." || component == ".." || component.contains(':')
        {
            return None;
        }
        path.push(component);
    }
    Some(path)
}

fn archive_entry_is_symlink(entry: &zip::read::ZipFile<'_>) -> bool {
    entry
        .unix_mode()
        .map(|mode| mode & 0o170000 == 0o120000)
        .unwrap_or(false)
}

fn archive_file_group(path: &Path) -> Option<(&'static str, String, String, &'static str)> {
    let mut components = path.components();
    let first = components.next()?.as_os_str().to_str()?;
    let only_one = components.next().is_none();
    if MINECRAFT_GAME_DIRS.contains(&first) {
        return Some((
            "include",
            first.to_string(),
            first.to_string(),
            "Portable game content",
        ));
    }
    if only_one && MINECRAFT_GAME_FILES.contains(&first) {
        return Some((
            "include",
            "settings".into(),
            "options, servers, and icon".into(),
            "Portable game settings",
        ));
    }
    if SKIPPED_GAME_DIRS.contains(&first) {
        return Some((
            "skip",
            first.to_string(),
            first.to_string(),
            "Launcher-managed or diagnostic data is rebuilt on demand",
        ));
    }
    Some((
        "unsupported",
        "unsupported-archive-content".into(),
        "unrecognized archive content".into(),
        "Unrecognized content requires manual review",
    ))
}

fn push_archive_group(
    content: &mut Vec<MigrationContentGroup>,
    id: &str,
    relative_path: &str,
    disposition: &str,
    bytes: u64,
    reason: &str,
) {
    if let Some(group) = content
        .iter_mut()
        .find(|group| group.id == id && group.disposition == disposition)
    {
        group.file_count += 1;
        group.total_bytes = group.total_bytes.saturating_add(bytes);
        return;
    }
    content.push(MigrationContentGroup {
        id: id.into(),
        relative_path: relative_path.into(),
        disposition: disposition.into(),
        file_count: 1,
        total_bytes: bytes,
        reason: Some(reason.into()),
    });
}

fn selected_game_entry(source: &ImportableInstance, entry: &str) -> (PathBuf, bool) {
    if source.source_kind == "version" {
        let isolated = source.source_path.join(entry);
        if isolated.exists() {
            return (isolated, true);
        }
    }
    (source.game_dir.join(entry), false)
}

fn version_metadata_summary(source: &ImportableInstance) -> Result<PathSummary, String> {
    if source.source_kind != "version" {
        return Ok(PathSummary::default());
    }

    let mut summary = PathSummary::default();
    for entry in fs::read_dir(&source.source_path).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if is_minecraft_game_data_entry(&entry.file_name()) {
            continue;
        }
        let entry_summary = summarize_path_details(&entry.path())?;
        summary.file_count += entry_summary.file_count;
        summary.total_bytes = summary
            .total_bytes
            .saturating_add(entry_summary.total_bytes);
        summary.symlink_count += entry_summary.symlink_count;
    }
    Ok(summary)
}

/// Build a deterministic, read-only migration plan for one launcher instance.
pub fn preview_import(
    source_path: &Path,
    existing_names: &[String],
) -> Result<MigrationPreview, String> {
    let source = import_metadata(source_path)?;
    if source.source_kind == "archive" {
        return preview_archive(source, existing_names);
    }
    if !is_regular_directory(&source.game_dir) {
        return Err(format!(
            "Game directory does not exist: {}",
            source.game_dir.display()
        ));
    }

    let existing: HashSet<String> = existing_names
        .iter()
        .map(|name| name.trim().to_lowercase())
        .collect();
    let name_conflict = existing.contains(&source.name.trim().to_lowercase());
    let suggested_name = if name_conflict {
        unique_migration_name(&source.name, &source.launcher_type, &existing)
    } else {
        source.name.clone()
    };

    let mut content = Vec::new();
    let mut total_files = 0usize;
    let mut total_bytes = 0u64;

    for entry in MINECRAFT_GAME_DIRS {
        let (path, isolated) = selected_game_entry(&source, entry);
        if path.exists() {
            let summary = summarize_path_details(&path)?;
            if summary.file_count > 0 {
                total_files += summary.file_count;
                total_bytes = total_bytes.saturating_add(summary.total_bytes);
                content.push(MigrationContentGroup {
                    id: (*entry).to_string(),
                    relative_path: (*entry).to_string(),
                    disposition: "include".into(),
                    file_count: summary.file_count,
                    total_bytes: summary.total_bytes,
                    reason: isolated.then(|| "Using isolated version content".into()),
                });
            }
            if summary.symlink_count > 0 {
                content.push(MigrationContentGroup {
                    id: format!("unsupported-symlinks-{entry}"),
                    relative_path: format!("{entry} (symbolic links)"),
                    disposition: "unsupported".into(),
                    file_count: summary.symlink_count,
                    total_bytes: 0,
                    reason: Some("Symbolic links are not followed during migration".into()),
                });
            }
        }
    }

    let mut settings_files = 0usize;
    let mut settings_bytes = 0u64;
    let mut has_isolated_settings = false;
    for entry in MINECRAFT_GAME_FILES {
        let (path, isolated) = selected_game_entry(&source, entry);
        if is_regular_file(&path) {
            let (file_count, bytes) = summarize_path(&path)?;
            settings_files += file_count;
            settings_bytes = settings_bytes.saturating_add(bytes);
            has_isolated_settings |= isolated;
        }
    }
    if settings_files > 0 {
        total_files += settings_files;
        total_bytes = total_bytes.saturating_add(settings_bytes);
        content.push(MigrationContentGroup {
            id: "settings".into(),
            relative_path: "options, servers, and icon".into(),
            disposition: "include".into(),
            file_count: settings_files,
            total_bytes: settings_bytes,
            reason: has_isolated_settings.then(|| "Using isolated version content".into()),
        });
    }

    let version_summary = version_metadata_summary(&source)?;
    if version_summary.file_count > 0 {
        total_files += version_summary.file_count;
        total_bytes = total_bytes.saturating_add(version_summary.total_bytes);
        content.push(MigrationContentGroup {
            id: "version-metadata".into(),
            relative_path: format!(
                "versions/{}",
                source.version_id.as_deref().unwrap_or("selected")
            ),
            disposition: "include".into(),
            file_count: version_summary.file_count,
            total_bytes: version_summary.total_bytes,
            reason: Some("Required to preserve the selected launch profile".into()),
        });
    }
    if version_summary.symlink_count > 0 {
        content.push(MigrationContentGroup {
            id: "unsupported-version-symlinks".into(),
            relative_path: "selected version symbolic links".into(),
            disposition: "unsupported".into(),
            file_count: version_summary.symlink_count,
            total_bytes: 0,
            reason: Some("Symbolic links are not followed during migration".into()),
        });
    }

    let game_icon = source.game_dir.join("icon.png");
    if let Some(icon_source) = source
        .icon_source
        .as_ref()
        .filter(|icon_source| *icon_source != &game_icon)
    {
        let (file_count, bytes) = summarize_path(icon_source)?;
        total_files += file_count;
        total_bytes = total_bytes.saturating_add(bytes);
        content.push(MigrationContentGroup {
            id: "launcher-icon".into(),
            relative_path: "launcher icon".into(),
            disposition: "include".into(),
            file_count,
            total_bytes: bytes,
            reason: None,
        });
    }

    for entry in SKIPPED_GAME_DIRS {
        let (path, _) = selected_game_entry(&source, entry);
        if path.exists() {
            let (file_count, bytes) = summarize_path(&path)?;
            content.push(MigrationContentGroup {
                id: (*entry).to_string(),
                relative_path: (*entry).to_string(),
                disposition: "skip".into(),
                file_count,
                total_bytes: bytes,
                reason: Some("Launcher-managed or diagnostic data is rebuilt on demand".into()),
            });
        }
    }

    let known_entries = MINECRAFT_GAME_DIRS
        .iter()
        .chain(MINECRAFT_GAME_FILES.iter())
        .chain(SKIPPED_GAME_DIRS.iter())
        .copied()
        .collect::<HashSet<_>>();
    for entry in fs::read_dir(&source.game_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if known_entries.contains(name.as_str())
            || (source.source_kind == "version" && name == "versions")
        {
            continue;
        }
        let summary = summarize_path_details(&entry.path())?;
        let is_symlink = fs::symlink_metadata(entry.path())
            .map_err(|error| error.to_string())?
            .file_type()
            .is_symlink();
        content.push(MigrationContentGroup {
            id: format!("unsupported-{name}"),
            relative_path: name,
            disposition: "unsupported".into(),
            file_count: summary.file_count + summary.symlink_count,
            total_bytes: summary.total_bytes,
            reason: Some(if is_symlink {
                "Symbolic links are not followed during migration".into()
            } else {
                "Unrecognized content requires manual review".into()
            }),
        });
    }

    let mut conflicts = Vec::new();
    if name_conflict {
        conflicts.push(MigrationConflict {
            kind: "name".into(),
            message: format!("An instance named ‘{}’ already exists", source.name),
            suggested_resolution: format!("Import as ‘{suggested_name}’"),
        });
    }

    let mut warnings = Vec::new();
    if source.minecraft_version.is_none() && source.version_id.is_none() {
        warnings.push(
            "Minecraft version could not be identified; select a version after import".into(),
        );
    }
    let unsupported_count = content
        .iter()
        .filter(|group| group.disposition == "unsupported")
        .count();
    if unsupported_count > 0 {
        warnings.push(format!(
            "{unsupported_count} unsupported content group(s) will not be copied"
        ));
    }

    Ok(MigrationPreview {
        source,
        suggested_name,
        name_conflict,
        content,
        conflicts,
        warnings,
        total_files,
        total_bytes,
        can_import: true,
    })
}

/// Copy only content represented as included by [`preview_import`].
///
/// The source tree is opened read-only. Callers own destination rollback when
/// this function returns an error or observes cancellation.
pub fn copy_reviewed_content<C, P>(
    source_path: &Path,
    destination: &Path,
    is_cancelled: C,
    mut on_progress: P,
) -> Result<MigrationCopyResult, String>
where
    C: Fn() -> bool,
    P: FnMut(MigrationProgress),
{
    let preview = preview_import(source_path, &[])?;
    if preview.source.source_kind == "archive" {
        return copy_reviewed_archive(source_path, destination, is_cancelled, on_progress);
    }
    let game_dir = preview.source.game_dir.clone();
    let mut result = MigrationCopyResult {
        copied_files: 0,
        copied_bytes: 0,
        skipped_symlinks: 0,
        pending_remote_files: 0,
        imported_icon: None,
    };
    let mut created_files = Vec::new();
    let mut created_dirs = Vec::new();

    let copy_result = (|| -> Result<(), String> {
        for entry in MINECRAFT_GAME_DIRS {
            let (source, isolated) = selected_game_entry(&preview.source, entry);
            if source.exists() {
                let source_root = if isolated {
                    &preview.source.source_path
                } else {
                    &game_dir
                };
                copy_reviewed_path(
                    &source,
                    &destination.join(entry),
                    source_root,
                    &is_cancelled,
                    &mut on_progress,
                    preview.total_files,
                    preview.total_bytes,
                    &mut result,
                    &mut created_files,
                    &mut created_dirs,
                )?;
            }
        }

        for entry in MINECRAFT_GAME_FILES {
            let (source, isolated) = selected_game_entry(&preview.source, entry);
            if source.is_file() {
                let source_root = if isolated {
                    &preview.source.source_path
                } else {
                    &game_dir
                };
                copy_reviewed_path(
                    &source,
                    &destination.join(entry),
                    source_root,
                    &is_cancelled,
                    &mut on_progress,
                    preview.total_files,
                    preview.total_bytes,
                    &mut result,
                    &mut created_files,
                    &mut created_dirs,
                )?;
            }
        }

        if preview.source.source_kind == "version" {
            let version_id = preview.source.version_id.as_deref().unwrap_or("selected");
            let destination_version = destination.join("versions").join(version_id);
            for entry in
                fs::read_dir(&preview.source.source_path).map_err(|error| error.to_string())?
            {
                let entry = entry.map_err(|error| error.to_string())?;
                if is_minecraft_game_data_entry(&entry.file_name()) {
                    continue;
                }
                copy_reviewed_path(
                    &entry.path(),
                    &destination_version.join(entry.file_name()),
                    &preview.source.source_path,
                    &is_cancelled,
                    &mut on_progress,
                    preview.total_files,
                    preview.total_bytes,
                    &mut result,
                    &mut created_files,
                    &mut created_dirs,
                )?;
            }
        }

        let game_icon = game_dir.join("icon.png");
        if let Some(icon_source) = preview
            .source
            .icon_source
            .as_ref()
            .filter(|icon_source| *icon_source != &game_icon)
        {
            let icon_name = imported_icon_name(icon_source);
            copy_reviewed_path(
                icon_source,
                &destination.join(&icon_name),
                icon_source.parent().unwrap_or(icon_source),
                &is_cancelled,
                &mut on_progress,
                preview.total_files,
                preview.total_bytes,
                &mut result,
                &mut created_files,
                &mut created_dirs,
            )?;
            result.imported_icon = Some(icon_name);
        } else if destination.join("icon.png").is_file() {
            result.imported_icon = Some("icon.png".into());
        }

        Ok(())
    })();

    if let Err(error) = copy_result {
        for path in created_files.iter().rev() {
            let _ = fs::remove_file(path);
        }
        for path in created_dirs.iter().rev() {
            let _ = fs::remove_dir(path);
        }
        return Err(error);
    }

    Ok(result)
}

fn copy_reviewed_archive<C, P>(
    source_path: &Path,
    destination: &Path,
    is_cancelled: C,
    mut on_progress: P,
) -> Result<MigrationCopyResult, String>
where
    C: Fn() -> bool,
    P: FnMut(MigrationProgress),
{
    let plan = build_launcher_archive_plan(source_path)?;
    let file = fs::File::open(source_path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    let mut result = MigrationCopyResult {
        copied_files: 0,
        copied_bytes: 0,
        skipped_symlinks: 0,
        pending_remote_files: plan.pending_remote_files,
        imported_icon: None,
    };
    let mut created_files = Vec::new();

    let copy_result = (|| -> Result<(), String> {
        for planned in &plan.files {
            if is_cancelled() {
                return Err("migration-cancelled".into());
            }
            let mut entry = archive
                .by_index(planned.index)
                .map_err(|error| error.to_string())?;
            if entry.is_dir() || archive_entry_is_symlink(&entry) {
                continue;
            }

            let output_path = destination.join(&planned.relative_path);
            if output_path.exists() {
                return Err(format!("destination-conflict:{}", output_path.display()));
            }
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            let mut output = fs::File::create(&output_path).map_err(|error| error.to_string())?;
            created_files.push(output_path);
            let copied = io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
            if copied != planned.size {
                return Err(format!("archive-size-mismatch:{}", planned.display_path));
            }
            result.copied_files += 1;
            result.copied_bytes = result.copied_bytes.saturating_add(copied);
            on_progress(MigrationProgress {
                completed_files: result.copied_files,
                total_files: plan.total_files,
                completed_bytes: result.copied_bytes,
                total_bytes: plan.total_bytes,
                current_path: planned.display_path.clone(),
            });
        }
        Ok(())
    })();

    if let Err(error) = copy_result {
        for path in created_files.iter().rev() {
            let _ = fs::remove_file(path);
        }
        return Err(error);
    }
    if destination.join("icon.png").is_file() {
        result.imported_icon = Some("icon.png".into());
    }
    Ok(result)
}

pub fn build_compatibility_report(
    source: &ImportableInstance,
    copied: &MigrationCopyResult,
) -> (String, Vec<MigrationCompatibilityCheck>) {
    let mut checks = Vec::new();

    checks.push(
        if source.version_id.is_some() || source.minecraft_version.is_some() {
            MigrationCompatibilityCheck {
                id: "version".into(),
                status: "ready".into(),
                summary: source
                    .minecraft_version
                    .as_ref()
                    .or(source.version_id.as_ref())
                    .map(|version| format!("Minecraft {version} identified"))
                    .unwrap_or_else(|| "Minecraft version identified".into()),
                action: None,
            }
        } else {
            MigrationCompatibilityCheck {
                id: "version".into(),
                status: "action-required".into(),
                summary: "Minecraft version could not be identified".into(),
                action: Some("Choose a Minecraft version before the first launch".into()),
            }
        },
    );

    checks.push(match source.mod_loader.as_deref() {
        None => MigrationCompatibilityCheck {
            id: "loader".into(),
            status: "ready".into(),
            summary: "Vanilla or inherited loader configuration".into(),
            action: None,
        },
        Some("fabric" | "forge" | "neoforge" | "quilt") if source.source_kind == "version" => {
            MigrationCompatibilityCheck {
                id: "loader".into(),
                status: "ready".into(),
                summary: format!(
                    "{} loader profile preserved",
                    source.mod_loader.as_deref().unwrap_or_default()
                ),
                action: None,
            }
        }
        Some("fabric" | "forge" | "neoforge" | "quilt") => MigrationCompatibilityCheck {
            id: "loader".into(),
            status: "action-required".into(),
            summary: format!(
                "{} metadata was identified, but its launcher profile was not imported",
                source.mod_loader.as_deref().unwrap_or_default()
            ),
            action: Some(format!(
                "Install {}{} for Minecraft {} before the first launch",
                source.mod_loader.as_deref().unwrap_or_default(),
                source
                    .mod_loader_version
                    .as_deref()
                    .map(|version| format!(" {version}"))
                    .unwrap_or_default(),
                source
                    .minecraft_version
                    .as_deref()
                    .or(source.version_id.as_deref())
                    .unwrap_or("the imported version")
            )),
        },
        Some(loader) => MigrationCompatibilityCheck {
            id: "loader".into(),
            status: "action-required".into(),
            summary: format!("Unsupported loader metadata: {loader}"),
            action: Some("Select a supported loader before the first launch".into()),
        },
    });

    checks.push(match source.java_path_override.as_deref() {
        Some(path) if Path::new(path).is_file() => MigrationCompatibilityCheck {
            id: "java".into(),
            status: "ready".into(),
            summary: "Source Java override is available".into(),
            action: None,
        },
        Some(_) => MigrationCompatibilityCheck {
            id: "java".into(),
            status: "action-required".into(),
            summary: "Source Java override is unavailable on this system".into(),
            action: Some("Choose an installed Java runtime or clear the override".into()),
        },
        None => MigrationCompatibilityCheck {
            id: "java".into(),
            status: "ready".into(),
            summary: "DropOut will resolve a compatible Java runtime".into(),
            action: None,
        },
    });

    checks.push(match source.memory_override.as_ref() {
        Some(memory) if memory.min > memory.max || memory.min < 256 => {
            MigrationCompatibilityCheck {
                id: "memory".into(),
                status: "action-required".into(),
                summary: format!("Invalid memory override: {}–{} MB", memory.min, memory.max),
                action: Some("Set maximum memory greater than or equal to minimum memory".into()),
            }
        }
        Some(memory) => MigrationCompatibilityCheck {
            id: "memory".into(),
            status: "ready".into(),
            summary: format!(
                "Memory override preserved: {}–{} MB",
                memory.min, memory.max
            ),
            action: None,
        },
        None => MigrationCompatibilityCheck {
            id: "memory".into(),
            status: "ready".into(),
            summary: "DropOut default memory settings will be used".into(),
            action: None,
        },
    });

    if copied.skipped_symlinks > 0 {
        checks.push(MigrationCompatibilityCheck {
            id: "symlinks".into(),
            status: "warning".into(),
            summary: format!(
                "{} symbolic link(s) were not copied",
                copied.skipped_symlinks
            ),
            action: Some("Copy the linked targets manually if the instance needs them".into()),
        });
    }

    if copied.pending_remote_files > 0 {
        checks.push(MigrationCompatibilityCheck {
            id: "archive-dependencies".into(),
            status: "action-required".into(),
            summary: format!(
                "{} remote archive dependency file(s) still need installation",
                copied.pending_remote_files
            ),
            action: Some(
                "Install the reported mods and packs from the instance content browser before launch"
                    .into(),
            ),
        });
    }

    if source.icon_source.is_some() {
        checks.push(if copied.imported_icon.is_some() {
            MigrationCompatibilityCheck {
                id: "icon".into(),
                status: "ready".into(),
                summary: "Launcher icon preserved".into(),
                action: None,
            }
        } else {
            MigrationCompatibilityCheck {
                id: "icon".into(),
                status: "warning".into(),
                summary: "Launcher icon could not be copied".into(),
                action: Some("Choose a replacement icon in instance settings".into()),
            }
        });
    }

    let status = if checks.iter().any(|check| check.status == "action-required") {
        "action-required"
    } else {
        "ready-to-validate"
    };
    (status.into(), checks)
}

#[allow(clippy::too_many_arguments)]
fn copy_reviewed_path<C, P>(
    source: &Path,
    destination: &Path,
    source_root: &Path,
    is_cancelled: &C,
    on_progress: &mut P,
    total_files: usize,
    total_bytes: u64,
    result: &mut MigrationCopyResult,
    created_files: &mut Vec<PathBuf>,
    created_dirs: &mut Vec<PathBuf>,
) -> Result<(), String>
where
    C: Fn() -> bool,
    P: FnMut(MigrationProgress),
{
    if is_cancelled() {
        return Err("migration-cancelled".into());
    }

    let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        result.skipped_symlinks += 1;
        return Ok(());
    }

    if metadata.is_dir() {
        let directory_existed = destination.exists();
        fs::create_dir_all(destination).map_err(|error| error.to_string())?;
        if !directory_existed {
            created_dirs.push(destination.to_path_buf());
        }
        for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            copy_reviewed_path(
                &entry.path(),
                &destination.join(entry.file_name()),
                source_root,
                is_cancelled,
                on_progress,
                total_files,
                total_bytes,
                result,
                created_files,
                created_dirs,
            )?;
        }
        return Ok(());
    }

    if !metadata.is_file() {
        return Ok(());
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if destination.exists() {
        return Err(format!("destination-conflict:{}", destination.display()));
    }
    fs::copy(source, destination).map_err(|error| error.to_string())?;
    created_files.push(destination.to_path_buf());
    result.copied_files += 1;
    result.copied_bytes = result.copied_bytes.saturating_add(metadata.len());
    on_progress(MigrationProgress {
        completed_files: result.copied_files,
        total_files,
        completed_bytes: result.copied_bytes,
        total_bytes,
        current_path: source
            .strip_prefix(source_root)
            .unwrap_or(source)
            .to_string_lossy()
            .to_string(),
    });
    Ok(())
}

fn unique_migration_name(
    source_name: &str,
    launcher_type: &str,
    existing_names: &HashSet<String>,
) -> String {
    let launcher = match launcher_type {
        "prism" | "multimc-compatible" => "Prism",
        "multimc" => "MultiMC",
        "hmcl" => "HMCL",
        "pcl" => "PCL",
        "modrinth" => "Modrinth",
        "curseforge" => "CurseForge",
        "portable-archive" => "Archive",
        _ => "Imported",
    };
    let base = format!("{} ({launcher})", source_name.trim());
    if !existing_names.contains(&base.to_lowercase()) {
        return base;
    }

    for suffix in 2.. {
        let candidate = format!("{base} {suffix}");
        if !existing_names.contains(&candidate.to_lowercase()) {
            return candidate;
        }
    }
    unreachable!()
}

#[derive(Default)]
struct PathSummary {
    file_count: usize,
    total_bytes: u64,
    symlink_count: usize,
}

fn summarize_path_details(path: &Path) -> Result<PathSummary, String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Ok(PathSummary {
            symlink_count: 1,
            ..PathSummary::default()
        });
    }
    if metadata.is_file() {
        return Ok(PathSummary {
            file_count: 1,
            total_bytes: metadata.len(),
            symlink_count: 0,
        });
    }
    if !metadata.is_dir() {
        return Ok(PathSummary::default());
    }

    let mut summary = PathSummary::default();
    for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_summary = summarize_path_details(&entry.path())?;
        summary.file_count += entry_summary.file_count;
        summary.total_bytes = summary
            .total_bytes
            .saturating_add(entry_summary.total_bytes);
        summary.symlink_count += entry_summary.symlink_count;
    }
    Ok(summary)
}

fn summarize_path(path: &Path) -> Result<(usize, u64), String> {
    let summary = summarize_path_details(path)?;
    Ok((summary.file_count, summary.total_bytes))
}

fn push_if_importable(
    path: &Path,
    seen: &mut HashSet<PathBuf>,
    result: &mut Vec<ImportableInstance>,
) {
    if let Some(instance) = parse_importable(path) {
        if seen.insert(instance.source_path.clone()) {
            result.push(instance);
        }
    }
}

fn parse_importable(path: &Path) -> Option<ImportableInstance> {
    if is_regular_file(&path.join("instance.cfg")) || is_regular_file(&path.join("mmc-pack.json")) {
        return Some(parse_multimc_instance(path));
    }

    parse_minecraft_version_dir(path)
}

/// Copy a launcher instance's game files into a DropOut game directory.
pub fn copy_instance_files(source_path: &Path, dest_game_dir: &Path) -> Result<(), String> {
    if let Some(version_game_dir) = game_dir_from_version_dir(source_path) {
        copy_minecraft_game_files(&version_game_dir, dest_game_dir)?;
        copy_minecraft_game_files(source_path, dest_game_dir)?;
        return copy_selected_version_dir(source_path, dest_game_dir);
    }

    // MultiMC/Prism keep game files in .minecraft/ or minecraft/
    let game_src = if is_regular_directory(&source_path.join(".minecraft")) {
        source_path.join(".minecraft")
    } else if is_regular_directory(&source_path.join("minecraft")) {
        source_path.join("minecraft")
    } else {
        // Fallback: copy everything except instance.cfg and mmc-pack.json
        source_path.to_path_buf()
    };

    copy_dir_recursive(&game_src, dest_game_dir)
}

// --- Helpers ---

fn parse_multimc_instance(path: &Path) -> ImportableInstance {
    let cfg = fs::read_to_string(path.join("instance.cfg")).unwrap_or_default();
    let name = cfg_value(&cfg, "name").unwrap_or_else(|| {
        path.file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "Imported".to_string())
    });

    let (mc_version, mod_loader, mod_loader_version) =
        match fs::read_to_string(path.join("mmc-pack.json")) {
            Ok(content) => {
                let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
                parse_mmc_components(&json)
            }
            Err(_) => (cfg_value(&cfg, "IntendedVersion"), None, None),
        };

    let memory_override = cfg_bool(&cfg, "OverrideMemory")
        .then(|| {
            Some(MigrationMemoryOverride {
                min: cfg_u32(&cfg, "MinMemAlloc")?,
                max: cfg_u32(&cfg, "MaxMemAlloc")?,
            })
        })
        .flatten();
    let java_path_override = cfg_bool(&cfg, "OverrideJavaLocation")
        .then(|| cfg_value(&cfg, "JavaPath"))
        .flatten()
        .filter(|path| !path.is_empty());
    let jvm_args_override = cfg_bool(&cfg, "OverrideJavaArgs")
        .then(|| cfg_value(&cfg, "JvmArgs"))
        .flatten()
        .filter(|args| !args.is_empty());
    let game_dir = multimc_game_dir(path);
    let icon_source = resolve_multimc_icon(path, &game_dir, &cfg);

    ImportableInstance {
        source_path: path.to_path_buf(),
        game_dir,
        launcher_type: launcher_type_for_instance(path),
        source_kind: "instance".into(),
        version_id: mc_version.clone(),
        name,
        minecraft_version: mc_version,
        mod_loader,
        mod_loader_version,
        notes: cfg_value(&cfg, "notes").filter(|notes| !notes.is_empty()),
        memory_override,
        java_path_override,
        jvm_args_override,
        icon_source,
    }
}

fn parse_minecraft_version_dir(path: &Path) -> Option<ImportableInstance> {
    let version_id = path.file_name()?.to_string_lossy().to_string();
    let version_json = minecraft_version_json(path)?;

    let game_dir = game_dir_from_version_dir(path)?;
    let content = fs::read_to_string(&version_json).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    let (minecraft_version, mod_loader, mod_loader_version) =
        parse_version_json_metadata(&version_id, &json);
    let launcher_type = launcher_type_for_game_dir(&game_dir);

    Some(ImportableInstance {
        source_path: path.to_path_buf(),
        game_dir,
        launcher_type,
        source_kind: "version".into(),
        version_id: Some(version_id.clone()),
        name: version_id,
        minecraft_version,
        mod_loader,
        mod_loader_version,
        notes: None,
        memory_override: None,
        java_path_override: None,
        jvm_args_override: None,
        icon_source: None,
    })
}

fn scan_minecraft_versions(
    game_dir: &Path,
    seen: &mut HashSet<PathBuf>,
    result: &mut Vec<ImportableInstance>,
) {
    let versions_dir = game_dir.join("versions");
    let Ok(entries) = fs::read_dir(versions_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !is_regular_directory(&path) {
            continue;
        }
        push_if_importable(&path, seen, result);
    }
}

fn scan_minecraft_versions_once(
    game_dir: &Path,
    scanned_version_roots: &mut HashSet<PathBuf>,
    seen: &mut HashSet<PathBuf>,
    result: &mut Vec<ImportableInstance>,
) {
    let versions_dir = game_dir.join("versions");
    let key = fs::canonicalize(&versions_dir).unwrap_or(versions_dir);
    if scanned_version_roots.insert(key) {
        scan_minecraft_versions(game_dir, seen, result);
    }
}

fn cfg_value(content: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}=");
    content
        .lines()
        .find_map(|line| Some(line.strip_prefix(&prefix)?.trim().to_string()))
}

fn cfg_bool(content: &str, key: &str) -> bool {
    cfg_value(content, key)
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

fn cfg_u32(content: &str, key: &str) -> Option<u32> {
    cfg_value(content, key)?.parse().ok()
}

fn parse_mmc_components(
    json: &serde_json::Value,
) -> (Option<String>, Option<String>, Option<String>) {
    let mut mc_version = None;
    let mut mod_loader = None;
    let mut mod_loader_version = None;

    for component in json["components"].as_array().into_iter().flatten() {
        let version = component["version"].as_str().map(String::from);
        match component["uid"].as_str().unwrap_or("") {
            "net.minecraft" => mc_version = version,
            "net.minecraftforge" => {
                mod_loader = Some("forge".into());
                mod_loader_version = version;
            }
            "net.neoforged" => {
                mod_loader = Some("neoforge".into());
                mod_loader_version = version;
            }
            "net.fabricmc.fabric-loader" => {
                mod_loader = Some("fabric".into());
                mod_loader_version = version;
            }
            "org.quiltmc.quilt-loader" => {
                mod_loader = Some("quilt".into());
                mod_loader_version = version;
            }
            _ => {}
        }
    }

    (mc_version, mod_loader, mod_loader_version)
}

fn parse_version_json_metadata(
    version_id: &str,
    json: &serde_json::Value,
) -> (Option<String>, Option<String>, Option<String>) {
    let minecraft_version = json["inheritsFrom"]
        .as_str()
        .or_else(|| json["id"].as_str())
        .map(String::from);

    let mut mod_loader = None;
    let mut mod_loader_version = None;
    let id_lower = version_id.to_lowercase();

    if id_lower.contains("fabric") {
        mod_loader = Some("fabric".into());
    } else if id_lower.contains("neoforge") || id_lower.contains("neo-forge") {
        mod_loader = Some("neoforge".into());
    } else if id_lower.contains("forge") {
        mod_loader = Some("forge".into());
    } else if id_lower.contains("quilt") {
        mod_loader = Some("quilt".into());
    }

    for library in json["libraries"].as_array().into_iter().flatten() {
        let Some(name) = library["name"].as_str() else {
            continue;
        };

        if name.starts_with("net.fabricmc:fabric-loader:") {
            mod_loader = Some("fabric".into());
            mod_loader_version = name.split(':').nth(2).map(String::from);
        } else if name.starts_with("net.minecraftforge:forge:") {
            mod_loader = Some("forge".into());
            mod_loader_version = name.split(':').nth(2).map(String::from);
        } else if name.starts_with("net.neoforged:neoforge:") {
            mod_loader = Some("neoforge".into());
            mod_loader_version = name.split(':').nth(2).map(String::from);
        } else if name.starts_with("org.quiltmc:quilt-loader:") {
            mod_loader = Some("quilt".into());
            mod_loader_version = name.split(':').nth(2).map(String::from);
        }
    }

    (minecraft_version, mod_loader, mod_loader_version)
}

fn multimc_game_dir(path: &Path) -> PathBuf {
    if is_regular_directory(&path.join(".minecraft")) {
        path.join(".minecraft")
    } else if is_regular_directory(&path.join("minecraft")) {
        path.join("minecraft")
    } else {
        path.to_path_buf()
    }
}

fn resolve_multimc_icon(path: &Path, game_dir: &Path, cfg: &str) -> Option<PathBuf> {
    let game_icon = game_dir.join("icon.png");
    if is_regular_file(&game_icon) {
        return Some(game_icon);
    }

    let icon_key = cfg_value(cfg, "iconKey")?;
    if icon_key.is_empty() || icon_key == "default" {
        return None;
    }
    let safe_icon_key = Path::new(&icon_key).file_name()?.to_string_lossy();
    if safe_icon_key != icon_key {
        return None;
    }

    let launcher_root = path.parent()?.parent()?;
    let icons_dir = launcher_root.join("icons");
    let key_path = Path::new(icon_key.as_str());
    if key_path.extension().is_some() {
        let candidate = icons_dir.join(key_path);
        return is_regular_file(&candidate).then_some(candidate);
    }

    ["png", "svg", "jpg", "jpeg", "webp"]
        .into_iter()
        .map(|extension| icons_dir.join(format!("{icon_key}.{extension}")))
        .find(|candidate| is_regular_file(candidate))
}

fn imported_icon_name(source: &Path) -> String {
    source
        .extension()
        .and_then(OsStr::to_str)
        .filter(|extension| !extension.is_empty())
        .map(|extension| format!("icon.{}", extension.to_lowercase()))
        .unwrap_or_else(|| "icon.png".into())
}

fn game_dir_from_version_dir(path: &Path) -> Option<PathBuf> {
    let versions = path.parent()?;
    if versions.file_name()? != "versions" {
        return None;
    }
    versions.parent().map(Path::to_path_buf)
}

fn minecraft_version_json(path: &Path) -> Option<PathBuf> {
    let version_id = path.file_name()?.to_string_lossy();
    let version_json = path.join(format!("{version_id}.json"));
    is_regular_file(&version_json).then_some(version_json)
}

fn launcher_type_for_instance(path: &Path) -> String {
    path.ancestors()
        .filter_map(|ancestor| {
            ancestor
                .file_name()
                .map(|name| name.to_string_lossy().to_lowercase())
        })
        .find_map(|name| {
            if name.contains("prism") {
                Some("prism".to_string())
            } else if name.contains("multimc") {
                Some("multimc".to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "multimc-compatible".into())
}

fn launcher_type_for_game_dir(path: &Path) -> String {
    let normalized = path.to_string_lossy().to_lowercase();
    if normalized.contains("hmcl") {
        "hmcl".into()
    } else if normalized.contains("pcl") || normalized.contains("plain craft") {
        "pcl".into()
    } else {
        "pcl-hmcl".into()
    }
}

fn count_instances(dir: &Path) -> usize {
    scan_instances(dir)
        .map(|instances| instances.len())
        .unwrap_or(0)
}

fn launcher_candidates() -> Vec<(String, PathBuf)> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let data_dir = dirs::data_dir();
    let config_dir = dirs::config_dir();
    launcher_candidates_for(
        std::env::consts::OS,
        &home,
        data_dir.as_deref(),
        config_dir.as_deref(),
    )
}

fn launcher_candidates_for(
    platform: &str,
    home: &Path,
    data_dir: Option<&Path>,
    config_dir: Option<&Path>,
) -> Vec<(String, PathBuf)> {
    let mut candidates = Vec::new();
    match platform {
        "linux" => {
            let share = home.join(".local/share");
            candidates.push(("prism".into(), share.join("PrismLauncher/instances")));
            candidates.push((
                "prism".into(),
                home.join(".var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances"),
            ));
            candidates.push(("multimc".into(), share.join("multimc/instances")));
            candidates.push(("multimc".into(), share.join("MultiMC/instances")));
            candidates.push(("pcl-hmcl".into(), home.join(".minecraft")));
            candidates.push(("hmcl".into(), home.join(".hmcl")));
        }
        "macos" => {
            let support = home.join("Library/Application Support");
            candidates.push(("prism".into(), support.join("PrismLauncher/instances")));
            candidates.push(("multimc".into(), support.join("MultiMC/instances")));
            candidates.push(("pcl-hmcl".into(), support.join("minecraft")));
            candidates.push(("hmcl".into(), support.join("HMCL")));
        }
        "windows" => {
            if let Some(appdata) = data_dir {
                candidates.push(("prism".into(), appdata.join("PrismLauncher/instances")));
                candidates.push(("pcl-hmcl".into(), appdata.join(".minecraft")));
                candidates.push(("hmcl".into(), appdata.join("HMCL")));
            }
            if let Some(roaming) = config_dir {
                candidates.push(("multimc".into(), roaming.join("MultiMC/instances")));
                candidates.push(("pcl-hmcl".into(), roaming.join(".minecraft")));
            }
        }
        _ => {}
    }
    candidates
}

fn copy_minecraft_game_files(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;

    for dir in MINECRAFT_GAME_DIRS {
        let src_path = src.join(dir);
        if is_regular_directory(&src_path) {
            copy_dir_recursive(&src_path, &dst.join(dir))?;
        }
    }

    for file in MINECRAFT_GAME_FILES {
        let src_path = src.join(file);
        if is_regular_file(&src_path) {
            fs::copy(&src_path, dst.join(file)).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn copy_selected_version_dir(version_dir: &Path, dest_game_dir: &Path) -> Result<(), String> {
    let Some(version_id) = version_dir.file_name() else {
        return Ok(());
    };

    let dest_version_dir = dest_game_dir.join("versions").join(version_id);
    fs::create_dir_all(&dest_version_dir).map_err(|e| e.to_string())?;

    for entry in fs::read_dir(version_dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let src_path = entry.path();
        let file_name = entry.file_name();
        if is_minecraft_game_data_entry(&file_name) {
            continue;
        }

        let dst_path = dest_version_dir.join(&file_name);
        if is_regular_directory(&src_path) {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if is_regular_file(&src_path) {
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn is_minecraft_game_data_entry(file_name: &OsStr) -> bool {
    MINECRAFT_GAME_DIRS
        .iter()
        .chain(MINECRAFT_GAME_FILES.iter())
        .any(|name| file_name == OsStr::new(name))
}

pub fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !is_regular_directory(src) {
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if is_regular_directory(&src_path) {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if is_regular_file(&src_path) {
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("dropout-migration-{name}-{suffix}"));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn fixture_tree_fingerprint(root: &Path) -> Vec<(PathBuf, Vec<u8>)> {
        fn walk(root: &Path, current: &Path, files: &mut Vec<(PathBuf, Vec<u8>)>) {
            for entry in fs::read_dir(current).unwrap().flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(root, &path, files);
                } else if path.is_file() {
                    files.push((
                        path.strip_prefix(root).unwrap().to_path_buf(),
                        fs::read(path).unwrap(),
                    ));
                }
            }
        }

        let mut files = Vec::new();
        walk(root, root, &mut files);
        files.sort_by(|a, b| a.0.cmp(&b.0));
        files
    }

    fn write_test_archive(path: &Path, entries: &[(&str, &str)]) {
        let file = fs::File::create(path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o644);
        for (name, content) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
    }

    #[test]
    fn versioned_launcher_archive_fixture_matrix_stays_copy_only() {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ArchiveManifest {
            schema_version: u32,
            cases: Vec<ArchiveCase>,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ArchiveCase {
            id: String,
            file_name: String,
            launcher_type: String,
            entries: Vec<ArchiveEntry>,
        }
        #[derive(Deserialize)]
        struct ArchiveEntry {
            path: String,
            content: String,
        }

        let fixture_root =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/migration/v1");
        let manifest: ArchiveManifest = serde_json::from_str(
            &fs::read_to_string(fixture_root.join("archive-manifest.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest.schema_version, 1);
        assert_eq!(manifest.cases.len(), 3);

        for case in manifest.cases {
            let workspace = test_dir(&format!("archive-fixture-{}", case.id));
            let archive_path = workspace.join(case.file_name);
            let destination = test_dir(&format!("archive-fixture-copy-{}", case.id));
            let entries = case
                .entries
                .iter()
                .map(|entry| (entry.path.as_str(), entry.content.as_str()))
                .collect::<Vec<_>>();
            write_test_archive(&archive_path, &entries);
            let source_before = fs::read(&archive_path).unwrap();

            let metadata = import_metadata(&archive_path).unwrap();
            assert_eq!(metadata.source_kind, "archive");
            assert_eq!(metadata.launcher_type, case.launcher_type);
            let preview = preview_import(&archive_path, &[]).unwrap();
            assert!(preview.can_import);
            let copied =
                copy_reviewed_content(&archive_path, &destination, || false, |_| {}).unwrap();
            assert!(copied.copied_files > 0);
            assert_eq!(fs::read(&archive_path).unwrap(), source_before);

            fs::remove_dir_all(workspace).unwrap();
            fs::remove_dir_all(destination).unwrap();
        }
    }

    #[test]
    fn imports_portable_launcher_configuration_and_save_archives_copy_only() {
        let root = test_dir("portable-launcher-archive");
        let archive_path = root.join("HMCL configuration and saves.zip");
        let destination = test_dir("portable-launcher-archive-destination");
        write_test_archive(
            &archive_path,
            &[
                ("config/example.toml", "configured=true"),
                ("saves/Fixture World/level.dat", "world"),
                ("logs/latest.log", "diagnostic"),
                ("../outside.txt", "unsafe"),
            ],
        );
        let source_before = fs::read(&archive_path).unwrap();

        let scanned = scan_instances(&archive_path).unwrap();
        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].source_kind, "archive");
        assert_eq!(scanned[0].launcher_type, "portable-archive");
        let preview = preview_import(&archive_path, &[]).unwrap();
        assert!(preview.can_import);
        assert!(preview.content.iter().any(|group| {
            group.id == "config" && group.disposition == "include" && group.file_count == 1
        }));
        assert!(preview.content.iter().any(|group| {
            group.id == "saves" && group.disposition == "include" && group.file_count == 1
        }));
        assert!(preview.content.iter().any(|group| {
            group.id == "logs" && group.disposition == "skip" && group.file_count == 1
        }));
        assert!(preview.content.iter().any(|group| {
            group.id == "unsafe-archive-path" && group.disposition == "unsupported"
        }));

        let copied = copy_reviewed_content(&archive_path, &destination, || false, |_| {}).unwrap();
        assert_eq!(copied.copied_files, 2);
        assert_eq!(copied.pending_remote_files, 0);
        assert_eq!(
            fs::read_to_string(destination.join("config/example.toml")).unwrap(),
            "configured=true"
        );
        assert_eq!(
            fs::read_to_string(destination.join("saves/Fixture World/level.dat")).unwrap(),
            "world"
        );
        assert!(!destination.join("logs/latest.log").exists());
        assert!(!destination.join("outside.txt").exists());
        assert_eq!(fs::read(&archive_path).unwrap(), source_before);

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(destination).unwrap();
    }

    #[test]
    fn multimc_archives_require_installing_the_detected_loader_profile() {
        let root = test_dir("multimc-launcher-archive");
        let archive_path = root.join("Fabric Fixture.zip");
        let destination = test_dir("multimc-launcher-archive-destination");
        write_test_archive(
            &archive_path,
            &[
                ("Fabric Fixture/instance.cfg", "name=Fabric Fixture\n"),
                (
                    "Fabric Fixture/mmc-pack.json",
                    r#"{"components":[{"uid":"net.minecraft","version":"1.21.1"},{"uid":"net.fabricmc.fabric-loader","version":"0.16.9"}]}"#,
                ),
                ("Fabric Fixture/.minecraft/mods/example.jar", "mod"),
            ],
        );

        let metadata = import_metadata(&archive_path).unwrap();
        assert_eq!(metadata.source_kind, "archive");
        assert_eq!(metadata.launcher_type, "multimc");
        assert_eq!(metadata.minecraft_version.as_deref(), Some("1.21.1"));
        assert_eq!(metadata.mod_loader.as_deref(), Some("fabric"));
        let copied = copy_reviewed_content(&archive_path, &destination, || false, |_| {}).unwrap();
        let (status, checks) = build_compatibility_report(&metadata, &copied);
        assert_eq!(status, "action-required");
        assert!(checks.iter().any(|check| {
            check.id == "loader"
                && check.status == "action-required"
                && check
                    .action
                    .as_deref()
                    .is_some_and(|action| action.contains("fabric 0.16.9"))
        }));
        assert!(destination.join("mods/example.jar").is_file());

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(destination).unwrap();
    }

    #[test]
    fn hmcl_curseforge_archives_report_remote_dependencies_before_launch() {
        let root = test_dir("hmcl-curseforge-archive");
        let archive_path = root.join("HMCL Export.zip");
        let destination = test_dir("hmcl-curseforge-archive-destination");
        write_test_archive(
            &archive_path,
            &[
                (
                    "manifest.json",
                    r#"{"manifestType":"minecraftModpack","name":"HMCL Export","overrides":"overrides","minecraft":{"version":"1.20.1","modLoaders":[{"id":"forge-47.3.0","primary":true}]},"files":[{"projectID":123,"fileID":456}]}"#,
                ),
                ("overrides/config/example.toml", "configured=true"),
                ("overrides/saves/Fixture World/level.dat", "world"),
            ],
        );

        let metadata = import_metadata(&archive_path).unwrap();
        assert_eq!(metadata.launcher_type, "curseforge");
        assert_eq!(metadata.mod_loader.as_deref(), Some("forge"));
        let preview = preview_import(&archive_path, &[]).unwrap();
        assert!(preview.content.iter().any(|group| {
            group.id == "archive-dependencies"
                && group.disposition == "unsupported"
                && group.file_count == 1
        }));
        let copied = copy_reviewed_content(&archive_path, &destination, || false, |_| {}).unwrap();
        assert_eq!(copied.pending_remote_files, 1);
        let (status, checks) = build_compatibility_report(&metadata, &copied);
        assert_eq!(status, "action-required");
        assert!(checks.iter().any(|check| {
            check.id == "archive-dependencies"
                && check.status == "action-required"
                && check.action.is_some()
        }));

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(destination).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_game_roots_are_reported_and_never_followed() {
        use std::os::unix::fs::symlink;

        let root = test_dir("symlinked-game-root");
        let instance = root.join("PrismLauncher/instances/Linked");
        let external = root.join("external-game-data");
        let destination = test_dir("symlinked-game-root-destination");
        fs::create_dir_all(&instance).unwrap();
        fs::create_dir_all(external.join("mods")).unwrap();
        fs::write(instance.join("instance.cfg"), "name=Linked\n").unwrap();
        fs::write(external.join("mods/private.jar"), "outside").unwrap();
        symlink(&external, instance.join(".minecraft")).unwrap();

        let preview = preview_import(&instance, &[]).unwrap();
        assert_eq!(preview.total_files, 0);
        assert!(preview.content.iter().any(|group| {
            group.relative_path == ".minecraft" && group.disposition == "unsupported"
        }));
        let copied = copy_reviewed_content(&instance, &destination, || false, |_| {}).unwrap();
        assert_eq!(copied.copied_files, 0);
        assert!(!destination.join("mods/private.jar").exists());
        assert_eq!(
            fs::read_to_string(external.join("mods/private.jar")).unwrap(),
            "outside"
        );

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(destination).unwrap();
    }

    #[test]
    fn versioned_migration_fixture_matrix_stays_portable_and_read_only() {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct FixtureManifest {
            schema_version: u32,
            cases: Vec<FixtureCase>,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct FixtureCase {
            directory: String,
            name: String,
            minecraft_version: Option<String>,
            mod_loader: Option<String>,
            expect_conflict: bool,
            expect_portable_content: bool,
        }

        let fixture_root =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/migration/v1");
        let manifest: FixtureManifest =
            serde_json::from_str(&fs::read_to_string(fixture_root.join("manifest.json")).unwrap())
                .unwrap();
        assert_eq!(manifest.schema_version, 1);
        assert_eq!(manifest.cases.len(), 8);

        for case in manifest.cases {
            let source = fixture_root.join(&case.directory);
            let source_before = fixture_tree_fingerprint(&source);
            let metadata = import_metadata(&source).unwrap();
            assert_eq!(metadata.name, case.name);
            assert_eq!(metadata.minecraft_version, case.minecraft_version);
            assert_eq!(metadata.mod_loader, case.mod_loader);

            let existing_names = case
                .expect_conflict
                .then(|| vec![case.name.clone()])
                .unwrap_or_default();
            let preview = preview_import(&source, &existing_names).unwrap();
            assert_eq!(preview.name_conflict, case.expect_conflict);
            if case.expect_portable_content {
                for group in ["mods", "resourcepacks", "shaderpacks", "saves"] {
                    assert!(preview.content.iter().any(|item| {
                        item.id == group && item.disposition == "include" && item.file_count > 0
                    }));
                }
                assert!(
                    preview
                        .content
                        .iter()
                        .any(|item| { item.id == "logs" && item.disposition == "skip" })
                );
            }

            let destination = test_dir("versioned-fixture-copy");
            let copied = copy_reviewed_content(&source, &destination, || false, |_| {}).unwrap();
            let (status, checks) = build_compatibility_report(&metadata, &copied);
            if case.minecraft_version.is_none()
                || (metadata.source_kind != "version" && metadata.mod_loader.is_some())
            {
                assert_eq!(status, "action-required");
                assert!(checks.iter().any(|check| {
                    check.status == "action-required"
                        && (check.id == "version" || check.id == "loader")
                }));
            } else {
                assert_eq!(status, "ready-to-validate");
            }
            assert_eq!(fixture_tree_fingerprint(&source), source_before);
            fs::remove_dir_all(destination).unwrap();
        }
    }

    #[test]
    fn reviewed_version_import_prefers_isolated_content_and_keeps_launch_metadata() {
        let root = test_dir("reviewed-version-source");
        let version = root.join("versions/1.21.1-isolated");
        let destination = test_dir("reviewed-version-destination");
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::create_dir_all(version.join("mods")).unwrap();
        fs::create_dir_all(version.join("natives")).unwrap();
        fs::write(root.join("mods/global.jar"), "global").unwrap();
        fs::write(root.join("options.txt"), "global-options").unwrap();
        fs::write(version.join("mods/isolated.jar"), "isolated").unwrap();
        fs::write(version.join("options.txt"), "isolated-options").unwrap();
        fs::write(
            version.join("1.21.1-isolated.json"),
            r#"{"id":"1.21.1-isolated","inheritsFrom":"1.21.1"}"#,
        )
        .unwrap();
        fs::write(version.join("1.21.1-isolated.jar"), "client").unwrap();
        fs::write(version.join("natives/native.bin"), "native").unwrap();

        let preview = preview_import(&version, &[]).unwrap();
        assert!(preview.content.iter().any(|group| {
            group.id == "version-metadata"
                && group.disposition == "include"
                && group.file_count == 3
        }));
        assert!(preview.content.iter().any(|group| {
            group.id == "mods" && group.reason.as_deref() == Some("Using isolated version content")
        }));

        copy_reviewed_content(&version, &destination, || false, |_| {}).unwrap();
        assert!(destination.join("mods/isolated.jar").is_file());
        assert!(!destination.join("mods/global.jar").exists());
        assert_eq!(
            fs::read_to_string(destination.join("options.txt")).unwrap(),
            "isolated-options"
        );
        assert!(
            destination
                .join("versions/1.21.1-isolated/1.21.1-isolated.json")
                .is_file()
        );
        assert!(
            destination
                .join("versions/1.21.1-isolated/1.21.1-isolated.jar")
                .is_file()
        );
        assert!(
            destination
                .join("versions/1.21.1-isolated/natives/native.bin")
                .is_file()
        );
        assert!(!destination.join("versions/1.21.1-isolated/mods").exists());

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(destination).unwrap();
    }

    #[test]
    fn standard_launcher_candidates_cover_every_supported_desktop_os() {
        let home = Path::new("/users/player");

        let linux = launcher_candidates_for("linux", home, None, None);
        assert!(linux.iter().any(|(kind, path)| {
            kind == "prism"
                && path == Path::new("/users/player/.local/share/PrismLauncher/instances")
        }));
        assert!(linux.iter().any(|(kind, path)| {
            kind == "prism"
                && path
                    == Path::new(
                        "/users/player/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances",
                    )
        }));
        assert!(linux.iter().any(|(kind, path)| {
            kind == "multimc" && path == Path::new("/users/player/.local/share/MultiMC/instances")
        }));

        let macos = launcher_candidates_for("macos", home, None, None);
        assert!(macos.iter().any(|(kind, path)| {
            kind == "prism"
                && path
                    == Path::new(
                        "/users/player/Library/Application Support/PrismLauncher/instances",
                    )
        }));
        assert!(macos.iter().any(|(kind, path)| {
            kind == "multimc"
                && path == Path::new("/users/player/Library/Application Support/MultiMC/instances")
        }));

        let windows = launcher_candidates_for(
            "windows",
            home,
            Some(Path::new("C:/Users/player/AppData/Roaming")),
            Some(Path::new("C:/Users/player/AppData/Roaming")),
        );
        assert!(windows.iter().any(|(kind, path)| {
            kind == "prism"
                && path == Path::new("C:/Users/player/AppData/Roaming/PrismLauncher/instances")
        }));
        assert!(windows.iter().any(|(kind, path)| {
            kind == "multimc"
                && path == Path::new("C:/Users/player/AppData/Roaming/MultiMC/instances")
        }));
    }

    #[test]
    fn cancellation_requested_before_worker_start_is_not_lost() {
        let state = MigrationOperationState::default();
        assert!(state.cancel("queued-operation"));

        let cancelled = state.begin("queued-operation").unwrap();
        assert!(cancelled.load(Ordering::SeqCst));
        state.finish("queued-operation");
    }

    #[test]
    fn resolves_and_copies_prism_custom_icons() {
        let root = test_dir("prism-icon");
        let instance = root.join("PrismLauncher/instances/StoryPack");
        let icon = root.join("PrismLauncher/icons/story-pack.png");
        let destination = test_dir("prism-icon-destination");
        fs::create_dir_all(instance.join(".minecraft")).unwrap();
        fs::create_dir_all(icon.parent().unwrap()).unwrap();
        fs::write(
            instance.join("instance.cfg"),
            "name=Story Pack\niconKey=story-pack\n",
        )
        .unwrap();
        fs::write(&icon, b"fake-png").unwrap();

        let metadata = import_metadata(&instance).unwrap();
        assert_eq!(metadata.icon_source.as_deref(), Some(icon.as_path()));
        let preview = preview_import(&instance, &[]).unwrap();
        assert!(preview.content.iter().any(|group| {
            group.id == "launcher-icon" && group.disposition == "include" && group.file_count == 1
        }));

        let copied = copy_reviewed_content(&instance, &destination, || false, |_| {}).unwrap();
        assert_eq!(copied.imported_icon.as_deref(), Some("icon.png"));
        assert_eq!(fs::read(destination.join("icon.png")).unwrap(), b"fake-png");

        fs::remove_dir_all(&root).unwrap();
        fs::remove_dir_all(&destination).unwrap();
    }

    #[test]
    fn preview_reports_unknown_content_as_unsupported() {
        let root = test_dir("prism-unsupported");
        let instance = root.join("UnknownPack");
        fs::create_dir_all(instance.join(".minecraft/exports")).unwrap();
        fs::write(instance.join("instance.cfg"), "name=Unknown Pack\n").unwrap();
        fs::write(instance.join(".minecraft/exports/world.zip"), "archive").unwrap();

        let preview = preview_import(&instance, &[]).unwrap();
        assert!(preview.content.iter().any(|group| {
            group.relative_path == "exports"
                && group.disposition == "unsupported"
                && group.file_count == 1
        }));
        assert!(
            preview
                .warnings
                .iter()
                .any(|warning| warning.contains("unsupported"))
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn compatibility_report_provides_actions_for_unlaunchable_overrides() {
        let root = test_dir("prism-compatibility-actions");
        let instance = root.join("NeedsRepair");
        fs::create_dir_all(instance.join(".minecraft")).unwrap();
        fs::write(
            instance.join("instance.cfg"),
            concat!(
                "name=Needs Repair\n",
                "OverrideJavaLocation=true\n",
                "JavaPath=/missing/java\n",
                "OverrideMemory=true\n",
                "MinMemAlloc=8192\n",
                "MaxMemAlloc=1024\n",
            ),
        )
        .unwrap();
        let source = import_metadata(&instance).unwrap();
        let copied = MigrationCopyResult {
            copied_files: 0,
            copied_bytes: 0,
            skipped_symlinks: 2,
            pending_remote_files: 0,
            imported_icon: None,
        };

        let (status, checks) = build_compatibility_report(&source, &copied);
        assert_eq!(status, "action-required");
        assert!(checks.iter().any(|check| {
            check.id == "version" && check.status == "action-required" && check.action.is_some()
        }));
        assert!(checks.iter().any(|check| {
            check.id == "java" && check.status == "action-required" && check.action.is_some()
        }));
        assert!(checks.iter().any(|check| {
            check.id == "memory" && check.status == "action-required" && check.action.is_some()
        }));
        assert!(checks.iter().any(|check| {
            check.id == "symlinks" && check.status == "warning" && check.action.is_some()
        }));

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn imports_prism_notes_from_instance_metadata() {
        let root = test_dir("prism-notes");
        let instance = root.join("StoryPack");
        fs::create_dir_all(instance.join(".minecraft")).unwrap();
        fs::write(
            instance.join("instance.cfg"),
            "name=Story Pack\nnotes=Keep the server map and screenshots.\n",
        )
        .unwrap();

        let metadata = import_metadata(&instance).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert_eq!(
            metadata.notes.as_deref(),
            Some("Keep the server map and screenshots.")
        );
    }

    #[test]
    fn imports_enabled_prism_runtime_overrides() {
        let root = test_dir("prism-runtime");
        let instance = root.join("RuntimePack");
        fs::create_dir_all(instance.join(".minecraft")).unwrap();
        fs::write(
            instance.join("instance.cfg"),
            concat!(
                "name=Runtime Pack\n",
                "OverrideJavaLocation=true\n",
                "JavaPath=/opt/java/bin/java\n",
                "OverrideJavaArgs=true\n",
                "JvmArgs=-Dexample=true -XX:+UseG1GC\n",
                "OverrideMemory=true\n",
                "MinMemAlloc=1024\n",
                "MaxMemAlloc=6144\n",
            ),
        )
        .unwrap();

        let metadata = import_metadata(&instance).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert_eq!(
            metadata.java_path_override.as_deref(),
            Some("/opt/java/bin/java")
        );
        assert_eq!(
            metadata.jvm_args_override.as_deref(),
            Some("-Dexample=true -XX:+UseG1GC")
        );
        let memory = metadata.memory_override.unwrap();
        assert_eq!((memory.min, memory.max), (1024, 6144));
    }

    #[test]
    fn previews_content_decisions_and_resolves_duplicate_names() {
        let root = test_dir("prism-preview");
        let instance = root.join("CreateLive");
        fs::create_dir_all(instance.join(".minecraft/mods")).unwrap();
        fs::create_dir_all(instance.join(".minecraft/saves/Workshop")).unwrap();
        fs::create_dir_all(instance.join(".minecraft/logs")).unwrap();
        fs::write(instance.join("instance.cfg"), "name=Create Live\n").unwrap();
        fs::write(
            instance.join("mmc-pack.json"),
            r#"{"components":[{"uid":"net.minecraft","version":"1.21.1"}]}"#,
        )
        .unwrap();
        fs::write(instance.join(".minecraft/mods/map.jar"), "mod").unwrap();
        fs::write(
            instance.join(".minecraft/saves/Workshop/level.dat"),
            "world",
        )
        .unwrap();
        fs::write(instance.join(".minecraft/logs/latest.log"), "log").unwrap();

        let preview = preview_import(&instance, &["Create Live".to_string()]).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert!(preview.name_conflict);
        assert_eq!(preview.suggested_name, "Create Live (Prism)");
        assert!(preview.content.iter().any(|group| {
            group.id == "mods" && group.disposition == "include" && group.file_count == 1
        }));
        assert!(preview.content.iter().any(|group| {
            group.id == "saves" && group.disposition == "include" && group.file_count == 1
        }));
        assert!(preview.content.iter().any(|group| {
            group.id == "logs" && group.disposition == "skip" && group.file_count == 1
        }));
        assert_eq!(preview.total_files, 2);
        assert_eq!(preview.total_bytes, 8);
    }

    #[test]
    fn copies_reviewed_content_without_mutating_the_source() {
        let root = test_dir("prism-copy-reviewed");
        let instance = root.join("CreateLive");
        let game_dir = instance.join(".minecraft");
        let destination = test_dir("prism-copy-destination");
        fs::create_dir_all(game_dir.join("mods")).unwrap();
        fs::create_dir_all(game_dir.join("saves/Workshop")).unwrap();
        fs::create_dir_all(game_dir.join("logs")).unwrap();
        fs::write(instance.join("instance.cfg"), "name=Create Live\n").unwrap();
        fs::write(game_dir.join("mods/map.jar"), "mod").unwrap();
        fs::write(game_dir.join("saves/Workshop/level.dat"), "world").unwrap();
        fs::write(game_dir.join("logs/latest.log"), "log").unwrap();
        let source_before = [
            fs::read(instance.join("instance.cfg")).unwrap(),
            fs::read(game_dir.join("mods/map.jar")).unwrap(),
            fs::read(game_dir.join("saves/Workshop/level.dat")).unwrap(),
            fs::read(game_dir.join("logs/latest.log")).unwrap(),
        ];

        let result = copy_reviewed_content(&instance, &destination, || false, |_| {}).unwrap();
        let source_after = [
            fs::read(instance.join("instance.cfg")).unwrap(),
            fs::read(game_dir.join("mods/map.jar")).unwrap(),
            fs::read(game_dir.join("saves/Workshop/level.dat")).unwrap(),
            fs::read(game_dir.join("logs/latest.log")).unwrap(),
        ];

        assert_eq!(source_after, source_before);
        assert!(destination.join("mods/map.jar").exists());
        assert!(destination.join("saves/Workshop/level.dat").exists());
        assert!(!destination.join("logs").exists());
        assert_eq!(result.copied_files, 2);
        assert_eq!(result.copied_bytes, 8);

        fs::remove_dir_all(&root).unwrap();
        fs::remove_dir_all(&destination).unwrap();
    }

    #[test]
    fn cancellation_rolls_back_files_copied_during_the_operation() {
        let root = test_dir("prism-copy-cancelled");
        let instance = root.join("CreateLive");
        let game_dir = instance.join(".minecraft");
        let destination = test_dir("prism-copy-cancelled-destination");
        fs::create_dir_all(game_dir.join("mods")).unwrap();
        fs::write(instance.join("instance.cfg"), "name=Create Live\n").unwrap();
        fs::write(game_dir.join("mods/first.jar"), "first").unwrap();
        fs::write(game_dir.join("mods/second.jar"), "second").unwrap();
        let cancelled = Cell::new(false);

        let result = copy_reviewed_content(
            &instance,
            &destination,
            || cancelled.get(),
            |_| cancelled.set(true),
        );

        assert_eq!(result.unwrap_err(), "migration-cancelled");
        assert_eq!(summarize_path(&destination).unwrap().0, 0);
        assert!(game_dir.join("mods/first.jar").exists());
        assert!(game_dir.join("mods/second.jar").exists());

        fs::remove_dir_all(&root).unwrap();
        fs::remove_dir_all(&destination).unwrap();
    }

    #[test]
    fn scans_multimc_instances() {
        let root = test_dir("multimc");
        let instance = root.join("DemoPack");
        fs::create_dir_all(instance.join(".minecraft/mods")).unwrap();
        fs::write(instance.join("instance.cfg"), "name=Demo Pack\n").unwrap();
        fs::write(
            instance.join("mmc-pack.json"),
            r#"{"components":[{"uid":"net.minecraft","version":"1.20.1"},{"uid":"net.fabricmc.fabric-loader","version":"0.16.9"}]}"#,
        )
        .unwrap();

        let scanned = scan_instances(&root).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].name, "Demo Pack");
        assert_eq!(scanned[0].launcher_type, "multimc");
        assert_eq!(scanned[0].minecraft_version.as_deref(), Some("1.20.1"));
        assert_eq!(scanned[0].mod_loader.as_deref(), Some("fabric"));
        assert_eq!(scanned[0].mod_loader_version.as_deref(), Some("0.16.9"));
    }

    #[test]
    fn scans_a_manually_selected_prism_launcher_root() {
        let root = test_dir("manual-prism-root");
        let launcher_root = root.join("PrismLauncher");
        let instance = launcher_root.join("instances/DemoPack");
        fs::create_dir_all(instance.join(".minecraft")).unwrap();
        fs::write(instance.join("instance.cfg"), "name=Demo Pack\n").unwrap();
        fs::write(
            instance.join("mmc-pack.json"),
            r#"{"components":[{"uid":"net.minecraft","version":"1.21.1"}]}"#,
        )
        .unwrap();

        let scanned = scan_instances(&launcher_root).unwrap();
        fs::remove_dir_all(root).unwrap();

        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].name, "Demo Pack");
    }

    #[test]
    fn scans_minecraft_version_directories_for_pcl_hmcl_style_imports() {
        let root = test_dir("minecraft");
        let version = root.join("versions/1.20.1-forge-47.4.0");
        fs::create_dir_all(&version).unwrap();
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::write(
            version.join("1.20.1-forge-47.4.0.json"),
            r#"{"id":"1.20.1-forge-47.4.0","inheritsFrom":"1.20.1","libraries":[{"name":"net.minecraftforge:forge:1.20.1-47.4.0"}]}"#,
        )
        .unwrap();

        let scanned = scan_instances(&root).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].source_kind, "version");
        assert_eq!(scanned[0].launcher_type, "pcl-hmcl");
        assert_eq!(
            scanned[0].version_id.as_deref(),
            Some("1.20.1-forge-47.4.0")
        );
        assert_eq!(scanned[0].minecraft_version.as_deref(), Some("1.20.1"));
        assert_eq!(scanned[0].mod_loader.as_deref(), Some("forge"));
        assert_eq!(
            scanned[0].mod_loader_version.as_deref(),
            Some("1.20.1-47.4.0")
        );
    }

    #[test]
    fn classifies_neoforge_before_the_forge_substring_fallback() {
        let metadata = serde_json::json!({
            "id": "1.21.1-neoforge-21.1.203",
            "inheritsFrom": "1.21.1"
        });

        let (_, mod_loader, _) = parse_version_json_metadata("1.21.1-neoforge-21.1.203", &metadata);

        assert_eq!(mod_loader.as_deref(), Some("neoforge"));
    }

    #[test]
    fn classifies_version_imports_from_game_dir_not_version_id() {
        let root = test_dir("generic-minecraft");
        let version = root.join("versions/hmcl-labelled-version");
        fs::create_dir_all(&version).unwrap();
        fs::write(
            version.join("hmcl-labelled-version.json"),
            r#"{"id":"hmcl-labelled-version"}"#,
        )
        .unwrap();

        let scanned = scan_instances(&root).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].launcher_type, "pcl-hmcl");
    }

    #[test]
    fn copies_user_game_files_and_selected_version_from_minecraft_directories() {
        let root = test_dir("copy-source");
        let version = root.join("versions/1.21.1");
        let dest = test_dir("copy-dest");
        fs::create_dir_all(&version).unwrap();
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::create_dir_all(root.join("libraries")).unwrap();
        fs::write(version.join("1.21.1.json"), r#"{"id":"1.21.1"}"#).unwrap();
        fs::write(root.join("mods/demo.jar"), "demo").unwrap();
        fs::write(root.join("libraries/skip.jar"), "skip").unwrap();
        fs::write(root.join("options.txt"), "options").unwrap();

        copy_instance_files(&version, &dest).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert!(dest.join("mods/demo.jar").exists());
        assert!(dest.join("options.txt").exists());
        assert!(dest.join("versions/1.21.1/1.21.1.json").exists());
        assert!(!dest.join("libraries/skip.jar").exists());
        fs::remove_dir_all(&dest).unwrap();
    }

    #[test]
    fn copies_isolated_version_user_data_to_instance_root() {
        let root = test_dir("isolated-source");
        let version = root.join("versions/1.21.1-isolated");
        let dest = test_dir("isolated-dest");
        fs::create_dir_all(version.join("mods")).unwrap();
        fs::create_dir_all(version.join("saves/World")).unwrap();
        fs::create_dir_all(version.join("config")).unwrap();
        fs::create_dir_all(version.join("natives")).unwrap();
        fs::write(version.join("1.21.1-isolated.json"), r#"{"id":"1.21.1"}"#).unwrap();
        fs::write(version.join("1.21.1-isolated.jar"), "jar").unwrap();
        fs::write(version.join("mods/isolated.jar"), "mod").unwrap();
        fs::write(version.join("saves/World/level.dat"), "level").unwrap();
        fs::write(version.join("config/mod.toml"), "config").unwrap();
        fs::write(version.join("natives/native.dll"), "native").unwrap();
        fs::write(version.join("options.txt"), "options").unwrap();

        copy_instance_files(&version, &dest).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert!(dest.join("mods/isolated.jar").exists());
        assert!(dest.join("saves/World/level.dat").exists());
        assert!(dest.join("config/mod.toml").exists());
        assert!(dest.join("options.txt").exists());
        assert!(
            dest.join("versions/1.21.1-isolated/1.21.1-isolated.json")
                .exists()
        );
        assert!(
            dest.join("versions/1.21.1-isolated/1.21.1-isolated.jar")
                .exists()
        );
        assert!(
            dest.join("versions/1.21.1-isolated/natives/native.dll")
                .exists()
        );
        assert!(
            !dest
                .join("versions/1.21.1-isolated/mods/isolated.jar")
                .exists()
        );
        assert!(!dest.join("versions/1.21.1-isolated/saves").exists());
        assert!(!dest.join("versions/1.21.1-isolated/options.txt").exists());
        fs::remove_dir_all(&dest).unwrap();
    }

    #[test]
    fn rejects_malformed_version_metadata_instead_of_guessing() {
        let root = test_dir("malformed-version");
        let version = root.join("versions/broken");
        fs::create_dir_all(&version).unwrap();
        fs::write(version.join("broken.json"), "{not json").unwrap();

        let scanned = scan_instances(&root).unwrap();
        let metadata = import_metadata(&version);
        fs::remove_dir_all(&root).unwrap();

        assert!(scanned.is_empty());
        assert!(metadata.is_err());
    }
}

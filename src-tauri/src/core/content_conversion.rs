//! Safe, preview-first instance content conversion.

use crate::core::content_search::{
    ContentVersion, get_modrinth_versions, identify_modrinth_file, search_modrinth,
};
use crate::core::instance::Instance;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs;
use std::future::Future;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionTarget {
    pub game_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub enum ContentKind {
    Mod,
    ResourcePack,
    ShaderPack,
    DataPack,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub enum ConversionDisposition {
    Keep,
    Replace,
    NeedsReview,
    Incompatible,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionReplacement {
    pub project_id: String,
    pub project_name: String,
    pub version_id: String,
    pub version_name: String,
    pub file_name: String,
    pub file_url: String,
    pub page_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionProject {
    pub id: String,
    pub name: String,
    pub page_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionSuggestion {
    pub project_id: String,
    pub project_name: String,
    pub page_url: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionItem {
    pub relative_path: String,
    pub file_name: String,
    pub content_kind: ContentKind,
    pub sha1: String,
    pub source_loader: Option<String>,
    pub disposition: ConversionDisposition,
    pub reason: String,
    pub project: Option<ConversionProject>,
    pub replacement: Option<ConversionReplacement>,
    pub suggestion: Option<ConversionSuggestion>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionSummary {
    pub total: usize,
    pub keep: usize,
    pub replace: usize,
    pub needs_review: usize,
    pub incompatible: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionPreview {
    pub source_game_version: String,
    pub source_loader: String,
    pub target: ConversionTarget,
    pub items: Vec<ConversionItem>,
    pub summary: ConversionSummary,
    pub source_protected: bool,
    pub lookup_warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionReplacementTask {
    pub relative_path: String,
    pub replacement: ConversionReplacement,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct PreparedConversionContent {
    pub excluded_paths: Vec<String>,
    pub replacements: Vec<ConversionReplacementTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionApplyRequest {
    pub instance_id: String,
    pub new_name: String,
    pub target: ConversionTarget,
    pub excluded_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_conversion.ts")]
pub struct ConversionReport {
    pub operation_id: String,
    pub source_instance_id: String,
    pub target_instance: Instance,
    pub preview: ConversionPreview,
    pub excluded_paths: Vec<String>,
    pub replaced_paths: Vec<String>,
    pub can_rollback: bool,
}

#[derive(Default)]
pub struct ConversionOperationState {
    completed: Mutex<HashMap<String, String>>,
}

impl ConversionOperationState {
    pub fn complete(&self, operation_id: &str, instance_id: &str) {
        self.completed
            .lock()
            .unwrap()
            .insert(operation_id.to_string(), instance_id.to_string());
    }

    pub fn take_completed(&self, operation_id: &str) -> Option<String> {
        self.completed.lock().unwrap().remove(operation_id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompatibilityResolution {
    Compatible {
        project: ConversionProject,
    },
    Replacement {
        project: ConversionProject,
        replacement: ConversionReplacement,
    },
    Incompatible {
        project: Option<ConversionProject>,
        suggestion: Option<ConversionSuggestion>,
    },
}

/// Return the base Minecraft version represented by a launcher version id.
pub fn base_game_version(version_id: &str) -> Option<String> {
    if let Some((game_version, _)) = version_id.split_once("-forge-") {
        return (!game_version.is_empty()).then(|| game_version.to_string());
    }

    if let Some(fabric) = version_id.strip_prefix("fabric-loader-") {
        let (_, game_version) = fabric.split_once('-')?;
        return (!game_version.is_empty()).then(|| game_version.to_string());
    }

    let vanilla = version_id.trim();
    (!vanilla.is_empty()).then(|| vanilla.to_string())
}

pub fn validate_target(target: &ConversionTarget) -> Result<(), String> {
    if target.game_version.trim().is_empty() {
        return Err("Target Minecraft version cannot be empty".to_string());
    }

    match target.loader.as_str() {
        "vanilla" => Ok(()),
        "fabric" | "forge" => {
            if target
                .loader_version
                .as_deref()
                .is_none_or(|version| version.trim().is_empty())
            {
                Err(format!("A {} loader version is required", target.loader))
            } else {
                Ok(())
            }
        }
        loader => Err(format!("Unsupported target loader: {loader}")),
    }
}

/// Build a local compatibility manifest without modifying the source instance.
pub fn preview_local_content(
    game_dir: &Path,
    source_version_id: &str,
    source_loader: Option<&str>,
    target: ConversionTarget,
) -> Result<ConversionPreview, String> {
    let source_game_version = base_game_version(source_version_id)
        .ok_or_else(|| "Instance has no Minecraft version set".to_string())?;
    let mut items = scan_mods(game_dir, source_loader)?;
    items.extend(scan_portable_archives(
        game_dir,
        "resourcepacks",
        ContentKind::ResourcePack,
        source_game_version == target.game_version,
    )?);
    items.extend(scan_portable_archives(
        game_dir,
        "shaderpacks",
        ContentKind::ShaderPack,
        source_game_version == target.game_version,
    )?);
    items.extend(scan_world_data_packs(
        game_dir,
        source_game_version == target.game_version,
    )?);
    items.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    let summary = summarize(&items);

    Ok(ConversionPreview {
        source_game_version,
        source_loader: source_loader.unwrap_or("vanilla").to_string(),
        target,
        items,
        summary,
        source_protected: true,
        lookup_warnings: Vec::new(),
    })
}

/// Apply a resolved compatibility decision to one manifest item.
pub fn apply_compatibility_resolution(
    preview: &mut ConversionPreview,
    relative_path: &str,
    resolution: CompatibilityResolution,
) -> Result<(), String> {
    let item = preview
        .items
        .iter_mut()
        .find(|item| item.relative_path == relative_path)
        .ok_or_else(|| format!("Conversion item {relative_path} was not found"))?;

    match resolution {
        CompatibilityResolution::Compatible { project } => {
            item.disposition = ConversionDisposition::Keep;
            item.reason =
                "This exact file supports the target Minecraft version and loader".to_string();
            item.project = Some(project);
            item.replacement = None;
            item.suggestion = None;
        }
        CompatibilityResolution::Replacement {
            project,
            replacement,
        } => {
            item.disposition = ConversionDisposition::Replace;
            item.reason =
                "A compatible version of this project is available for the target".to_string();
            item.project = Some(project);
            item.replacement = Some(replacement);
            item.suggestion = None;
        }
        CompatibilityResolution::Incompatible {
            project,
            suggestion,
        } => {
            item.disposition = ConversionDisposition::Incompatible;
            item.reason = if suggestion.is_some() {
                "No compatible version exists; a target-compatible alternative is available"
                    .to_string()
            } else {
                "No compatible version or reviewed alternative was found".to_string()
            };
            item.project = project;
            item.replacement = None;
            item.suggestion = suggestion;
        }
    }
    preview.summary = summarize(&preview.items);
    Ok(())
}

pub fn content_version_supports_target(
    version: &ContentVersion,
    content_kind: ContentKind,
    target: &ConversionTarget,
) -> bool {
    let game_version_matches = version
        .game_versions
        .iter()
        .any(|game_version| game_version == &target.game_version);
    if !game_version_matches {
        return false;
    }

    match content_kind {
        ContentKind::Mod => version
            .loaders
            .iter()
            .any(|loader| loader == &target.loader),
        ContentKind::ResourcePack => version.loaders.iter().any(|loader| loader == "minecraft"),
        ContentKind::ShaderPack | ContentKind::DataPack => false,
    }
}

pub async fn resolve_preview_with<R, Fut>(
    mut preview: ConversionPreview,
    resolver: R,
) -> ConversionPreview
where
    R: Fn(ConversionItem, ConversionTarget) -> Fut,
    Fut: Future<Output = Result<Option<CompatibilityResolution>, String>>,
{
    for index in 0..preview.items.len() {
        if preview.items[index].disposition != ConversionDisposition::NeedsReview {
            continue;
        }

        let item = preview.items[index].clone();
        match resolver(item.clone(), preview.target.clone()).await {
            Ok(Some(resolution)) => {
                if let Err(error) =
                    apply_compatibility_resolution(&mut preview, &item.relative_path, resolution)
                {
                    preview
                        .lookup_warnings
                        .push(format!("{}: {error}", item.file_name));
                }
            }
            Ok(None) => {
                preview.items[index].reason =
                    "No Modrinth match was found; review this file manually".to_string();
            }
            Err(error) => {
                preview.items[index].reason =
                    "Online compatibility lookup is unavailable; review this file manually"
                        .to_string();
                preview
                    .lookup_warnings
                    .push(format!("{}: {error}", item.file_name));
            }
        }
    }
    preview.summary = summarize(&preview.items);
    preview
}

pub async fn resolve_preview_with_modrinth(preview: ConversionPreview) -> ConversionPreview {
    resolve_preview_with(preview, |item, target| async move {
        resolve_modrinth_item(item, target).await
    })
    .await
}

pub fn prepare_target_content(
    target_game_dir: &Path,
    preview: &ConversionPreview,
    excluded_paths: &[String],
) -> Result<PreparedConversionContent, String> {
    let excluded = excluded_paths
        .iter()
        .map(String::as_str)
        .collect::<std::collections::HashSet<_>>();
    for path in &excluded {
        if !preview.items.iter().any(|item| item.relative_path == *path) {
            return Err(format!(
                "Excluded path is not in the conversion preview: {path}"
            ));
        }
    }

    let mut prepared = PreparedConversionContent::default();
    for item in &preview.items {
        if excluded.contains(item.relative_path.as_str()) {
            let target = checked_target_path(target_game_dir, &item.relative_path)?;
            if target.exists() {
                let metadata = fs::symlink_metadata(&target).map_err(|error| error.to_string())?;
                if metadata.is_dir() && !metadata.file_type().is_symlink() {
                    fs::remove_dir_all(&target).map_err(|error| error.to_string())?;
                } else {
                    fs::remove_file(&target).map_err(|error| error.to_string())?;
                }
            }
            prepared.excluded_paths.push(item.relative_path.clone());
            continue;
        }

        match item.disposition {
            ConversionDisposition::Keep => {}
            ConversionDisposition::Replace => {
                let replacement = item.replacement.clone().ok_or_else(|| {
                    format!("Replacement details are missing for {}", item.file_name)
                })?;
                prepared.replacements.push(ConversionReplacementTask {
                    relative_path: item.relative_path.clone(),
                    replacement,
                });
            }
            ConversionDisposition::NeedsReview | ConversionDisposition::Incompatible => {
                return Err(format!(
                    "Review or exclude {} before applying the conversion",
                    item.relative_path
                ));
            }
        }
    }
    prepared.excluded_paths.sort();
    Ok(prepared)
}

pub async fn apply_replacement_tasks_with<D, Fut>(
    target_game_dir: &Path,
    tasks: &[ConversionReplacementTask],
    downloader: D,
) -> Result<Vec<String>, String>
where
    D: Fn(String, PathBuf) -> Fut,
    Fut: Future<Output = Result<(), String>>,
{
    let mut replaced = Vec::new();
    for task in tasks {
        let original = checked_target_path(target_game_dir, &task.relative_path)?;
        if !original.exists() {
            return Err(format!("Target content is missing: {}", task.relative_path));
        }

        let original_is_disabled = original
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".jar.disabled"));
        let replacement_file_name =
            if original_is_disabled && !task.replacement.file_name.ends_with(".disabled") {
                format!("{}.disabled", task.replacement.file_name)
            } else {
                task.replacement.file_name.clone()
            };
        let replacement_name = checked_file_name(&replacement_file_name)?;
        let parent = original
            .parent()
            .ok_or_else(|| format!("Target content has no parent: {}", task.relative_path))?;
        let destination = parent.join(replacement_name);
        if destination != original && destination.exists() {
            return Err(format!(
                "Replacement destination already exists: {}",
                relative_path(target_game_dir, &destination)?
            ));
        }

        let operation_id = uuid::Uuid::new_v4();
        let temporary = parent.join(format!(".dropout-conversion-{operation_id}.part"));
        let backup = parent.join(format!(".dropout-conversion-{operation_id}.backup"));
        if let Err(error) = downloader(task.replacement.file_url.clone(), temporary.clone()).await {
            let _ = remove_path_if_exists(&temporary);
            return Err(error);
        }
        if !temporary.is_file() {
            let _ = remove_path_if_exists(&temporary);
            return Err(format!(
                "Replacement download did not create a file for {}",
                task.relative_path
            ));
        }

        if let Err(error) = fs::rename(&original, &backup) {
            let _ = remove_path_if_exists(&temporary);
            return Err(format!(
                "Failed to back up {} before replacement: {error}",
                task.relative_path
            ));
        }
        if let Err(error) = fs::rename(&temporary, &destination) {
            let _ = fs::rename(&backup, &original);
            let _ = remove_path_if_exists(&temporary);
            return Err(format!(
                "Failed to install replacement for {}: {error}",
                task.relative_path
            ));
        }
        remove_path_if_exists(&backup)?;
        replaced.push(relative_path(target_game_dir, &destination)?);
    }
    Ok(replaced)
}

fn checked_file_name(file_name: &str) -> Result<&std::ffi::OsStr, String> {
    let path = Path::new(file_name);
    let mut components = path.components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(name)), None) => Ok(name),
        _ => Err(format!("Unsafe replacement file name: {file_name}")),
    }
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return Ok(());
    };
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(path).map_err(|error| error.to_string())
    }
}

fn checked_target_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    if relative_path.as_os_str().is_empty()
        || relative_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!("Unsafe conversion path: {relative}"));
    }
    Ok(root.join(relative_path))
}

async fn resolve_modrinth_item(
    item: ConversionItem,
    target: ConversionTarget,
) -> Result<Option<CompatibilityResolution>, String> {
    let Some(identified) = identify_modrinth_file(&item.sha1).await? else {
        return Ok(None);
    };

    let project = ConversionProject {
        id: identified.project.id.clone(),
        name: identified.project.title.clone(),
        page_url: identified.project.page_url.clone(),
    };
    if content_version_supports_target(&identified.version, item.content_kind, &target) {
        return Ok(Some(CompatibilityResolution::Compatible { project }));
    }

    let game_versions = vec![target.game_version.clone()];
    let loader_filters = target_loader_filters(item.content_kind, &target);
    let target_versions =
        get_modrinth_versions(&identified.project.id, &game_versions, &loader_filters).await?;
    if let Some(version) = target_versions
        .into_iter()
        .find(|version| !version.file_url.is_empty() && !version.file_name.is_empty())
    {
        let page_url = format!("{}/version/{}", project.page_url, version.id);
        return Ok(Some(CompatibilityResolution::Replacement {
            project: project.clone(),
            replacement: ConversionReplacement {
                project_id: project.id.clone(),
                project_name: project.name.clone(),
                version_id: version.id,
                version_name: version.name,
                file_name: version.file_name,
                file_url: version.file_url,
                page_url,
            },
        }));
    }

    let alternatives = search_modrinth(
        &project.name,
        project_type_filter(item.content_kind),
        &game_versions,
        &loader_filters,
        "relevance",
        0,
        5,
    )
    .await?;
    let suggestion = alternatives
        .hits
        .into_iter()
        .find(|candidate| candidate.id != project.id)
        .map(|candidate| ConversionSuggestion {
            project_id: candidate.id,
            project_name: candidate.title,
            page_url: candidate.page_url,
            reason: format!(
                "Supports {} on Minecraft {}",
                target.loader, target.game_version
            ),
        });

    Ok(Some(CompatibilityResolution::Incompatible {
        project: Some(project),
        suggestion,
    }))
}

fn target_loader_filters(content_kind: ContentKind, target: &ConversionTarget) -> Vec<String> {
    match content_kind {
        ContentKind::Mod => vec![target.loader.clone()],
        ContentKind::ResourcePack => vec!["minecraft".to_string()],
        ContentKind::ShaderPack | ContentKind::DataPack => Vec::new(),
    }
}

fn project_type_filter(content_kind: ContentKind) -> &'static str {
    match content_kind {
        ContentKind::Mod => "mod",
        ContentKind::ResourcePack => "resourcepack",
        ContentKind::ShaderPack => "shader",
        ContentKind::DataPack => "datapack",
    }
}

fn scan_portable_archives(
    game_dir: &Path,
    folder: &str,
    content_kind: ContentKind,
    game_version_unchanged: bool,
) -> Result<Vec<ConversionItem>, String> {
    let content_dir = game_dir.join(folder);
    scan_archive_directory(game_dir, &content_dir, content_kind, game_version_unchanged)
}

fn scan_world_data_packs(
    game_dir: &Path,
    game_version_unchanged: bool,
) -> Result<Vec<ConversionItem>, String> {
    let saves_dir = game_dir.join("saves");
    if !saves_dir.exists() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    for world in fs::read_dir(&saves_dir).map_err(|error| error.to_string())? {
        let world = world.map_err(|error| error.to_string())?;
        if !world
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            continue;
        }
        items.extend(scan_archive_directory(
            game_dir,
            &world.path().join("datapacks"),
            ContentKind::DataPack,
            game_version_unchanged,
        )?);
    }
    Ok(items)
}

fn scan_archive_directory(
    game_dir: &Path,
    content_dir: &Path,
    content_kind: ContentKind,
    game_version_unchanged: bool,
) -> Result<Vec<ConversionItem>, String> {
    if !content_dir.exists() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    for entry in fs::read_dir(content_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let supported_archive = file_type.is_file() && file_name.ends_with(".zip");
        let supported_directory = file_type.is_dir()
            && (path.join("pack.mcmeta").is_file() || path.join("shaders").is_dir());
        if !supported_archive && !supported_directory {
            continue;
        }

        let (disposition, reason) = if game_version_unchanged {
            (
                ConversionDisposition::Keep,
                "Loader-neutral content is preserved for the same Minecraft version",
            )
        } else {
            (
                ConversionDisposition::NeedsReview,
                "Minecraft version compatibility must be checked before conversion",
            )
        };

        items.push(ConversionItem {
            relative_path: relative_path(game_dir, &path)?,
            file_name,
            content_kind,
            sha1: path_sha1(&path)?,
            source_loader: None,
            disposition,
            reason: reason.to_string(),
            project: None,
            replacement: None,
            suggestion: None,
        });
    }
    Ok(items)
}

fn path_sha1(path: &Path) -> Result<String, String> {
    if path.is_file() {
        return file_sha1(path);
    }

    let mut hasher = Sha1::new();
    update_tree_sha1(path, path, &mut hasher)?;
    Ok(hex::encode(hasher.finalize()))
}

fn update_tree_sha1(root: &Path, directory: &Path, hasher: &mut Sha1) -> Result<(), String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            continue;
        }

        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        hasher.update(relative.as_bytes());
        hasher.update([0]);

        if file_type.is_dir() {
            update_tree_sha1(root, &path, hasher)?;
        } else if file_type.is_file() {
            let mut file = fs::File::open(&path).map_err(|error| error.to_string())?;
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
                if read == 0 {
                    break;
                }
                hasher.update(&buffer[..read]);
            }
        }
        hasher.update([0xff]);
    }
    Ok(())
}

fn scan_mods(game_dir: &Path, source_loader: Option<&str>) -> Result<Vec<ConversionItem>, String> {
    let mods_dir = game_dir.join("mods");
    if !mods_dir.exists() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    for entry in fs::read_dir(&mods_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_file()
        {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();
        if !file_name.ends_with(".jar") && !file_name.ends_with(".jar.disabled") {
            continue;
        }

        items.push(ConversionItem {
            relative_path: relative_path(game_dir, &entry.path())?,
            file_name,
            content_kind: ContentKind::Mod,
            sha1: file_sha1(&entry.path())?,
            source_loader: source_loader.map(str::to_string),
            disposition: ConversionDisposition::NeedsReview,
            reason: "Compatibility must be checked for the target loader and Minecraft version"
                .to_string(),
            project: None,
            replacement: None,
            suggestion: None,
        });
    }

    items.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(items)
}

fn file_sha1(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha1::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative: PathBuf = path
        .strip_prefix(root)
        .map_err(|error| error.to_string())?
        .to_path_buf();
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn summarize(items: &[ConversionItem]) -> ConversionSummary {
    let mut summary = ConversionSummary {
        total: items.len(),
        ..ConversionSummary::default()
    };
    for item in items {
        match item.disposition {
            ConversionDisposition::Keep => summary.keep += 1,
            ConversionDisposition::Replace => summary.replace += 1,
            ConversionDisposition::NeedsReview => summary.needs_review += 1,
            ConversionDisposition::Incompatible => summary.incompatible += 1,
        }
    }
    summary
}

#[cfg(test)]
mod tests {
    use super::{
        CompatibilityResolution, ContentKind, ConversionDisposition, ConversionProject,
        ConversionReplacement, ConversionSuggestion, ConversionTarget,
        apply_compatibility_resolution, base_game_version, preview_local_content,
    };
    use crate::core::content_search::ContentVersion;
    use std::fs;

    fn temp_fixture(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "dropout-content-conversion-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn extracts_minecraft_version_from_fabric_version_id() {
        assert_eq!(
            base_game_version("fabric-loader-0.15.6-1.20.4"),
            Some("1.20.4".to_string())
        );
    }

    #[test]
    fn preserves_hyphenated_minecraft_version_from_fabric_version_id() {
        assert_eq!(
            base_game_version("fabric-loader-0.16.14-1.21.2-pre1"),
            Some("1.21.2-pre1".to_string())
        );
    }

    #[test]
    fn extracts_minecraft_version_from_forge_version_id() {
        assert_eq!(
            base_game_version("1.20.1-forge-47.1.0"),
            Some("1.20.1".to_string())
        );
    }

    #[test]
    fn keeps_vanilla_minecraft_version_id() {
        assert_eq!(base_game_version("1.21.1"), Some("1.21.1".to_string()));
    }

    #[test]
    fn preview_lists_mods_without_changing_the_source() {
        let root = temp_fixture("mod-preview");
        let mods = root.join("mods");
        fs::create_dir_all(&mods).unwrap();
        fs::write(mods.join("example.jar"), b"fixture-mod").unwrap();

        let preview = preview_local_content(
            &root,
            "fabric-loader-0.15.6-1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();

        assert_eq!(preview.items.len(), 1);
        assert_eq!(preview.items[0].content_kind, ContentKind::Mod);
        assert_eq!(
            preview.items[0].disposition,
            ConversionDisposition::NeedsReview
        );
        assert!(preview.source_protected);
        assert_eq!(fs::read(mods.join("example.jar")).unwrap(), b"fixture-mod");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preview_keeps_resource_pack_when_game_version_is_unchanged() {
        let root = temp_fixture("resource-pack-preview");
        let packs = root.join("resourcepacks");
        fs::create_dir_all(&packs).unwrap();
        fs::write(packs.join("faithful.zip"), b"fixture-resource-pack").unwrap();

        let preview = preview_local_content(
            &root,
            "1.20.4",
            Some("vanilla"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();

        assert_eq!(preview.items.len(), 1);
        assert_eq!(preview.items[0].content_kind, ContentKind::ResourcePack);
        assert_eq!(preview.items[0].disposition, ConversionDisposition::Keep);
        assert_eq!(preview.summary.keep, 1);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preview_keeps_shader_pack_when_game_version_is_unchanged() {
        let root = temp_fixture("shader-pack-preview");
        let packs = root.join("shaderpacks");
        fs::create_dir_all(&packs).unwrap();
        fs::write(packs.join("complementary.zip"), b"fixture-shader-pack").unwrap();

        let preview = preview_local_content(
            &root,
            "1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();

        assert_eq!(preview.items.len(), 1);
        assert_eq!(preview.items[0].content_kind, ContentKind::ShaderPack);
        assert_eq!(preview.items[0].disposition, ConversionDisposition::Keep);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preview_discovers_data_packs_inside_worlds() {
        let root = temp_fixture("data-pack-preview");
        let packs = root.join("saves/Redstone Lab/datapacks");
        fs::create_dir_all(&packs).unwrap();
        fs::write(packs.join("worldgen.zip"), b"fixture-data-pack").unwrap();

        let preview = preview_local_content(
            &root,
            "1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();

        assert_eq!(preview.items.len(), 1);
        assert_eq!(preview.items[0].content_kind, ContentKind::DataPack);
        assert_eq!(
            preview.items[0].relative_path,
            "saves/Redstone Lab/datapacks/worldgen.zip"
        );
        assert_eq!(preview.items[0].disposition, ConversionDisposition::Keep);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preview_includes_unpacked_resource_pack_directories() {
        let root = temp_fixture("unpacked-resource-pack-preview");
        let pack = root.join("resourcepacks/developer-pack");
        fs::create_dir_all(pack.join("assets/example")).unwrap();
        fs::write(pack.join("pack.mcmeta"), b"{\"pack\":{}}").unwrap();
        fs::write(pack.join("assets/example/icon.txt"), b"icon").unwrap();

        let preview = preview_local_content(
            &root,
            "1.20.4",
            Some("vanilla"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "fabric".to_string(),
                loader_version: Some("0.15.6".to_string()),
            },
        )
        .unwrap();

        assert_eq!(preview.items.len(), 1);
        assert_eq!(preview.items[0].file_name, "developer-pack");
        assert_eq!(preview.items[0].content_kind, ContentKind::ResourcePack);
        assert!(!preview.items[0].sha1.is_empty());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn compatible_lookup_marks_manifest_item_safe_to_keep() {
        let root = temp_fixture("compatible-resolution");
        let mods = root.join("mods");
        fs::create_dir_all(&mods).unwrap();
        fs::write(mods.join("shared.jar"), b"shared-mod").unwrap();

        let mut preview = preview_local_content(
            &root,
            "fabric-loader-0.15.6-1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();
        let relative_path = preview.items[0].relative_path.clone();

        apply_compatibility_resolution(
            &mut preview,
            &relative_path,
            CompatibilityResolution::Compatible {
                project: ConversionProject {
                    id: "shared-project".to_string(),
                    name: "Shared Project".to_string(),
                    page_url: "https://modrinth.com/mod/shared-project".to_string(),
                },
            },
        )
        .unwrap();

        assert_eq!(preview.items[0].disposition, ConversionDisposition::Keep);
        assert_eq!(
            preview.items[0].project.as_ref().unwrap().id,
            "shared-project"
        );
        assert_eq!(preview.summary.keep, 1);
        assert_eq!(preview.summary.needs_review, 0);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn compatible_project_version_marks_manifest_item_for_replacement() {
        let root = temp_fixture("replacement-resolution");
        let mods = root.join("mods");
        fs::create_dir_all(&mods).unwrap();
        fs::write(mods.join("fabric-only.jar"), b"fabric-only-mod").unwrap();

        let mut preview = preview_local_content(
            &root,
            "fabric-loader-0.15.6-1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();
        let relative_path = preview.items[0].relative_path.clone();

        apply_compatibility_resolution(
            &mut preview,
            &relative_path,
            CompatibilityResolution::Replacement {
                project: ConversionProject {
                    id: "cross-loader".to_string(),
                    name: "Cross Loader".to_string(),
                    page_url: "https://modrinth.com/mod/cross-loader".to_string(),
                },
                replacement: ConversionReplacement {
                    project_id: "cross-loader".to_string(),
                    project_name: "Cross Loader".to_string(),
                    version_id: "forge-version".to_string(),
                    version_name: "Forge 1.20.4".to_string(),
                    file_name: "cross-loader-forge.jar".to_string(),
                    file_url: "https://cdn.modrinth.com/cross-loader-forge.jar".to_string(),
                    page_url: "https://modrinth.com/mod/cross-loader/version/forge-version"
                        .to_string(),
                },
            },
        )
        .unwrap();

        assert_eq!(preview.items[0].disposition, ConversionDisposition::Replace);
        assert_eq!(
            preview.items[0].replacement.as_ref().unwrap().file_name,
            "cross-loader-forge.jar"
        );
        assert_eq!(preview.summary.replace, 1);
        assert_eq!(preview.summary.needs_review, 0);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unavailable_project_version_exposes_replacement_project_suggestion() {
        let root = temp_fixture("incompatible-resolution");
        let mods = root.join("mods");
        fs::create_dir_all(&mods).unwrap();
        fs::write(mods.join("loader-specific.jar"), b"loader-specific-mod").unwrap();

        let mut preview = preview_local_content(
            &root,
            "fabric-loader-0.15.6-1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();
        let relative_path = preview.items[0].relative_path.clone();

        apply_compatibility_resolution(
            &mut preview,
            &relative_path,
            CompatibilityResolution::Incompatible {
                project: Some(ConversionProject {
                    id: "fabric-only".to_string(),
                    name: "Fabric Only".to_string(),
                    page_url: "https://modrinth.com/mod/fabric-only".to_string(),
                }),
                suggestion: Some(ConversionSuggestion {
                    project_id: "forge-alternative".to_string(),
                    project_name: "Forge Alternative".to_string(),
                    page_url: "https://modrinth.com/mod/forge-alternative".to_string(),
                    reason: "Supports Forge on Minecraft 1.20.4".to_string(),
                }),
            },
        )
        .unwrap();

        assert_eq!(
            preview.items[0].disposition,
            ConversionDisposition::Incompatible
        );
        assert_eq!(
            preview.items[0].suggestion.as_ref().unwrap().project_name,
            "Forge Alternative"
        );
        assert_eq!(preview.summary.incompatible, 1);
        assert_eq!(preview.summary.needs_review, 0);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn shared_mod_version_supports_target_loader_and_game_version() {
        let version = ContentVersion {
            id: "shared-version".to_string(),
            project_id: "shared-project".to_string(),
            name: "Shared 1.20.4".to_string(),
            version_number: "1.0.0".to_string(),
            game_versions: vec!["1.20.4".to_string()],
            loaders: vec!["fabric".to_string(), "forge".to_string()],
            file_url: "https://cdn.modrinth.com/shared.jar".to_string(),
            file_name: "shared.jar".to_string(),
            file_size: 10,
            date_published: "2026-08-04T00:00:00Z".to_string(),
        };
        let target = ConversionTarget {
            game_version: "1.20.4".to_string(),
            loader: "forge".to_string(),
            loader_version: Some("49.0.30".to_string()),
        };

        assert!(super::content_version_supports_target(
            &version,
            ContentKind::Mod,
            &target
        ));
    }

    #[test]
    fn resource_pack_uses_minecraft_loader_compatibility() {
        let version = ContentVersion {
            id: "resource-version".to_string(),
            project_id: "resource-project".to_string(),
            name: "Resource Pack 1.20.4".to_string(),
            version_number: "1.0.0".to_string(),
            game_versions: vec!["1.20.4".to_string()],
            loaders: vec!["minecraft".to_string()],
            file_url: "https://cdn.modrinth.com/resource.zip".to_string(),
            file_name: "resource.zip".to_string(),
            file_size: 10,
            date_published: "2026-08-04T00:00:00Z".to_string(),
        };
        let target = ConversionTarget {
            game_version: "1.20.4".to_string(),
            loader: "forge".to_string(),
            loader_version: Some("49.0.30".to_string()),
        };

        assert!(super::content_version_supports_target(
            &version,
            ContentKind::ResourcePack,
            &target
        ));
    }

    #[tokio::test]
    async fn lookup_failure_keeps_preview_available_for_manual_review() {
        let root = temp_fixture("lookup-failure");
        let mods = root.join("mods");
        fs::create_dir_all(&mods).unwrap();
        fs::write(mods.join("offline.jar"), b"offline-mod").unwrap();
        let preview = preview_local_content(
            &root,
            "fabric-loader-0.15.6-1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();

        let preview = super::resolve_preview_with(preview, |_, _| async {
            Err("Modrinth is offline".to_string())
        })
        .await;

        assert_eq!(
            preview.items[0].disposition,
            ConversionDisposition::NeedsReview
        );
        assert_eq!(preview.lookup_warnings.len(), 1);
        assert!(preview.lookup_warnings[0].contains("offline.jar"));
        assert!(preview.lookup_warnings[0].contains("Modrinth is offline"));

        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn identical_files_at_different_paths_are_resolved_independently() {
        let root = temp_fixture("duplicate-hash-resolution");
        let mods = root.join("mods");
        fs::create_dir_all(&mods).unwrap();
        fs::write(mods.join("copy-a.jar"), b"identical-mod").unwrap();
        fs::write(mods.join("copy-b.jar"), b"identical-mod").unwrap();
        let preview = preview_local_content(
            &root,
            "fabric-loader-0.15.6-1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();

        let preview = super::resolve_preview_with(preview, |item, _| async move {
            Ok(Some(CompatibilityResolution::Compatible {
                project: ConversionProject {
                    id: item.relative_path.clone(),
                    name: item.file_name,
                    page_url: "https://modrinth.com/mod/example".to_string(),
                },
            }))
        })
        .await;

        assert_eq!(preview.summary.keep, 2);
        assert_eq!(preview.summary.needs_review, 0);
        assert!(
            preview
                .items
                .iter()
                .all(|item| item.disposition == ConversionDisposition::Keep)
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn excluding_incompatible_content_only_removes_the_target_copy() {
        let source = temp_fixture("exclude-source");
        let target = temp_fixture("exclude-target");
        fs::create_dir_all(source.join("mods")).unwrap();
        fs::create_dir_all(target.join("mods")).unwrap();
        fs::write(source.join("mods/incompatible.jar"), b"source-mod").unwrap();
        fs::write(target.join("mods/incompatible.jar"), b"target-copy").unwrap();

        let mut preview = preview_local_content(
            &source,
            "fabric-loader-0.15.6-1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();
        let relative_path = preview.items[0].relative_path.clone();
        apply_compatibility_resolution(
            &mut preview,
            &relative_path,
            CompatibilityResolution::Incompatible {
                project: None,
                suggestion: None,
            },
        )
        .unwrap();

        let prepared = super::prepare_target_content(
            &target,
            &preview,
            &["mods/incompatible.jar".to_string()],
        )
        .unwrap();

        assert!(source.join("mods/incompatible.jar").is_file());
        assert!(!target.join("mods/incompatible.jar").exists());
        assert_eq!(prepared.excluded_paths, ["mods/incompatible.jar"]);

        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(target).unwrap();
    }

    #[tokio::test]
    async fn replacement_download_swaps_only_the_target_copy() {
        let source = temp_fixture("replacement-source");
        let target = temp_fixture("replacement-target");
        fs::create_dir_all(source.join("mods")).unwrap();
        fs::create_dir_all(target.join("mods")).unwrap();
        fs::write(source.join("mods/current.jar"), b"source-current").unwrap();
        fs::write(target.join("mods/current.jar"), b"target-current").unwrap();

        let mut preview = preview_local_content(
            &source,
            "fabric-loader-0.15.6-1.20.4",
            Some("fabric"),
            ConversionTarget {
                game_version: "1.20.4".to_string(),
                loader: "forge".to_string(),
                loader_version: Some("49.0.30".to_string()),
            },
        )
        .unwrap();
        let relative_path = preview.items[0].relative_path.clone();
        apply_compatibility_resolution(
            &mut preview,
            &relative_path,
            CompatibilityResolution::Replacement {
                project: ConversionProject {
                    id: "project".to_string(),
                    name: "Project".to_string(),
                    page_url: "https://modrinth.com/mod/project".to_string(),
                },
                replacement: ConversionReplacement {
                    project_id: "project".to_string(),
                    project_name: "Project".to_string(),
                    version_id: "target-version".to_string(),
                    version_name: "Forge target".to_string(),
                    file_name: "target.jar".to_string(),
                    file_url: "https://cdn.modrinth.com/target.jar".to_string(),
                    page_url: "https://modrinth.com/mod/project/version/target-version".to_string(),
                },
            },
        )
        .unwrap();
        let prepared = super::prepare_target_content(&target, &preview, &[]).unwrap();

        let replaced = super::apply_replacement_tasks_with(
            &target,
            &prepared.replacements,
            |_, destination| async move {
                fs::write(destination, b"downloaded-target").map_err(|error| error.to_string())
            },
        )
        .await
        .unwrap();

        assert_eq!(
            fs::read(source.join("mods/current.jar")).unwrap(),
            b"source-current"
        );
        assert!(!target.join("mods/current.jar").exists());
        assert_eq!(
            fs::read(target.join("mods/target.jar")).unwrap(),
            b"downloaded-target"
        );
        assert_eq!(replaced, ["mods/target.jar"]);

        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(target).unwrap();
    }

    #[tokio::test]
    async fn replacement_preserves_a_disabled_mod_state() {
        let target = temp_fixture("disabled-replacement-target");
        fs::create_dir_all(target.join("mods")).unwrap();
        fs::write(
            target.join("mods/current.jar.disabled"),
            b"disabled-current",
        )
        .unwrap();
        let tasks = [super::ConversionReplacementTask {
            relative_path: "mods/current.jar.disabled".to_string(),
            replacement: ConversionReplacement {
                project_id: "project".to_string(),
                project_name: "Project".to_string(),
                version_id: "target-version".to_string(),
                version_name: "Forge target".to_string(),
                file_name: "target.jar".to_string(),
                file_url: "https://cdn.modrinth.com/target.jar".to_string(),
                page_url: "https://modrinth.com/mod/project/version/target-version".to_string(),
            },
        }];

        let replaced =
            super::apply_replacement_tasks_with(&target, &tasks, |_, destination| async move {
                fs::write(destination, b"downloaded-target").map_err(|error| error.to_string())
            })
            .await
            .unwrap();

        assert!(!target.join("mods/current.jar.disabled").exists());
        assert!(!target.join("mods/target.jar").exists());
        assert_eq!(
            fs::read(target.join("mods/target.jar.disabled")).unwrap(),
            b"downloaded-target"
        );
        assert_eq!(replaced, ["mods/target.jar.disabled"]);

        fs::remove_dir_all(target).unwrap();
    }

    #[tokio::test]
    async fn failed_replacement_download_leaves_the_target_copy_unchanged() {
        let target = temp_fixture("replacement-download-failure");
        fs::create_dir_all(target.join("mods")).unwrap();
        fs::write(target.join("mods/current.jar"), b"target-current").unwrap();
        let tasks = [super::ConversionReplacementTask {
            relative_path: "mods/current.jar".to_string(),
            replacement: ConversionReplacement {
                project_id: "project".to_string(),
                project_name: "Project".to_string(),
                version_id: "target-version".to_string(),
                version_name: "Forge target".to_string(),
                file_name: "target.jar".to_string(),
                file_url: "https://cdn.modrinth.com/target.jar".to_string(),
                page_url: "https://modrinth.com/mod/project/version/target-version".to_string(),
            },
        }];

        let result =
            super::apply_replacement_tasks_with(&target, &tasks, |_, destination| async move {
                fs::write(&destination, b"partial-download").map_err(|error| error.to_string())?;
                Err("download interrupted".to_string())
            })
            .await;

        assert_eq!(result.unwrap_err(), "download interrupted");
        assert_eq!(
            fs::read(target.join("mods/current.jar")).unwrap(),
            b"target-current"
        );
        assert!(!target.join("mods/target.jar").exists());
        assert_eq!(fs::read_dir(target.join("mods")).unwrap().count(), 1);

        fs::remove_dir_all(target).unwrap();
    }

    #[test]
    fn completed_conversion_operation_can_only_be_rolled_back_once() {
        let state = super::ConversionOperationState::default();
        state.complete("operation-1", "instance-copy");

        assert_eq!(
            state.take_completed("operation-1"),
            Some("instance-copy".to_string())
        );
        assert_eq!(state.take_completed("operation-1"), None);
    }

    #[test]
    fn conversion_target_requires_a_supported_loader_and_version() {
        assert!(
            super::validate_target(&ConversionTarget {
                game_version: "1.21.1".to_string(),
                loader: "fabric".to_string(),
                loader_version: None,
            })
            .is_err()
        );
        assert!(
            super::validate_target(&ConversionTarget {
                game_version: "1.21.1".to_string(),
                loader: "quilt".to_string(),
                loader_version: Some("0.27.0".to_string()),
            })
            .is_err()
        );
        assert!(
            super::validate_target(&ConversionTarget {
                game_version: "1.21.1".to_string(),
                loader: "vanilla".to_string(),
                loader_version: None,
            })
            .is_ok()
        );
    }

    #[test]
    fn datapack_replacement_search_stays_within_datapacks() {
        assert_eq!(
            super::project_type_filter(ContentKind::DataPack),
            "datapack"
        );
    }
}

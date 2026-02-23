use serde::{Deserialize, Serialize};
use std::error::Error;
use std::path::PathBuf;

use crate::core::game_version::GameVersion;
use ts_rs::TS;

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "manifest.ts")]
pub struct VersionManifest {
    pub latest: Latest,
    pub versions: Vec<Version>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "manifest.ts")]
pub struct Latest {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "manifest.ts")]
pub struct Version {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
    /// Java version requirement (major version number)
    /// This is populated from the version JSON file if the version is installed locally
    #[serde(skip_serializing_if = "Option::is_none")]
    pub java_version: Option<u64>,
    /// Whether this version is installed locally
    #[serde(rename = "isInstalled", skip_serializing_if = "Option::is_none")]
    pub is_installed: Option<bool>,
}

pub async fn fetch_version_manifest() -> Result<VersionManifest, Box<dyn Error + Send + Sync>> {
    let url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    let resp = reqwest::get(url).await?.json::<VersionManifest>().await?;
    Ok(resp)
}

/// Load a version JSON from the local versions directory.
///
/// This is used for loading both vanilla and modded versions that have been
/// previously downloaded or installed.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
/// * `version_id` - The version ID to load
///
/// # Returns
/// The parsed `GameVersion` if found, or an error if not found.
pub async fn load_local_version(
    game_dir: &std::path::Path,
    version_id: &str,
) -> Result<GameVersion, Box<dyn Error + Send + Sync>> {
    let json_path = game_dir
        .join("versions")
        .join(version_id)
        .join(format!("{}.json", version_id));

    if !json_path.exists() {
        return Err(format!("Version {} not found locally", version_id).into());
    }

    let content = tokio::fs::read_to_string(&json_path).await?;
    let version: GameVersion = serde_json::from_str(&content)?;
    Ok(version)
}

/// Fetch a version JSON from Mojang's servers.
///
/// # Arguments
/// * `version_id` - The version ID to fetch
///
/// # Returns
/// The parsed `GameVersion` from Mojang's API.
pub async fn fetch_vanilla_version(
    version_id: &str,
) -> Result<GameVersion, Box<dyn Error + Send + Sync>> {
    // First, get the manifest to find the version URL
    let manifest = fetch_version_manifest().await?;

    let version_entry = manifest
        .versions
        .iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| format!("Version {} not found in manifest", version_id))?;

    // Fetch the actual version JSON
    let resp = reqwest::get(&version_entry.url)
        .await?
        .json::<GameVersion>()
        .await?;

    Ok(resp)
}

/// Find the root vanilla version by following the inheritance chain.
///
/// For modded versions (Fabric, Forge), this walks up the `inheritsFrom`
/// chain to find the base vanilla Minecraft version.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
/// * `version_id` - The version ID to start from
///
/// # Returns
/// The ID of the root vanilla version (the version without `inheritsFrom`)
pub async fn find_root_version(
    game_dir: &std::path::Path,
    version_id: &str,
) -> Result<String, Box<dyn Error + Send + Sync>> {
    let mut current_id = version_id.to_string();

    // Keep following the inheritance chain
    loop {
        let version = match load_local_version(game_dir, &current_id).await {
            Ok(v) => v,
            Err(_) => {
                // If not found locally, assume it's a vanilla version (root)
                return Ok(current_id);
            }
        };

        // If this version has no parent, it's the root
        if let Some(parent_id) = version.inherits_from {
            current_id = parent_id;
        } else {
            // This is the root
            return Ok(current_id);
        }
    }
}

/// Load a version, checking local first, then fetching from remote if needed.
///
/// For modded versions (those with `inheritsFrom`), this will also resolve
/// the inheritance chain.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
/// * `version_id` - The version ID to load
///
/// # Returns
/// A fully resolved `GameVersion` ready for launching.
pub async fn load_version(
    game_dir: &std::path::Path,
    version_id: &str,
) -> Result<GameVersion, Box<dyn Error + Send + Sync>> {
    // Try loading from local first
    let mut version = match load_local_version(game_dir, version_id).await {
        Ok(v) => v,
        Err(_) => {
            // Not found locally, try fetching from Mojang
            fetch_vanilla_version(version_id).await?
        }
    };

    // If this version inherits from another, resolve the inheritance iteratively
    while let Some(parent_id) = version.inherits_from.clone() {
        // Load the parent version
        let parent = match load_local_version(game_dir, &parent_id).await {
            Ok(v) => v,
            Err(_) => fetch_vanilla_version(&parent_id).await?,
        };

        // Merge child into parent
        version = crate::core::version_merge::merge_versions(version, parent);
    }

    Ok(version)
}

/// Save a version JSON to the local versions directory.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
/// * `version` - The version to save
///
/// # Returns
/// The path where the JSON was saved.
pub async fn save_local_version(
    game_dir: &std::path::Path,
    version: &GameVersion,
) -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    let version_dir = game_dir.join("versions").join(&version.id);
    tokio::fs::create_dir_all(&version_dir).await?;

    let json_path = version_dir.join(format!("{}.json", version.id));
    let content = serde_json::to_string_pretty(version)?;
    tokio::fs::write(&json_path, content).await?;

    Ok(json_path)
}

/// List all locally installed versions.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
///
/// # Returns
/// A list of version IDs found in the versions directory.
#[allow(dead_code)]
pub async fn list_local_versions(
    game_dir: &std::path::Path,
) -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
    let versions_dir = game_dir.join("versions");
    let mut versions = Vec::new();

    if !versions_dir.exists() {
        return Ok(versions);
    }

    let mut entries = tokio::fs::read_dir(&versions_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        if entry.file_type().await?.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            let json_path = entry.path().join(format!("{}.json", name));
            if json_path.exists() {
                versions.push(name);
            }
        }
    }

    Ok(versions)
}

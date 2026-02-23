//! Fabric Loader support module.
//!
//! This module provides functionality to:
//! - Fetch available Fabric loader versions from the Fabric Meta API
//! - Generate version JSON files for Fabric-enabled Minecraft versions
//! - Install Fabric loader for a specific Minecraft version

use serde::{Deserialize, Serialize};
use std::error::Error;
use std::path::PathBuf;
use ts_rs::TS;

const FABRIC_META_URL: &str = "https://meta.fabricmc.net/v2";

/// Represents a Fabric loader version from the Meta API.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "fabric.ts")]
pub struct FabricLoaderVersion {
    pub separator: String,
    pub build: i32,
    pub maven: String,
    pub version: String,
    pub stable: bool,
}

/// Represents a Fabric intermediary mapping version.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "fabric.ts")]
pub struct FabricIntermediaryVersion {
    pub maven: String,
    pub version: String,
    pub stable: bool,
}

/// Represents a combined loader + intermediary version entry.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "fabric.ts")]
pub struct FabricLoaderEntry {
    pub loader: FabricLoaderVersion,
    pub intermediary: FabricIntermediaryVersion,
    #[serde(rename = "launcherMeta")]
    pub launcher_meta: FabricLauncherMeta,
}

/// Launcher metadata from Fabric Meta API.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "fabric.ts")]
pub struct FabricLauncherMeta {
    pub version: i32,
    pub libraries: FabricLibraries,
    #[serde(rename = "mainClass")]
    pub main_class: FabricMainClass,
}

/// Libraries required by Fabric loader.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "fabric.ts")]
pub struct FabricLibraries {
    pub client: Vec<FabricLibrary>,
    pub common: Vec<FabricLibrary>,
    pub server: Vec<FabricLibrary>,
}

/// A single Fabric library dependency.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "fabric.ts")]
pub struct FabricLibrary {
    pub name: String,
    pub url: Option<String>,
}

/// Main class configuration for Fabric.
/// Can be either a struct with client/server fields or a simple string.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "fabric.ts", untagged)]
#[serde(untagged)]
pub enum FabricMainClass {
    Structured { client: String, server: String },
    Simple(String),
}

#[allow(dead_code)]
impl FabricMainClass {
    pub fn client(&self) -> &str {
        match self {
            FabricMainClass::Structured { client, .. } => client,
            FabricMainClass::Simple(s) => s,
        }
    }

    pub fn server(&self) -> &str {
        match self {
            FabricMainClass::Structured { server, .. } => server,
            FabricMainClass::Simple(s) => s,
        }
    }
}

/// Represents a Minecraft version supported by Fabric.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "fabric.ts")]
pub struct FabricGameVersion {
    pub version: String,
    pub stable: bool,
}

/// Information about an installed Fabric version.
#[derive(Debug, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "fabric.ts")]
pub struct InstalledFabricVersion {
    pub id: String,
    pub minecraft_version: String,
    pub loader_version: String,
    pub path: PathBuf,
}

/// Fetch all Minecraft versions supported by Fabric.
///
/// # Returns
/// A list of game versions that have Fabric intermediary mappings available.
pub async fn fetch_supported_game_versions()
-> Result<Vec<FabricGameVersion>, Box<dyn Error + Send + Sync>> {
    let url = format!("{}/versions/game", FABRIC_META_URL);
    let resp = reqwest::get(&url)
        .await?
        .json::<Vec<FabricGameVersion>>()
        .await?;
    Ok(resp)
}

/// Fetch all available Fabric loader versions.
///
/// # Returns
/// A list of all Fabric loader versions, ordered by build number (newest first).
pub async fn fetch_loader_versions()
-> Result<Vec<FabricLoaderVersion>, Box<dyn Error + Send + Sync>> {
    let url = format!("{}/versions/loader", FABRIC_META_URL);
    let resp = reqwest::get(&url)
        .await?
        .json::<Vec<FabricLoaderVersion>>()
        .await?;
    Ok(resp)
}

/// Fetch Fabric loader versions available for a specific Minecraft version.
///
/// # Arguments
/// * `game_version` - The Minecraft version (e.g., "1.20.4")
///
/// # Returns
/// A list of loader entries with full metadata for the specified game version.
pub async fn fetch_loaders_for_game_version(
    game_version: &str,
) -> Result<Vec<FabricLoaderEntry>, Box<dyn Error + Send + Sync>> {
    let url = format!("{}/versions/loader/{}", FABRIC_META_URL, game_version);
    let resp = reqwest::get(&url)
        .await?
        .json::<Vec<FabricLoaderEntry>>()
        .await?;
    Ok(resp)
}

/// Fetch the version JSON profile for a specific Fabric loader + game version combination.
///
/// # Arguments
/// * `game_version` - The Minecraft version (e.g., "1.20.4")
/// * `loader_version` - The Fabric loader version (e.g., "0.15.6")
///
/// # Returns
/// The raw version JSON as a `serde_json::Value` that can be saved to the versions directory.
pub async fn fetch_version_profile(
    game_version: &str,
    loader_version: &str,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let url = format!(
        "{}/versions/loader/{}/{}/profile/json",
        FABRIC_META_URL, game_version, loader_version
    );
    let resp = reqwest::get(&url)
        .await?
        .json::<serde_json::Value>()
        .await?;
    Ok(resp)
}

/// Generate the version ID for a Fabric installation.
///
/// # Arguments
/// * `game_version` - The Minecraft version
/// * `loader_version` - The Fabric loader version
///
/// # Returns
/// The version ID string (e.g., "fabric-loader-0.15.6-1.20.4")
pub fn generate_version_id(game_version: &str, loader_version: &str) -> String {
    format!("fabric-loader-{}-{}", loader_version, game_version)
}

/// Install Fabric loader for a specific Minecraft version.
///
/// This creates the version JSON file in the versions directory.
/// The actual library downloads happen during game launch.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
/// * `game_version` - The Minecraft version (e.g., "1.20.4")
/// * `loader_version` - The Fabric loader version (e.g., "0.15.6")
///
/// # Returns
/// Information about the installed version.
pub async fn install_fabric(
    game_dir: &std::path::Path,
    game_version: &str,
    loader_version: &str,
) -> Result<InstalledFabricVersion, Box<dyn Error + Send + Sync>> {
    // Fetch the version profile from Fabric Meta
    let profile = fetch_version_profile(game_version, loader_version).await?;

    // Get the version ID from the profile or generate it
    let version_id = profile
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| generate_version_id(game_version, loader_version));

    // Create the version directory
    let version_dir = game_dir.join("versions").join(&version_id);
    tokio::fs::create_dir_all(&version_dir).await?;

    // Write the version JSON
    let json_path = version_dir.join(format!("{}.json", version_id));
    let json_content = serde_json::to_string_pretty(&profile)?;
    tokio::fs::write(&json_path, json_content).await?;

    Ok(InstalledFabricVersion {
        id: version_id,
        minecraft_version: game_version.to_string(),
        loader_version: loader_version.to_string(),
        path: json_path,
    })
}

/// Check if Fabric is installed for a specific version combination.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
/// * `game_version` - The Minecraft version
/// * `loader_version` - The Fabric loader version
///
/// # Returns
/// `true` if the version JSON exists, `false` otherwise.
pub fn is_fabric_installed(
    game_dir: &std::path::Path,
    game_version: &str,
    loader_version: &str,
) -> bool {
    let version_id = generate_version_id(game_version, loader_version);
    let json_path = game_dir
        .join("versions")
        .join(&version_id)
        .join(format!("{}.json", version_id));
    json_path.exists()
}

/// List all installed Fabric versions in the game directory.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
///
/// # Returns
/// A list of installed Fabric version IDs.
pub async fn list_installed_fabric_versions(
    game_dir: &std::path::Path,
) -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
    let versions_dir = game_dir.join("versions");
    let mut installed = Vec::new();

    if !versions_dir.exists() {
        return Ok(installed);
    }

    let mut entries = tokio::fs::read_dir(&versions_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("fabric-loader-") {
            // Verify the JSON file exists
            let json_path = entry.path().join(format!("{}.json", name));
            if json_path.exists() {
                installed.push(name);
            }
        }
    }

    Ok(installed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_version_id() {
        assert_eq!(
            generate_version_id("1.20.4", "0.15.6"),
            "fabric-loader-0.15.6-1.20.4"
        );
    }
}

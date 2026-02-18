//! Forge Loader support module.
//!
//! This module provides functionality to:
//! - Fetch available Forge versions from the Forge promotions API
//! - Install Forge loader for a specific Minecraft version
//!
//! Note: Forge installation is more complex than Fabric, especially for versions 1.13+.
//! This implementation fetches the installer manifest to get the correct library list.

use serde::{Deserialize, Serialize};
use std::error::Error;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use ts_rs::TS;

const FORGE_PROMOTIONS_URL: &str =
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
const FORGE_MAVEN_URL: &str = "https://maven.minecraftforge.net/";
const FORGE_FILES_URL: &str = "https://files.minecraftforge.net/";

/// Represents a Forge version entry.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "forge.ts")]
pub struct ForgeVersion {
    pub version: String,
    pub minecraft_version: String,
    #[serde(default)]
    pub recommended: bool,
    #[serde(default)]
    pub latest: bool,
}

/// Forge promotions response from the API.
#[derive(Debug, Deserialize)]
struct ForgePromotions {
    promos: std::collections::HashMap<String, String>,
}

/// Information about an installed Forge version.
#[derive(Debug, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "forge.ts")]
pub struct InstalledForgeVersion {
    pub id: String,
    pub minecraft_version: String,
    pub forge_version: String,
    #[ts(type = "string")]
    pub path: PathBuf,
}

/// Forge installer manifest structure (from version.json inside installer JAR)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ForgeInstallerManifest {
    id: Option<String>,
    #[serde(rename = "inheritsFrom")]
    inherits_from: Option<String>,
    #[serde(rename = "mainClass")]
    main_class: Option<String>,
    #[serde(default)]
    libraries: Vec<ForgeLibrary>,
    arguments: Option<ForgeArguments>,
}

#[derive(Debug, Deserialize)]
struct ForgeArguments {
    game: Option<Vec<serde_json::Value>>,
    jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize, Clone)]
struct ForgeLibrary {
    name: String,
    #[serde(default)]
    downloads: Option<ForgeLibraryDownloads>,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct ForgeLibraryDownloads {
    artifact: Option<ForgeArtifact>,
}

#[derive(Debug, Deserialize, Clone)]
struct ForgeArtifact {
    path: Option<String>,
    url: Option<String>,
    sha1: Option<String>,
}

/// Fetch all Minecraft versions supported by Forge.
///
/// # Returns
/// A list of Minecraft version strings that have Forge available.
pub async fn fetch_supported_game_versions() -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
    let promos = fetch_promotions().await?;

    let mut versions: Vec<String> = promos
        .promos
        .keys()
        .filter_map(|key| {
            // Keys are like "1.20.4-latest", "1.20.4-recommended"
            let parts: Vec<&str> = key.split('-').collect();
            if parts.len() >= 2 {
                Some(parts[0].to_string())
            } else {
                None
            }
        })
        .collect();

    // Deduplicate and sort
    versions.sort();
    versions.dedup();
    versions.reverse(); // Newest first

    Ok(versions)
}

/// Fetch Forge promotions data.
async fn fetch_promotions() -> Result<ForgePromotions, Box<dyn Error + Send + Sync>> {
    let resp = reqwest::get(FORGE_PROMOTIONS_URL)
        .await?
        .json::<ForgePromotions>()
        .await?;
    Ok(resp)
}

/// Fetch available Forge versions for a specific Minecraft version.
///
/// # Arguments
/// * `game_version` - The Minecraft version (e.g., "1.20.4")
///
/// # Returns
/// A list of Forge versions available for the specified game version.
pub async fn fetch_forge_versions(
    game_version: &str,
) -> Result<Vec<ForgeVersion>, Box<dyn Error + Send + Sync>> {
    let promos = fetch_promotions().await?;
    let mut versions = Vec::new();

    // Look for both latest and recommended
    let latest_key = format!("{}-latest", game_version);
    let recommended_key = format!("{}-recommended", game_version);

    if let Some(latest) = promos.promos.get(&latest_key) {
        versions.push(ForgeVersion {
            version: latest.clone(),
            minecraft_version: game_version.to_string(),
            recommended: false,
            latest: true,
        });
    }

    if let Some(recommended) = promos.promos.get(&recommended_key) {
        // Don't duplicate if recommended == latest
        if !versions.iter().any(|v| v.version == *recommended) {
            versions.push(ForgeVersion {
                version: recommended.clone(),
                minecraft_version: game_version.to_string(),
                recommended: true,
                latest: false,
            });
        } else {
            // Mark the existing one as both
            if let Some(v) = versions.iter_mut().find(|v| v.version == *recommended) {
                v.recommended = true;
            }
        }
    }

    Ok(versions)
}

/// Generate the version ID for a Forge installation.
///
/// # Arguments
/// * `game_version` - The Minecraft version
/// * `forge_version` - The Forge version
///
/// # Returns
/// The version ID string (e.g., "1.20.4-forge-49.0.38")
pub fn generate_version_id(game_version: &str, forge_version: &str) -> String {
    format!("{}-forge-{}", game_version, forge_version)
}

/// Try to download the Forge installer from multiple possible URL formats.
/// This is necessary because older Forge versions use different URL patterns.
async fn try_download_forge_installer(
    game_version: &str,
    forge_version: &str,
) -> Result<bytes::Bytes, Box<dyn Error + Send + Sync>> {
    let forge_full = format!("{}-{}", game_version, forge_version);
    // For older versions (like 1.7.10), the URL needs an additional -{game_version} suffix
    let forge_full_with_suffix = format!("{}-{}", forge_full, game_version);

    // Try different URL formats for different Forge versions
    // Order matters: try most common formats first, then fallback to alternatives
    let url_patterns = vec![
        // Standard Maven format (for modern versions): forge/{game_version}-{forge_version}/forge-{game_version}-{forge_version}-installer.jar
        format!(
            "{}net/minecraftforge/forge/{}/forge-{}-installer.jar",
            FORGE_MAVEN_URL, forge_full, forge_full
        ),
        // Old version format with suffix (for versions like 1.7.10): forge/{game_version}-{forge_version}-{game_version}/forge-{game_version}-{forge_version}-{game_version}-installer.jar
        // This is the correct format for 1.7.10 and similar old versions
        format!(
            "{}net/minecraftforge/forge/{}/forge-{}-installer.jar",
            FORGE_MAVEN_URL, forge_full_with_suffix, forge_full_with_suffix
        ),
        // Files.minecraftforge.net format with suffix (for old versions like 1.7.10)
        format!(
            "{}maven/net/minecraftforge/forge/{}/forge-{}-installer.jar",
            FORGE_FILES_URL, forge_full_with_suffix, forge_full_with_suffix
        ),
        // Files.minecraftforge.net standard format (for older versions)
        format!(
            "{}maven/net/minecraftforge/forge/{}/forge-{}-installer.jar",
            FORGE_FILES_URL, forge_full, forge_full
        ),
        // Alternative Maven format
        format!(
            "{}net/minecraftforge/forge/{}-{}/forge-{}-{}-installer.jar",
            FORGE_MAVEN_URL, game_version, forge_version, game_version, forge_version
        ),
        // Alternative files format
        format!(
            "{}maven/net/minecraftforge/forge/{}-{}/forge-{}-{}-installer.jar",
            FORGE_FILES_URL, game_version, forge_version, game_version, forge_version
        ),
    ];

    let mut last_error = None;
    for url in url_patterns {
        println!("Trying Forge installer URL: {}", url);
        match reqwest::get(&url).await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.bytes().await {
                        Ok(bytes) => {
                            println!("Successfully downloaded Forge installer from: {}", url);
                            return Ok(bytes);
                        }
                        Err(e) => {
                            last_error = Some(format!("Failed to read response body: {}", e));
                            continue;
                        }
                    }
                } else {
                    last_error = Some(format!("HTTP {}: {}", response.status(), url));
                    continue;
                }
            }
            Err(e) => {
                last_error = Some(format!("Request failed: {}", e));
                continue;
            }
        }
    }

    Err(format!(
        "Failed to download Forge installer from any URL. Last error: {}",
        last_error.unwrap_or_else(|| "Unknown error".to_string())
    )
    .into())
}

/// Fetch the Forge installer manifest to get the library list
async fn fetch_forge_installer_manifest(
    game_version: &str,
    forge_version: &str,
) -> Result<ForgeInstallerManifest, Box<dyn Error + Send + Sync>> {
    let bytes = try_download_forge_installer(game_version, forge_version).await?;

    // Extract version.json from the JAR (which is a ZIP file)
    let cursor = std::io::Cursor::new(bytes.as_ref());
    let mut archive = zip::ZipArchive::new(cursor)?;

    // Look for version.json in the archive
    let version_json = archive.by_name("version.json")?;
    let manifest: ForgeInstallerManifest = serde_json::from_reader(version_json)?;

    Ok(manifest)
}

/// Install Forge for a specific Minecraft version.
///
/// This function downloads the Forge installer JAR and runs it in headless mode
/// to properly install Forge with all necessary patches.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
/// * `game_version` - The Minecraft version (e.g., "1.20.4")
/// * `forge_version` - The Forge version (e.g., "49.0.38")
/// * `java_path` - Path to the Java executable
///
/// # Returns
/// Information about the installed version.
pub async fn install_forge(
    game_dir: &std::path::Path,
    game_version: &str,
    forge_version: &str,
) -> Result<InstalledForgeVersion, Box<dyn Error + Send + Sync>> {
    let version_id = generate_version_id(game_version, forge_version);

    // Fetch the installer manifest to get the complete version.json
    let manifest = fetch_forge_installer_manifest(game_version, forge_version).await?;

    // Create version JSON from the manifest
    let version_json =
        create_forge_version_json_from_manifest(game_version, forge_version, &manifest)?;

    // Create the version directory
    let version_dir = game_dir.join("versions").join(&version_id);
    tokio::fs::create_dir_all(&version_dir).await?;

    // Write the version JSON
    let json_path = version_dir.join(format!("{}.json", version_id));
    let json_content = serde_json::to_string_pretty(&version_json)?;
    tokio::fs::write(&json_path, json_content).await?;

    Ok(InstalledForgeVersion {
        id: version_id,
        minecraft_version: game_version.to_string(),
        forge_version: forge_version.to_string(),
        path: json_path,
    })
}

/// Install Forge using the official installer JAR.
/// This runs the Forge installer in headless mode to properly patch the client.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
/// * `game_version` - The Minecraft version
/// * `forge_version` - The Forge version
/// * `java_path` - Path to the Java executable
///
/// # Returns
/// Result indicating success or failure
pub async fn run_forge_installer(
    game_dir: &PathBuf,
    game_version: &str,
    forge_version: &str,
    java_path: &PathBuf,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let installer_path = game_dir.join("forge-installer.jar");

    // Download installer using the same multi-URL approach
    let bytes = try_download_forge_installer(game_version, forge_version).await?;
    tokio::fs::write(&installer_path, &bytes).await?;

    // Run the installer in headless mode
    // The installer accepts --installClient <path> to install to a specific directory
    let mut cmd = tokio::process::Command::new(java_path);
    cmd.arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .arg(game_dir);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().await?;

    // Clean up installer
    let _ = tokio::fs::remove_file(&installer_path).await;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Forge installer failed:\nstdout: {}\nstderr: {}",
            stdout, stderr
        )
        .into());
    }

    Ok(())
}

/// Create a Forge version JSON from the installer manifest.
fn create_forge_version_json_from_manifest(
    game_version: &str,
    forge_version: &str,
    manifest: &ForgeInstallerManifest,
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let version_id = generate_version_id(game_version, forge_version);

    // Use main class from manifest or default
    let main_class = manifest.main_class.clone().unwrap_or_else(|| {
        if is_modern_forge(game_version) {
            "cpw.mods.bootstraplauncher.BootstrapLauncher".to_string()
        } else {
            "net.minecraft.launchwrapper.Launch".to_string()
        }
    });

    // Convert libraries to JSON format, preserving download info
    let lib_entries: Vec<serde_json::Value> = manifest
        .libraries
        .iter()
        .map(|lib| {
            let mut entry = serde_json::json!({
                "name": lib.name
            });

            // Add URL if present
            if let Some(url) = &lib.url {
                entry["url"] = serde_json::Value::String(url.clone());
            } else {
                // Default to Forge Maven for Forge libraries
                entry["url"] = serde_json::Value::String(FORGE_MAVEN_URL.to_string());
            }

            // Add downloads if present
            if let Some(downloads) = &lib.downloads {
                if let Some(artifact) = &downloads.artifact {
                    let mut artifact_json = serde_json::Map::new();
                    if let Some(path) = &artifact.path {
                        artifact_json
                            .insert("path".to_string(), serde_json::Value::String(path.clone()));
                    }
                    if let Some(url) = &artifact.url {
                        artifact_json
                            .insert("url".to_string(), serde_json::Value::String(url.clone()));
                    }
                    if let Some(sha1) = &artifact.sha1 {
                        artifact_json
                            .insert("sha1".to_string(), serde_json::Value::String(sha1.clone()));
                    }
                    if !artifact_json.is_empty() {
                        entry["downloads"] = serde_json::json!({
                            "artifact": artifact_json
                        });
                    }
                }
            }

            entry
        })
        .collect();

    // Build arguments
    let mut arguments = serde_json::json!({
        "game": [],
        "jvm": []
    });

    if let Some(args) = &manifest.arguments {
        if let Some(game_args) = &args.game {
            arguments["game"] = serde_json::Value::Array(game_args.clone());
        }
        if let Some(jvm_args) = &args.jvm {
            arguments["jvm"] = serde_json::Value::Array(jvm_args.clone());
        }
    }

    let json = serde_json::json!({
        "id": version_id,
        "inheritsFrom": manifest.inherits_from.clone().unwrap_or_else(|| game_version.to_string()),
        "type": "release",
        "mainClass": main_class,
        "libraries": lib_entries,
        "arguments": arguments
    });

    Ok(json)
}

/// Create a Forge version JSON with the proper library list (fallback).
#[allow(dead_code)]
fn create_forge_version_json(
    game_version: &str,
    forge_version: &str,
    libraries: &[ForgeLibrary],
) -> Result<serde_json::Value, Box<dyn Error + Send + Sync>> {
    let version_id = generate_version_id(game_version, forge_version);

    // Determine main class based on version
    let main_class = if is_modern_forge(game_version) {
        "cpw.mods.bootstraplauncher.BootstrapLauncher"
    } else {
        "net.minecraft.launchwrapper.Launch"
    };

    // Convert libraries to JSON format
    let lib_entries: Vec<serde_json::Value> = libraries
        .iter()
        .map(|lib| {
            serde_json::json!({
                "name": lib.name,
                "url": FORGE_MAVEN_URL
            })
        })
        .collect();

    let json = serde_json::json!({
        "id": version_id,
        "inheritsFrom": game_version,
        "type": "release",
        "mainClass": main_class,
        "libraries": lib_entries,
        "arguments": {
            "game": [],
            "jvm": []
        }
    });

    Ok(json)
}

/// Check if the Minecraft version uses modern Forge (1.13+).
fn is_modern_forge(game_version: &str) -> bool {
    let parts: Vec<&str> = game_version.split('.').collect();
    if parts.len() >= 2 {
        if let (Ok(major), Ok(minor)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
            return major > 1 || (major == 1 && minor >= 13);
        }
    }
    false
}

/// Check if Forge is installed for a specific version combination.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
/// * `game_version` - The Minecraft version
/// * `forge_version` - The Forge version
///
/// # Returns
/// `true` if the version JSON exists, `false` otherwise.
#[allow(dead_code)]
pub fn is_forge_installed(
    game_dir: &std::path::Path,
    game_version: &str,
    forge_version: &str,
) -> bool {
    let version_id = generate_version_id(game_version, forge_version);
    let json_path = game_dir
        .join("versions")
        .join(&version_id)
        .join(format!("{}.json", version_id));
    json_path.exists()
}

/// List all installed Forge versions in the game directory.
///
/// # Arguments
/// * `game_dir` - The .minecraft directory path
///
/// # Returns
/// A list of installed Forge version IDs.
#[allow(dead_code)]
pub async fn list_installed_forge_versions(
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
        if name.contains("-forge-") {
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
            generate_version_id("1.20.4", "49.0.38"),
            "1.20.4-forge-49.0.38"
        );
    }

    #[test]
    fn test_is_modern_forge() {
        assert!(!is_modern_forge("1.12.2"));
        assert!(is_modern_forge("1.13"));
        assert!(is_modern_forge("1.20.4"));
        assert!(is_modern_forge("1.21"));
    }
}

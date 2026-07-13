//! Forge Loader support module.
//!
//! Handles Forge installation across all Minecraft versions:
//! - **Pre-1.6**: Not supported (extremely old)
//! - **1.6 - 1.12.2**: "Legacy" Forge — uses universal jar, no installer needed.
//!   Download `forge-{mc}-{forge}-universal.jar`, write a version JSON with
//!   `net.minecraft.launchwrapper.Launch` as main class.
//! - **1.13 - 1.16.5**: "Transitional" Forge — installer JAR contains
//!   `install_profile.json` (not `version.json`).  We run the installer headlessly
//!   and also extract the embedded `version.json` if present.
//! - **1.17+**: "Modern" Forge — installer JAR contains `version.json` directly.
//!   We can extract it or run the installer.

use serde::{Deserialize, Serialize};
use std::error::Error;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
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

// ─── Internal manifest structures ────────────────────────────────────────────

/// Modern Forge installer manifest (version.json inside installer JAR for 1.17+)
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

/// Transitional Forge installer profile (install_profile.json for 1.13-1.16.x)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ForgeInstallProfile {
    version: Option<String>,
    #[serde(rename = "versionInfo")]
    version_info: Option<serde_json::Value>,
    #[serde(default)]
    libraries: Vec<ForgeLibrary>,
    #[serde(default)]
    processors: Vec<serde_json::Value>,
}

// ─── Forge era detection ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ForgeEra {
    /// 1.6 - 1.12.2: Universal jar, no installer needed
    Legacy,
    /// 1.13 - 1.16.5: Installer with install_profile.json
    Transitional,
    /// 1.17+: Installer with version.json
    Modern,
}

fn detect_forge_era(game_version: &str) -> ForgeEra {
    let parts: Vec<u32> = game_version
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect();

    match (parts.first(), parts.get(1)) {
        (Some(1), Some(minor)) if *minor <= 12 => ForgeEra::Legacy,
        (Some(1), Some(minor)) if *minor >= 13 && *minor <= 16 => ForgeEra::Transitional,
        _ => ForgeEra::Modern,
    }
}

// ─── Public API: version listing ─────────────────────────────────────────────

/// Fetch all Minecraft versions supported by Forge.
pub async fn fetch_supported_game_versions() -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
    let promos = fetch_promotions().await?;
    let mut versions: Vec<String> = promos
        .promos
        .keys()
        .filter_map(|key| {
            let parts: Vec<&str> = key.split('-').collect();
            if parts.len() >= 2 {
                Some(parts[0].to_string())
            } else {
                None
            }
        })
        .collect();

    versions.sort();
    versions.dedup();
    versions.reverse();
    Ok(versions)
}

async fn fetch_promotions() -> Result<ForgePromotions, Box<dyn Error + Send + Sync>> {
    let resp = reqwest::get(FORGE_PROMOTIONS_URL)
        .await?
        .json::<ForgePromotions>()
        .await?;
    Ok(resp)
}

/// Fetch available Forge versions for a specific Minecraft version.
pub async fn fetch_forge_versions(
    game_version: &str,
) -> Result<Vec<ForgeVersion>, Box<dyn Error + Send + Sync>> {
    let promos = fetch_promotions().await?;
    let mut versions = Vec::new();

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
        if !versions.iter().any(|v| v.version == *recommended) {
            versions.push(ForgeVersion {
                version: recommended.clone(),
                minecraft_version: game_version.to_string(),
                recommended: true,
                latest: false,
            });
        } else if let Some(v) = versions.iter_mut().find(|v| v.version == *recommended) {
            v.recommended = true;
        }
    }

    Ok(versions)
}

/// Generate the version ID for a Forge installation.
pub fn generate_version_id(game_version: &str, forge_version: &str) -> String {
    format!("{}-forge-{}", game_version, forge_version)
}

// ─── Public API: installation ────────────────────────────────────────────────

/// Install Forge for a specific Minecraft version.
///
/// Automatically detects the Forge era and uses the appropriate strategy:
/// - Legacy (<=1.12.2): Download universal jar, write version JSON manually
/// - Transitional (1.13-1.16.5): Run installer headlessly
/// - Modern (1.17+): Extract version.json from installer, optionally run installer
pub async fn install_forge(
    game_dir: &Path,
    game_version: &str,
    forge_version: &str,
    java_path: Option<&Path>,
) -> Result<InstalledForgeVersion, Box<dyn Error + Send + Sync>> {
    install_forge_with_mirror(
        game_dir,
        game_version,
        forge_version,
        java_path,
        crate::core::mirror::MirrorSource::Official,
    )
    .await
}

pub async fn install_forge_with_mirror(
    game_dir: &Path,
    game_version: &str,
    forge_version: &str,
    java_path: Option<&Path>,
    _mirror: crate::core::mirror::MirrorSource,
) -> Result<InstalledForgeVersion, Box<dyn Error + Send + Sync>> {
    let era = detect_forge_era(game_version);
    let _version_id = generate_version_id(game_version, forge_version);

    println!(
        "[Forge] Installing {} for MC {} (era: {:?})",
        forge_version, game_version, era
    );

    match era {
        ForgeEra::Legacy => install_forge_legacy(game_dir, game_version, forge_version).await,
        ForgeEra::Transitional => {
            let java = java_path.ok_or("Java path required for Forge 1.13-1.16 installation")?;
            install_forge_with_installer(game_dir, game_version, forge_version, java).await
        }
        ForgeEra::Modern => {
            // Modern Forge: extract version.json from installer
            // If java is available, also run the installer for processor tasks
            let result =
                install_forge_modern(game_dir, game_version, forge_version, java_path).await?;
            Ok(result)
        }
    }
}

// ─── Legacy Forge (1.6 - 1.12.2) ────────────────────────────────────────────

/// Legacy Forge: download the universal jar and create a version JSON manually.
/// No installer is needed for these versions.
async fn install_forge_legacy(
    game_dir: &Path,
    game_version: &str,
    forge_version: &str,
) -> Result<InstalledForgeVersion, Box<dyn Error + Send + Sync>> {
    let version_id = generate_version_id(game_version, forge_version);
    let forge_full = format!("{}-{}", game_version, forge_version);

    // Download the universal jar to libraries
    let universal_bytes = try_download_forge_artifact(game_version, forge_version, "universal").await?;

    // Store in libraries directory following Maven layout
    let lib_path = game_dir
        .join("libraries")
        .join("net")
        .join("minecraftforge")
        .join("forge")
        .join(&forge_full)
        .join(format!("forge-{}-universal.jar", forge_full));

    if let Some(parent) = lib_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&lib_path, &universal_bytes).await?;

    // Create version JSON
    let version_dir = game_dir.join("versions").join(&version_id);
    tokio::fs::create_dir_all(&version_dir).await?;

    let json = serde_json::json!({
        "id": version_id,
        "inheritsFrom": game_version,
        "type": "release",
        "mainClass": "net.minecraft.launchwrapper.Launch",
        "libraries": [
            {
                "name": format!("net.minecraftforge:forge:{}", forge_full),
                "url": FORGE_MAVEN_URL
            }
        ],
        "arguments": {
            "game": ["--tweakClass", "cpw.mods.fml.common.launcher.FMLTweaker"],
            "jvm": []
        }
    });

    let json_path = version_dir.join(format!("{}.json", version_id));
    tokio::fs::write(&json_path, serde_json::to_string_pretty(&json)?).await?;

    println!("[Forge] Legacy installation complete: {}", version_id);

    Ok(InstalledForgeVersion {
        id: version_id,
        minecraft_version: game_version.to_string(),
        forge_version: forge_version.to_string(),
        path: json_path,
    })
}

// ─── Transitional + Modern Forge (1.13+) with installer ──────────────────────

/// Run the Forge installer JAR headlessly. Works for both transitional and modern.
async fn install_forge_with_installer(
    game_dir: &Path,
    game_version: &str,
    forge_version: &str,
    java_path: &Path,
) -> Result<InstalledForgeVersion, Box<dyn Error + Send + Sync>> {
    let version_id = generate_version_id(game_version, forge_version);

    // Download installer once
    let installer_bytes =
        try_download_forge_artifact(game_version, forge_version, "installer").await?;
    let installer_path = game_dir.join("forge-installer-tmp.jar");
    tokio::fs::write(&installer_path, &installer_bytes).await?;

    // Run installer in headless mode
    println!("[Forge] Running installer headlessly...");
    let mut cmd = tokio::process::Command::new(java_path);
    cmd.arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .arg(game_dir);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().await?;

    // Clean up installer jar
    let _ = tokio::fs::remove_file(&installer_path).await;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        println!("[Forge] Installer stderr: {}", stderr);

        // Even if the installer "failed", check if it created the version JSON
        // Some Forge versions return non-zero but still work
        let json_path = game_dir
            .join("versions")
            .join(&version_id)
            .join(format!("{}.json", version_id));

        if json_path.exists() {
            println!("[Forge] Installer reported failure but version JSON exists, continuing...");
        } else {
            return Err(format!(
                "Forge installer failed:\nstdout: {}\nstderr: {}",
                stdout.chars().take(500).collect::<String>(),
                stderr.chars().take(500).collect::<String>(),
            )
            .into());
        }
    }

    let json_path = game_dir
        .join("versions")
        .join(&version_id)
        .join(format!("{}.json", version_id));

    if !json_path.exists() {
        // Fallback: extract version.json from installer JAR and write manually
        println!("[Forge] Installer didn't create version JSON, extracting from JAR...");
        let cursor = std::io::Cursor::new(&installer_bytes);
        let result =
            extract_version_json_from_installer(cursor, game_dir, game_version, forge_version)
                .await?;
        return Ok(result);
    }

    println!("[Forge] Installer completed successfully: {}", version_id);

    Ok(InstalledForgeVersion {
        id: version_id,
        minecraft_version: game_version.to_string(),
        forge_version: forge_version.to_string(),
        path: json_path,
    })
}

/// Modern Forge (1.17+): Extract version.json directly from installer JAR.
/// If java_path is provided, also run the installer for processor tasks.
async fn install_forge_modern(
    game_dir: &Path,
    game_version: &str,
    forge_version: &str,
    java_path: Option<&Path>,
) -> Result<InstalledForgeVersion, Box<dyn Error + Send + Sync>> {
    let version_id = generate_version_id(game_version, forge_version);

    // Download installer once
    let installer_bytes =
        try_download_forge_artifact(game_version, forge_version, "installer").await?;

    // If we have Java, run the installer first (handles processor tasks like BINPATCH etc.)
    if let Some(java) = java_path {
        let installer_path = game_dir.join("forge-installer-tmp.jar");
        tokio::fs::write(&installer_path, &installer_bytes).await?;

        println!("[Forge] Running modern installer for processor tasks...");
        let mut cmd = tokio::process::Command::new(java);
        cmd.arg("-jar")
            .arg(&installer_path)
            .arg("--installClient")
            .arg(game_dir);

        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000);

        let output = cmd.output().await;
        let _ = tokio::fs::remove_file(&installer_path).await;

        match output {
            Ok(o) if o.status.success() => {
                println!("[Forge] Installer completed successfully");
            }
            Ok(o) => {
                let stderr = String::from_utf8_lossy(&o.stderr);
                println!(
                    "[Forge] Installer exit non-zero, continuing anyway: {}",
                    stderr.chars().take(200).collect::<String>()
                );
            }
            Err(e) => {
                println!("[Forge] Installer failed to run: {}, falling back to manual extraction", e);
            }
        }
    }

    // Check if installer already created the version JSON
    let json_path = game_dir
        .join("versions")
        .join(&version_id)
        .join(format!("{}.json", version_id));

    if json_path.exists() {
        return Ok(InstalledForgeVersion {
            id: version_id,
            minecraft_version: game_version.to_string(),
            forge_version: forge_version.to_string(),
            path: json_path,
        });
    }

    // Extract version.json from installer
    let cursor = std::io::Cursor::new(&installer_bytes);
    extract_version_json_from_installer(cursor, game_dir, game_version, forge_version).await
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/// Extract version.json (or build one from install_profile.json) from an installer JAR.
async fn extract_version_json_from_installer<R: std::io::Read + std::io::Seek>(
    reader: R,
    game_dir: &Path,
    game_version: &str,
    forge_version: &str,
) -> Result<InstalledForgeVersion, Box<dyn Error + Send + Sync>> {
    let version_id = generate_version_id(game_version, forge_version);
    let mut archive = zip::ZipArchive::new(reader)?;

    // Try version.json first (modern format)
    let version_json: serde_json::Value = if let Ok(entry) = archive.by_name("version.json") {
        serde_json::from_reader(entry)?
    } else if let Ok(entry) = archive.by_name("install_profile.json") {
        // Transitional format: extract versionInfo from install_profile
        let profile: serde_json::Value = serde_json::from_reader(entry)?;
        if let Some(vi) = profile.get("versionInfo") {
            vi.clone()
        } else {
            // 1.13+ install_profile doesn't have versionInfo, build minimal JSON
            build_fallback_version_json(game_version, forge_version)
        }
    } else {
        // No manifest found, build a minimal version JSON
        build_fallback_version_json(game_version, forge_version)
    };

    let version_dir = game_dir.join("versions").join(&version_id);
    tokio::fs::create_dir_all(&version_dir).await?;

    let json_path = version_dir.join(format!("{}.json", version_id));
    let content = serde_json::to_string_pretty(&version_json)?;
    tokio::fs::write(&json_path, content).await?;

    Ok(InstalledForgeVersion {
        id: version_id,
        minecraft_version: game_version.to_string(),
        forge_version: forge_version.to_string(),
        path: json_path,
    })
}

/// Build a minimal fallback version JSON when we can't extract one.
fn build_fallback_version_json(game_version: &str, forge_version: &str) -> serde_json::Value {
    let version_id = generate_version_id(game_version, forge_version);
    let forge_full = format!("{}-{}", game_version, forge_version);
    let era = detect_forge_era(game_version);

    let main_class = match era {
        ForgeEra::Legacy => "net.minecraft.launchwrapper.Launch",
        ForgeEra::Transitional => "cpw.mods.modlauncher.Launcher",
        ForgeEra::Modern => "cpw.mods.bootstraplauncher.BootstrapLauncher",
    };

    serde_json::json!({
        "id": version_id,
        "inheritsFrom": game_version,
        "type": "release",
        "mainClass": main_class,
        "libraries": [
            {
                "name": format!("net.minecraftforge:forge:{}", forge_full),
                "url": FORGE_MAVEN_URL
            }
        ],
        "arguments": {
            "game": [],
            "jvm": []
        }
    })
}

/// Try to download a Forge artifact (installer or universal) from multiple URL patterns.
async fn try_download_forge_artifact(
    game_version: &str,
    forge_version: &str,
    artifact_type: &str, // "installer" or "universal"
) -> Result<bytes::Bytes, Box<dyn Error + Send + Sync>> {
    try_download_forge_artifact_with_mirror(
        game_version,
        forge_version,
        artifact_type,
        crate::core::mirror::MirrorSource::Official,
    )
    .await
}

/// Try to download a Forge artifact with mirror support.
async fn try_download_forge_artifact_with_mirror(
    game_version: &str,
    forge_version: &str,
    artifact_type: &str,
    mirror: crate::core::mirror::MirrorSource,
) -> Result<bytes::Bytes, Box<dyn Error + Send + Sync>> {
    let forge_full = format!("{}-{}", game_version, forge_version);
    let forge_full_with_suffix = format!("{}-{}", forge_full, game_version);

    let maven_base = crate::core::mirror::forge_maven_url(mirror);

    let url_patterns = vec![
        // Standard Maven format (most common)
        format!(
            "{}net/minecraftforge/forge/{}/forge-{}-{}.jar",
            maven_base, forge_full, forge_full, artifact_type
        ),
        // Old version format with suffix (e.g. 1.7.10)
        format!(
            "{}net/minecraftforge/forge/{}/forge-{}-{}.jar",
            maven_base, forge_full_with_suffix, forge_full_with_suffix, artifact_type
        ),
    ];

    let mut last_error = None;
    for url in &url_patterns {
        println!("[Forge] Trying URL: {}", url);
        match reqwest::get(url).await {
            Ok(response) if response.status().is_success() => {
                match response.bytes().await {
                    Ok(bytes) => {
                        println!("[Forge] Downloaded from: {}", url);
                        return Ok(bytes);
                    }
                    Err(e) => {
                        last_error = Some(format!("Body read failed: {}", e));
                    }
                }
            }
            Ok(response) => {
                last_error = Some(format!("HTTP {}: {}", response.status(), url));
            }
            Err(e) => {
                last_error = Some(format!("Request failed: {}", e));
            }
        }
    }

    Err(format!(
        "Failed to download Forge {} from any URL. Last error: {}",
        artifact_type,
        last_error.unwrap_or_else(|| "Unknown error".to_string())
    )
    .into())
}

/// Check if Forge is installed for a specific version combination.
pub fn is_forge_installed(game_dir: &Path, game_version: &str, forge_version: &str) -> bool {
    let version_id = generate_version_id(game_version, forge_version);
    game_dir
        .join("versions")
        .join(&version_id)
        .join(format!("{}.json", version_id))
        .exists()
}

/// List all installed Forge versions in the game directory.
pub async fn list_installed_forge_versions(
    game_dir: &Path,
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
    fn test_detect_forge_era() {
        assert_eq!(detect_forge_era("1.7.10"), ForgeEra::Legacy);
        assert_eq!(detect_forge_era("1.12.2"), ForgeEra::Legacy);
        assert_eq!(detect_forge_era("1.13"), ForgeEra::Transitional);
        assert_eq!(detect_forge_era("1.16.5"), ForgeEra::Transitional);
        assert_eq!(detect_forge_era("1.17"), ForgeEra::Modern);
        assert_eq!(detect_forge_era("1.20.4"), ForgeEra::Modern);
        assert_eq!(detect_forge_era("1.21"), ForgeEra::Modern);
    }
}

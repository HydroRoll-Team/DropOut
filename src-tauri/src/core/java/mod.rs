use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub mod cache;
pub mod detection;
pub mod error;
pub mod install;
pub mod persistence;
pub mod priority;
pub mod provider;
pub mod providers;
pub mod validation;

pub use cache::{load_cached_catalog_result, save_catalog_cache};
pub use error::JavaError;
use ts_rs::TS;

/// Remove the UNC prefix (\\?\) from Windows paths
pub fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let s = path.to_string_lossy().to_string();
        if s.starts_with(r"\\?\\") {
            return PathBuf::from(&s[4..]);
        }
    }
    path
}

use crate::core::downloader::{DownloadQueue, PendingJavaDownload};
use provider::JavaProvider;

pub async fn fetch_java_catalog_with<P: JavaProvider>(
    provider: &P,
    app_handle: &AppHandle,
    force_refresh: bool,
) -> Result<JavaCatalog, JavaError> {
    provider.fetch_catalog(app_handle, force_refresh).await
}

pub async fn fetch_java_release_with<P: JavaProvider>(
    provider: &P,
    major_version: u32,
    image_type: ImageType,
) -> Result<JavaDownloadInfo, JavaError> {
    provider.fetch_release(major_version, image_type).await
}

pub async fn fetch_available_versions_with<P: JavaProvider>(
    provider: &P,
) -> Result<Vec<u32>, JavaError> {
    provider.available_versions().await
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/index.ts"
)]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub arch: String,
    pub vendor: String,
    pub source: String,
    pub is_64bit: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/index.ts"
)]
pub enum ImageType {
    Jre,
    Jdk,
}

impl Default for ImageType {
    fn default() -> Self {
        Self::Jre
    }
}

impl std::fmt::Display for ImageType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Jre => write!(f, "jre"),
            Self::Jdk => write!(f, "jdk"),
        }
    }
}

impl ImageType {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "jre" => Some(Self::Jre),
            "jdk" => Some(Self::Jdk),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/index.ts"
)]
pub struct JavaReleaseInfo {
    pub major_version: u32,
    pub image_type: ImageType,
    pub version: String,
    pub release_name: String,
    pub release_date: Option<String>,
    pub file_size: u64,
    pub checksum: Option<String>,
    pub download_url: String,
    pub is_lts: bool,
    pub is_available: bool,
    pub architecture: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/index.ts"
)]
pub struct JavaCatalog {
    pub releases: Vec<JavaReleaseInfo>,
    pub available_major_versions: Vec<u32>,
    pub lts_versions: Vec<u32>,
    pub cached_at: u64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/index.ts"
)]
pub struct JavaDownloadInfo {
    pub version: String,          // e.g., "17.0.2+8"
    pub release_name: String,     // e.g., "jdk-17.0.2+8"
    pub download_url: String,     // Direct download URL
    pub file_name: String,        // e.g., "OpenJDK17U-jre_x64_linux_hotspot_17.0.2_8.tar.gz"
    pub file_size: u64,           // in bytes
    pub checksum: Option<String>, // SHA256 checksum
    pub image_type: ImageType,
}

pub fn get_java_install_dir(app_handle: &AppHandle) -> PathBuf {
    app_handle.path().app_data_dir().unwrap().join("java")
}

pub async fn detect_java_installations() -> Vec<JavaInstallation> {
    let mut installations = Vec::new();
    let candidates = detection::get_java_candidates();

    for candidate in candidates {
        if let Some(java) = validation::check_java_installation(&candidate).await {
            if !installations
                .iter()
                .any(|j: &JavaInstallation| j.path == java.path)
            {
                installations.push(java);
            }
        }
    }

    installations.sort_by(|a, b| {
        let v_a = validation::parse_java_version(&a.version);
        let v_b = validation::parse_java_version(&b.version);
        v_b.cmp(&v_a)
    });

    installations
}

pub async fn get_recommended_java(required_major_version: Option<u64>) -> Option<JavaInstallation> {
    let installations = detect_java_installations().await;

    if let Some(required) = required_major_version {
        installations.into_iter().find(|java| {
            let major = validation::parse_java_version(&java.version);
            major >= required as u32
        })
    } else {
        installations.into_iter().next()
    }
}

pub async fn get_compatible_java(
    app_handle: &AppHandle,
    required_major_version: Option<u64>,
    max_major_version: Option<u32>,
) -> Option<JavaInstallation> {
    let installations = detect_all_java_installations(app_handle).await;

    installations.into_iter().find(|java| {
        let major = validation::parse_java_version(&java.version);
        validation::is_version_compatible(major, required_major_version, max_major_version)
    })
}

pub async fn is_java_compatible(
    java_path: &str,
    required_major_version: Option<u64>,
    max_major_version: Option<u32>,
) -> bool {
    let java_path_buf = PathBuf::from(java_path);
    if let Some(java) = validation::check_java_installation(&java_path_buf).await {
        let major = validation::parse_java_version(&java.version);
        validation::is_version_compatible(major, required_major_version, max_major_version)
    } else {
        false
    }
}

pub async fn detect_all_java_installations(app_handle: &AppHandle) -> Vec<JavaInstallation> {
    let mut installations = detect_java_installations().await;

    let dropout_java_dir = get_java_install_dir(app_handle);
    if dropout_java_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&dropout_java_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let java_bin = find_java_executable(&path);
                    if let Some(java_path) = java_bin {
                        if let Some(java) = validation::check_java_installation(&java_path).await {
                            if !installations.iter().any(|j| j.path == java.path) {
                                installations.push(java);
                            }
                        }
                    }
                }
            }
        }
    }

    installations.sort_by(|a, b| {
        let v_a = validation::parse_java_version(&a.version);
        let v_b = validation::parse_java_version(&b.version);
        v_b.cmp(&v_a)
    });

    installations
}

fn find_java_executable(dir: &PathBuf) -> Option<PathBuf> {
    let bin_name = if cfg!(windows) { "java.exe" } else { "java" };

    let direct_bin = dir.join("bin").join(bin_name);
    if direct_bin.exists() {
        let resolved = std::fs::canonicalize(&direct_bin).unwrap_or(direct_bin);
        return Some(strip_unc_prefix(resolved));
    }

    #[cfg(target_os = "macos")]
    {
        let macos_bin = dir.join("Contents").join("Home").join("bin").join(bin_name);
        if macos_bin.exists() {
            return Some(macos_bin);
        }
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let nested_bin = path.join("bin").join(bin_name);
                if nested_bin.exists() {
                    let resolved = std::fs::canonicalize(&nested_bin).unwrap_or(nested_bin);
                    return Some(strip_unc_prefix(resolved));
                }

                #[cfg(target_os = "macos")]
                {
                    let macos_nested = path
                        .join("Contents")
                        .join("Home")
                        .join("bin")
                        .join(bin_name);
                    if macos_nested.exists() {
                        return Some(macos_nested);
                    }
                }
            }
        }
    }

    None
}

pub async fn resume_pending_downloads_with<P: JavaProvider>(
    provider: &P,
    app_handle: &AppHandle,
) -> Result<Vec<JavaInstallation>, String> {
    let queue = DownloadQueue::load(app_handle);
    let mut installed = Vec::new();

    for pending in queue.pending_downloads.iter() {
        let image_type = ImageType::parse(&pending.image_type).unwrap_or_else(|| {
            eprintln!(
                "Unknown image type '{}' in pending download, defaulting to jre",
                pending.image_type
            );
            ImageType::Jre
        });

        match install::download_and_install_java_with_provider(
            provider,
            app_handle,
            pending.major_version,
            image_type,
            Some(PathBuf::from(&pending.install_path)),
        )
        .await
        {
            Ok(installation) => {
                installed.push(installation);
            }
            Err(e) => {
                eprintln!(
                    "Failed to resume Java {} {} download: {}",
                    pending.major_version, pending.image_type, e
                );
            }
        }
    }

    Ok(installed)
}

pub fn cancel_current_download() {
    crate::core::downloader::cancel_java_download();
}

pub fn get_pending_downloads(app_handle: &AppHandle) -> Vec<PendingJavaDownload> {
    let queue = DownloadQueue::load(app_handle);
    queue.pending_downloads
}

#[allow(dead_code)]
pub fn clear_pending_download(
    app_handle: &AppHandle,
    major_version: u32,
    image_type: &str,
) -> Result<(), String> {
    let mut queue = DownloadQueue::load(app_handle);
    queue.remove(major_version, image_type);
    queue.save(app_handle)
}

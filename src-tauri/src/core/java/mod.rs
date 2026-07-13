use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

pub mod detection;
pub mod error;
pub mod persistence;
pub mod priority;
pub mod provider;
pub mod providers;
pub mod validation;

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

use crate::core::downloader::{DownloadQueue, JavaDownloadProgress, PendingJavaDownload};
use crate::utils::zip;
use provider::JavaProvider;
use providers::AdoptiumProvider;

const CACHE_DURATION_SECS: u64 = 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "java/core.ts")]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub arch: String,
    pub vendor: String,
    pub source: String,
    pub is_64bit: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "java/core.ts")]
#[serde(rename_all = "camelCase")]
pub struct JavaReleaseInfo {
    pub major_version: u32,
    pub image_type: String,
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
#[ts(export, export_to = "java/core.ts")]
#[serde(rename_all = "camelCase")]
pub struct JavaCatalog {
    pub releases: Vec<JavaReleaseInfo>,
    pub available_major_versions: Vec<u32>,
    pub lts_versions: Vec<u32>,
    pub cached_at: u64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "java/core.ts")]
pub struct JavaDownloadInfo {
    pub version: String,          // e.g., "17.0.2+8"
    pub release_name: String,     // e.g., "jdk-17.0.2+8"
    pub download_url: String,     // Direct download URL
    pub file_name: String,        // e.g., "OpenJDK17U-jre_x64_linux_hotspot_17.0.2_8.tar.gz"
    pub file_size: u64,           // in bytes
    pub checksum: Option<String>, // SHA256 checksum
    pub image_type: String,       // "jre" or "jdk"
}

pub fn get_java_install_dir(app_handle: &AppHandle) -> PathBuf {
    app_handle.path().app_data_dir().unwrap().join("java")
}

fn get_catalog_cache_path(app_handle: &AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap()
        .join("java_catalog_cache.json")
}

pub fn load_cached_catalog(app_handle: &AppHandle) -> Option<JavaCatalog> {
    let cache_path = get_catalog_cache_path(app_handle);
    if !cache_path.exists() {
        return None;
    }

    // Read cache file
    let content = std::fs::read_to_string(&cache_path).ok()?;
    let catalog: JavaCatalog = serde_json::from_str(&content).ok()?;

    // Get current time in seconds since UNIX_EPOCH
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Check if cache is still valid
    if now - catalog.cached_at < CACHE_DURATION_SECS {
        Some(catalog)
    } else {
        None
    }
}

pub fn save_catalog_cache(app_handle: &AppHandle, catalog: &JavaCatalog) -> Result<(), String> {
    let cache_path = get_catalog_cache_path(app_handle);
    let content = serde_json::to_string_pretty(catalog).map_err(|e| e.to_string())?;
    std::fs::write(&cache_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[allow(dead_code)]
pub fn clear_catalog_cache(app_handle: &AppHandle) -> Result<(), String> {
    let cache_path = get_catalog_cache_path(app_handle);
    if cache_path.exists() {
        std::fs::remove_file(&cache_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub async fn fetch_java_catalog(
    app_handle: &AppHandle,
    force_refresh: bool,
) -> Result<JavaCatalog, String> {
    let provider = AdoptiumProvider::new();
    provider
        .fetch_catalog(app_handle, force_refresh)
        .await
        .map_err(|e| e.to_string())
}

pub async fn fetch_java_release(
    major_version: u32,
    image_type: ImageType,
) -> Result<JavaDownloadInfo, String> {
    let provider = AdoptiumProvider::new();
    provider
        .fetch_release(major_version, image_type)
        .await
        .map_err(|e| e.to_string())
}

pub async fn fetch_available_versions() -> Result<Vec<u32>, String> {
    let provider = AdoptiumProvider::new();
    provider
        .available_versions()
        .await
        .map_err(|e| e.to_string())
}

pub async fn download_and_install_java(
    app_handle: &AppHandle,
    major_version: u32,
    image_type: ImageType,
    custom_path: Option<PathBuf>,
) -> Result<JavaInstallation, String> {
    let provider = AdoptiumProvider::new();
    let info = provider.fetch_release(major_version, image_type).await?;
    let file_name = info.file_name.clone();

    let install_base = custom_path.unwrap_or_else(|| get_java_install_dir(app_handle));
    let version_dir = install_base.join(format!(
        "{}-{}-{}",
        provider.install_prefix(),
        major_version,
        image_type
    ));

    std::fs::create_dir_all(&install_base)
        .map_err(|e| format!("Failed to create installation directory: {}", e))?;

    let mut queue = DownloadQueue::load(app_handle);
    queue.add(PendingJavaDownload {
        major_version,
        image_type: image_type.to_string(),
        download_url: info.download_url.clone(),
        file_name: info.file_name.clone(),
        file_size: info.file_size,
        checksum: info.checksum.clone(),
        install_path: install_base.to_string_lossy().to_string(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    });
    queue.save(app_handle)?;

    let archive_path = install_base.join(&info.file_name);

    let need_download = if archive_path.exists() {
        if let Some(expected_checksum) = &info.checksum {
            let data = std::fs::read(&archive_path)
                .map_err(|e| format!("Failed to read downloaded file: {}", e))?;
            !crate::core::downloader::verify_checksum(&data, Some(expected_checksum), None)
        } else {
            false
        }
    } else {
        true
    };

    if need_download {
        crate::core::downloader::download_with_resume(
            app_handle,
            &info.download_url,
            &archive_path,
            info.checksum.as_deref(),
            info.file_size,
        )
        .await?;
    }

    let _ = app_handle.emit(
        "java-download-progress",
        JavaDownloadProgress {
            file_name: file_name.clone(),
            downloaded_bytes: info.file_size,
            total_bytes: info.file_size,
            speed_bytes_per_sec: 0,
            eta_seconds: 0,
            status: "Extracting".to_string(),
            percentage: 100.0,
        },
    );

    if version_dir.exists() {
        std::fs::remove_dir_all(&version_dir)
            .map_err(|e| format!("Failed to remove old version directory: {}", e))?;
    }

    std::fs::create_dir_all(&version_dir)
        .map_err(|e| format!("Failed to create version directory: {}", e))?;

    let top_level_dir = if info.file_name.ends_with(".tar.gz") || info.file_name.ends_with(".tgz") {
        zip::extract_tar_gz(&archive_path, &version_dir)?
    } else if info.file_name.ends_with(".zip") {
        zip::extract_zip(&archive_path, &version_dir)?;
        find_top_level_dir(&version_dir)?
    } else {
        return Err(format!("Unsupported archive format: {}", info.file_name));
    };

    let _ = std::fs::remove_file(&archive_path);

    let java_home = version_dir.join(&top_level_dir);
    let java_bin = if cfg!(target_os = "macos") {
        java_home
            .join("Contents")
            .join("Home")
            .join("bin")
            .join("java")
    } else if cfg!(windows) {
        java_home.join("bin").join("java.exe")
    } else {
        java_home.join("bin").join("java")
    };

    if !java_bin.exists() {
        return Err(format!(
            "Installation completed but Java executable not found: {}",
            java_bin.display()
        ));
    }

    let java_bin = std::fs::canonicalize(&java_bin).map_err(|e| e.to_string())?;
    let java_bin = strip_unc_prefix(java_bin);

    let installation = validation::check_java_installation(&java_bin)
        .await
        .ok_or_else(|| "Failed to verify Java installation".to_string())?;

    queue.remove(major_version, &image_type.to_string());
    queue.save(app_handle)?;

    let _ = app_handle.emit(
        "java-download-progress",
        JavaDownloadProgress {
            file_name,
            downloaded_bytes: info.file_size,
            total_bytes: info.file_size,
            speed_bytes_per_sec: 0,
            eta_seconds: 0,
            status: "Completed".to_string(),
            percentage: 100.0,
        },
    );

    Ok(installation)
}

fn find_top_level_dir(extract_dir: &PathBuf) -> Result<String, String> {
    let entries: Vec<_> = std::fs::read_dir(extract_dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .collect();

    if entries.len() == 1 {
        Ok(entries[0].file_name().to_string_lossy().to_string())
    } else {
        Ok(String::new())
    }
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

pub async fn resume_pending_downloads(
    app_handle: &AppHandle,
) -> Result<Vec<JavaInstallation>, String> {
    let queue = DownloadQueue::load(app_handle);
    let mut installed = Vec::new();

    for pending in queue.pending_downloads.iter() {
        let image_type = if pending.image_type == "jdk" {
            ImageType::Jdk
        } else {
            ImageType::Jre
        };

        match download_and_install_java(
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

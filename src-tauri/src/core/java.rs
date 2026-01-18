use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

use crate::core::downloader::{self, DownloadQueue, JavaDownloadProgress, PendingJavaDownload};
use crate::utils::zip;

const ADOPTIUM_API_BASE: &str = "https://api.adoptium.net/v3";
const CACHE_DURATION_SECS: u64 = 24 * 60 * 60; // 24 hours

/// Helper to strip UNC prefix on Windows (\\?\)
fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let s = path.to_string_lossy().to_string();
        if s.starts_with(r"\\?\") {
            return PathBuf::from(&s[4..]);
        }
    }
    path
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub is_64bit: bool,
}

/// Java image type: JRE or JDK
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

/// Java release information for UI display
#[derive(Debug, Clone, Serialize, Deserialize)]
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

/// Java catalog containing all available versions
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JavaCatalog {
    pub releases: Vec<JavaReleaseInfo>,
    pub available_major_versions: Vec<u32>,
    pub lts_versions: Vec<u32>,
    pub cached_at: u64,
}

/// Adoptium `/v3/assets/latest/{version}/hotspot` API response structures
#[derive(Debug, Clone, Deserialize)]
pub struct AdoptiumAsset {
    pub binary: AdoptiumBinary,
    pub release_name: String,
    pub version: AdoptiumVersionData,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AdoptiumBinary {
    pub os: String,
    pub architecture: String,
    pub image_type: String,
    pub package: AdoptiumPackage,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdoptiumPackage {
    pub name: String,
    pub link: String,
    pub size: u64,
    pub checksum: Option<String>, // SHA256
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AdoptiumVersionData {
    pub major: u32,
    pub minor: u32,
    pub security: u32,
    pub semver: String,
    pub openjdk_version: String,
}

/// Adoptium available releases response
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AvailableReleases {
    pub available_releases: Vec<u32>,
    pub available_lts_releases: Vec<u32>,
    pub most_recent_lts: Option<u32>,
    pub most_recent_feature_release: Option<u32>,
}

/// Java download information from Adoptium
#[derive(Debug, Clone, Serialize)]
pub struct JavaDownloadInfo {
    pub version: String,
    pub release_name: String,
    pub download_url: String,
    pub file_name: String,
    pub file_size: u64,
    pub checksum: Option<String>,
    pub image_type: String,
}

/// Get the Adoptium OS name for the current platform
pub fn get_adoptium_os() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        // Check if Alpine Linux (musl libc)
        if std::path::Path::new("/etc/alpine-release").exists() {
            return "alpine-linux";
        }
        "linux"
    }
    #[cfg(target_os = "macos")]
    {
        "mac"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        "linux" // fallback
    }
}

/// Get the Adoptium Architecture name for the current architecture
pub fn get_adoptium_arch() -> &'static str {
    #[cfg(target_arch = "x86_64")]
    {
        "x64"
    }
    #[cfg(target_arch = "aarch64")]
    {
        "aarch64"
    }
    #[cfg(target_arch = "x86")]
    {
        "x86"
    }
    #[cfg(target_arch = "arm")]
    {
        "arm"
    }
    #[cfg(not(any(
        target_arch = "x86_64",
        target_arch = "aarch64",
        target_arch = "x86",
        target_arch = "arm"
    )))]
    {
        "x64" // fallback
    }
}

/// Get the default Java installation directory for DropOut
pub fn get_java_install_dir(app_handle: &AppHandle) -> PathBuf {
    app_handle.path().app_data_dir().unwrap().join("java")
}

/// Get the cache file path for Java catalog
fn get_catalog_cache_path(app_handle: &AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap()
        .join("java_catalog_cache.json")
}

/// Load cached Java catalog if not expired
pub fn load_cached_catalog(app_handle: &AppHandle) -> Option<JavaCatalog> {
    let cache_path = get_catalog_cache_path(app_handle);
    if !cache_path.exists() {
        return None;
    }

    let content = std::fs::read_to_string(&cache_path).ok()?;
    let catalog: JavaCatalog = serde_json::from_str(&content).ok()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    if now - catalog.cached_at < CACHE_DURATION_SECS {
        Some(catalog)
    } else {
        None
    }
}

/// Save Java catalog to cache
pub fn save_catalog_cache(app_handle: &AppHandle, catalog: &JavaCatalog) -> Result<(), String> {
    let cache_path = get_catalog_cache_path(app_handle);
    let content = serde_json::to_string_pretty(catalog).map_err(|e| e.to_string())?;
    std::fs::write(&cache_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Clear Java catalog cache
#[allow(dead_code)]
pub fn clear_catalog_cache(app_handle: &AppHandle) -> Result<(), String> {
    let cache_path = get_catalog_cache_path(app_handle);
    if cache_path.exists() {
        std::fs::remove_file(&cache_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Fetch complete Java catalog from Adoptium API with platform availability check
pub async fn fetch_java_catalog(
    app_handle: &AppHandle,
    force_refresh: bool,
) -> Result<JavaCatalog, String> {
    // Check cache first unless force refresh
    if !force_refresh {
        if let Some(cached) = load_cached_catalog(app_handle) {
            return Ok(cached);
        }
    }

    let os = get_adoptium_os();
    let arch = get_adoptium_arch();
    let client = reqwest::Client::new();

    // 1. Fetch available releases
    let releases_url = format!("{}/info/available_releases", ADOPTIUM_API_BASE);
    let available: AvailableReleases = client
        .get(&releases_url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch available releases: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse available releases: {}", e))?;

    let mut releases = Vec::new();

    // 2. Fetch details for each major version
    for major_version in &available.available_releases {
        for image_type in &["jre", "jdk"] {
            let url = format!(
                "{}/assets/latest/{}/hotspot?os={}&architecture={}&image_type={}",
                ADOPTIUM_API_BASE, major_version, os, arch, image_type
            );

            match client
                .get(&url)
                .header("Accept", "application/json")
                .send()
                .await
            {
                Ok(response) => {
                    if response.status().is_success() {
                        if let Ok(assets) = response.json::<Vec<AdoptiumAsset>>().await {
                            if let Some(asset) = assets.into_iter().next() {
                                let release_date = asset.binary.updated_at.clone();
                                releases.push(JavaReleaseInfo {
                                    major_version: *major_version,
                                    image_type: image_type.to_string(),
                                    version: asset.version.semver.clone(),
                                    release_name: asset.release_name.clone(),
                                    release_date,
                                    file_size: asset.binary.package.size,
                                    checksum: asset.binary.package.checksum,
                                    download_url: asset.binary.package.link,
                                    is_lts: available
                                        .available_lts_releases
                                        .contains(major_version),
                                    is_available: true,
                                    architecture: asset.binary.architecture.clone(),
                                });
                            }
                        }
                    } else {
                        // Platform not available for this version/type
                        releases.push(JavaReleaseInfo {
                            major_version: *major_version,
                            image_type: image_type.to_string(),
                            version: format!("{}.x", major_version),
                            release_name: format!("jdk-{}", major_version),
                            release_date: None,
                            file_size: 0,
                            checksum: None,
                            download_url: String::new(),
                            is_lts: available.available_lts_releases.contains(major_version),
                            is_available: false,
                            architecture: arch.to_string(),
                        });
                    }
                }
                Err(_) => {
                    // Network error, mark as unavailable
                    releases.push(JavaReleaseInfo {
                        major_version: *major_version,
                        image_type: image_type.to_string(),
                        version: format!("{}.x", major_version),
                        release_name: format!("jdk-{}", major_version),
                        release_date: None,
                        file_size: 0,
                        checksum: None,
                        download_url: String::new(),
                        is_lts: available.available_lts_releases.contains(major_version),
                        is_available: false,
                        architecture: arch.to_string(),
                    });
                }
            }
        }
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let catalog = JavaCatalog {
        releases,
        available_major_versions: available.available_releases,
        lts_versions: available.available_lts_releases,
        cached_at: now,
    };

    // Save to cache
    let _ = save_catalog_cache(app_handle, &catalog);

    Ok(catalog)
}

/// Get Adoptium API download info for a specific Java version and image type
///
/// # Arguments
/// * `major_version` - Java major version (e.g., 8, 11, 17)
/// * `image_type` - JRE or JDK
///
/// # Returns
/// * `Ok(JavaDownloadInfo)` - Download information
/// * `Err(String)` - Error message
pub async fn fetch_java_release(
    major_version: u32,
    image_type: ImageType,
) -> Result<JavaDownloadInfo, String> {
    let os = get_adoptium_os();
    let arch = get_adoptium_arch();

    let url = format!(
        "{}/assets/latest/{}/hotspot?os={}&architecture={}&image_type={}",
        ADOPTIUM_API_BASE, major_version, os, arch, image_type
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Adoptium API returned error: {} - The version/platform might be unavailable",
            response.status()
        ));
    }

    let assets: Vec<AdoptiumAsset> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let asset = assets
        .into_iter()
        .next()
        .ok_or_else(|| format!("Java {} {} download not found", major_version, image_type))?;

    Ok(JavaDownloadInfo {
        version: asset.version.semver.clone(),
        release_name: asset.release_name,
        download_url: asset.binary.package.link,
        file_name: asset.binary.package.name,
        file_size: asset.binary.package.size,
        checksum: asset.binary.package.checksum,
        image_type: asset.binary.image_type,
    })
}

/// Fetch available Java versions from Adoptium API
pub async fn fetch_available_versions() -> Result<Vec<u32>, String> {
    let url = format!("{}/info/available_releases", ADOPTIUM_API_BASE);

    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    #[derive(Deserialize)]
    struct AvailableReleases {
        available_releases: Vec<u32>,
    }

    let releases: AvailableReleases = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(releases.available_releases)
}

/// Download and install Java with resume support and progress events
///
/// # Arguments
/// * `app_handle` - Tauri app handle for accessing app directories
/// * `major_version` - Java major version (e.g., 8, 11, 17)
/// * `image_type` - JRE or JDK
/// * `custom_path` - Optional custom installation path
///
/// # Returns
/// * `Ok(JavaInstallation)` - Information about the successfully installed Java
pub async fn download_and_install_java(
    app_handle: &AppHandle,
    major_version: u32,
    image_type: ImageType,
    custom_path: Option<PathBuf>,
) -> Result<JavaInstallation, String> {
    // 1. Fetch download information
    let info = fetch_java_release(major_version, image_type).await?;
    let file_name = info.file_name.clone();

    // 2. Prepare installation directory
    let install_base = custom_path.unwrap_or_else(|| get_java_install_dir(app_handle));
    let version_dir = install_base.join(format!("temurin-{}-{}", major_version, image_type));

    std::fs::create_dir_all(&install_base)
        .map_err(|e| format!("Failed to create installation directory: {}", e))?;

    // 3. Add to download queue for persistence
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

    // 4. Download the archive with resume support
    let archive_path = install_base.join(&info.file_name);

    // Check if we need to download
    let need_download = if archive_path.exists() {
        if let Some(expected_checksum) = &info.checksum {
            let data = std::fs::read(&archive_path)
                .map_err(|e| format!("Failed to read downloaded file: {}", e))?;
            !downloader::verify_checksum(&data, Some(expected_checksum), None)
        } else {
            false
        }
    } else {
        true
    };

    if need_download {
        // Use resumable download
        downloader::download_with_resume(
            app_handle,
            &info.download_url,
            &archive_path,
            info.checksum.as_deref(),
            info.file_size,
        )
        .await?;
    }

    // 5. Emit extracting status
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

    // 6. Extract
    // If the target directory exists, remove it first
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
        // Find the top-level directory inside the extracted folder
        find_top_level_dir(&version_dir)?
    } else {
        return Err(format!("Unsupported archive format: {}", info.file_name));
    };

    // 7. Clean up downloaded archive
    let _ = std::fs::remove_file(&archive_path);

    // 8. Locate java executable
    // macOS has a different structure: jdk-xxx/Contents/Home/bin/java
    // Linux/Windows: jdk-xxx/bin/java
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

    // Resolve symlinks and strip UNC prefix to ensure clean path
    let java_bin = std::fs::canonicalize(&java_bin).map_err(|e| e.to_string())?;
    let java_bin = strip_unc_prefix(java_bin);

    // 9. Verify installation
    let installation = check_java_installation(&java_bin)
        .ok_or_else(|| "Failed to verify Java installation".to_string())?;

    // 10. Remove from download queue
    queue.remove(major_version, &image_type.to_string());
    queue.save(app_handle)?;

    // 11. Emit completed status
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

/// Find the top-level directory inside the extracted folder
fn find_top_level_dir(extract_dir: &PathBuf) -> Result<String, String> {
    let entries: Vec<_> = std::fs::read_dir(extract_dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .collect();

    if entries.len() == 1 {
        Ok(entries[0].file_name().to_string_lossy().to_string())
    } else {
        // No single top-level directory, return empty string
        Ok(String::new())
    }
}

/// Detect Java installations on the system
pub fn detect_java_installations() -> Vec<JavaInstallation> {
    let mut installations = Vec::new();
    let candidates = get_java_candidates();

    for candidate in candidates {
        if let Some(java) = check_java_installation(&candidate) {
            // Avoid duplicates
            if !installations
                .iter()
                .any(|j: &JavaInstallation| j.path == java.path)
            {
                installations.push(java);
            }
        }
    }

    // Sort by version (newer first)
    installations.sort_by(|a, b| {
        let v_a = parse_java_version(&a.version);
        let v_b = parse_java_version(&b.version);
        v_b.cmp(&v_a)
    });

    installations
}

/// Get list of candidate Java paths to check
fn get_java_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // Check PATH first
    let mut cmd = Command::new(if cfg!(windows) { "where" } else { "which" });
    cmd.arg("java");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let paths = String::from_utf8_lossy(&output.stdout);
            for line in paths.lines() {
                let path = PathBuf::from(line.trim());
                if path.exists() {
                    // Resolve symlinks (important for Windows javapath wrapper)
                    let resolved = std::fs::canonicalize(&path).unwrap_or(path);
                    // Strip UNC prefix if present to keep paths clean
                    let final_path = strip_unc_prefix(resolved);
                    candidates.push(final_path);
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Common Linux Java paths
        let linux_paths = [
            "/usr/lib/jvm",
            "/usr/java",
            "/opt/java",
            "/opt/jdk",
            "/opt/openjdk",
        ];

        for base in &linux_paths {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    let java_path = entry.path().join("bin/java");
                    if java_path.exists() {
                        candidates.push(java_path);
                    }
                }
            }
        }

        // Flatpak / Snap locations
        let home = std::env::var("HOME").unwrap_or_default();
        let snap_java = PathBuf::from(&home).join(".sdkman/candidates/java");
        if snap_java.exists() {
            if let Ok(entries) = std::fs::read_dir(&snap_java) {
                for entry in entries.flatten() {
                    let java_path = entry.path().join("bin/java");
                    if java_path.exists() {
                        candidates.push(java_path);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS Java paths
        let mac_paths = [
            "/Library/Java/JavaVirtualMachines",
            "/System/Library/Java/JavaVirtualMachines",
            "/usr/local/opt/openjdk/bin/java",
            "/opt/homebrew/opt/openjdk/bin/java",
        ];

        for path in &mac_paths {
            let p = PathBuf::from(path);
            if p.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&p) {
                    for entry in entries.flatten() {
                        let java_path = entry.path().join("Contents/Home/bin/java");
                        if java_path.exists() {
                            candidates.push(java_path);
                        }
                    }
                }
            } else if p.exists() {
                candidates.push(p);
            }
        }

        // Homebrew ARM64
        let homebrew_arm = PathBuf::from("/opt/homebrew/Cellar/openjdk");
        if homebrew_arm.exists() {
            if let Ok(entries) = std::fs::read_dir(&homebrew_arm) {
                for entry in entries.flatten() {
                    let java_path = entry
                        .path()
                        .join("libexec/openjdk.jdk/Contents/Home/bin/java");
                    if java_path.exists() {
                        candidates.push(java_path);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Windows Java paths
        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)")
            .unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

        let win_paths = [
            format!("{}\\Java", program_files),
            format!("{}\\Java", program_files_x86),
            format!("{}\\Eclipse Adoptium", program_files),
            format!("{}\\AdoptOpenJDK", program_files),
            format!("{}\\Microsoft\\jdk", program_files),
            format!("{}\\Zulu", program_files),
            format!("{}\\Amazon Corretto", program_files),
            format!("{}\\BellSoft\\LibericaJDK", program_files),
            format!("{}\\Programs\\Eclipse Adoptium", local_app_data),
        ];

        for base in &win_paths {
            let base_path = PathBuf::from(base);
            if base_path.exists() {
                if let Ok(entries) = std::fs::read_dir(&base_path) {
                    for entry in entries.flatten() {
                        let java_path = entry.path().join("bin\\java.exe");
                        if java_path.exists() {
                            candidates.push(java_path);
                        }
                    }
                }
            }
        }

        // Also check JAVA_HOME
        if let Ok(java_home) = std::env::var("JAVA_HOME") {
            let java_path = PathBuf::from(&java_home).join("bin\\java.exe");
            if java_path.exists() {
                candidates.push(java_path);
            }
        }
    }

    // JAVA_HOME environment variable (cross-platform)
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let bin_name = if cfg!(windows) { "java.exe" } else { "java" };
        let java_path = PathBuf::from(&java_home).join("bin").join(bin_name);
        if java_path.exists() {
            candidates.push(java_path);
        }
    }

    candidates
}

/// Check a specific Java installation and get its version info
fn check_java_installation(path: &PathBuf) -> Option<JavaInstallation> {
    let mut cmd = Command::new(path);
    cmd.arg("-version");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().ok()?;

    // Java outputs version info to stderr
    let version_output = String::from_utf8_lossy(&output.stderr);

    // Parse version string (e.g., "openjdk version \"17.0.1\"" or "java version \"1.8.0_301\"")
    let version = parse_version_string(&version_output)?;
    let is_64bit = version_output.contains("64-Bit");

    Some(JavaInstallation {
        path: path.to_string_lossy().to_string(),
        version,
        is_64bit,
    })
}

/// Parse version string from java -version output
fn parse_version_string(output: &str) -> Option<String> {
    for line in output.lines() {
        if line.contains("version") {
            // Find the quoted version string
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start + 1..].find('"') {
                    return Some(line[start + 1..start + 1 + end].to_string());
                }
            }
        }
    }
    None
}

/// Parse version for comparison (returns major version number)
fn parse_java_version(version: &str) -> u32 {
    // Handle various formats:
    // - Old format: 1.8.0_xxx (Java 8 with update)
    // - New format: 17.0.1, 11.0.5+10 (Java 11+)
    // - Format with build: 21.0.3+13-Ubuntu-0ubuntu0.24.04.1
    // - Format with underscores: 1.8.0_411
    
    // First, strip build metadata (everything after '+')
    let version_only = version.split('+').next().unwrap_or(version);
    
    // Remove trailing junk (like "-Ubuntu-0ubuntu0.24.04.1")
    let version_only = version_only
        .split('-')
        .next()
        .unwrap_or(version_only);
    
    // Replace underscores with dots (1.8.0_411 -> 1.8.0.411)
    let normalized = version_only.replace('_', ".");
    
    // Split by dots
    let parts: Vec<&str> = normalized.split('.').collect();
    
    if let Some(first) = parts.first() {
        if *first == "1" {
            // Old format: 1.8.0 -> major is 8
            parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0)
        } else {
            // New format: 17.0.1 -> major is 17
            first.parse().unwrap_or(0)
        }
    } else {
        0
    }
}

/// Get the best Java for a specific Minecraft version
pub fn get_recommended_java(required_major_version: Option<u64>) -> Option<JavaInstallation> {
    let installations = detect_java_installations();

    if let Some(required) = required_major_version {
        // Find exact match or higher
        installations.into_iter().find(|java| {
            let major = parse_java_version(&java.version);
            major >= required as u32
        })
    } else {
        // Return newest
        installations.into_iter().next()
    }
}

/// Get compatible Java for a specific Minecraft version with upper bound
/// For older Minecraft versions (1.13.x and below), we need Java 8 specifically
/// as newer Java versions have compatibility issues with old Forge versions
pub fn get_compatible_java(
    app_handle: &AppHandle,
    required_major_version: Option<u64>,
    max_major_version: Option<u32>,
) -> Option<JavaInstallation> {
    let installations = detect_all_java_installations(app_handle);

    if let Some(max_version) = max_major_version {
        // Find Java version within the acceptable range
        installations.into_iter().find(|java| {
            let major = parse_java_version(&java.version);
            let meets_min = if let Some(required) = required_major_version {
                major >= required as u32
            } else {
                true
            };
            meets_min && major <= max_version
        })
    } else if let Some(required) = required_major_version {
        // Find exact match or higher (no upper bound)
        installations.into_iter().find(|java| {
            let major = parse_java_version(&java.version);
            major >= required as u32
        })
    } else {
        // Return newest
        installations.into_iter().next()
    }
}

/// Check if a Java installation is compatible with the required version range
pub fn is_java_compatible(
    java_path: &str,
    required_major_version: Option<u64>,
    max_major_version: Option<u32>,
) -> bool {
    let java_path_buf = PathBuf::from(java_path);
    if let Some(java) = check_java_installation(&java_path_buf) {
        let major = parse_java_version(&java.version);
        let meets_min = if let Some(required) = required_major_version {
            major >= required as u32
        } else {
            true
        };
        let meets_max = if let Some(max_version) = max_major_version {
            major <= max_version
        } else {
            true
        };
        meets_min && meets_max
    } else {
        false
    }
}

/// Detect all installed Java versions (including system installations and DropOut downloads)
pub fn detect_all_java_installations(app_handle: &AppHandle) -> Vec<JavaInstallation> {
    let mut installations = detect_java_installations();

    // Add DropOut downloaded Java versions
    let dropout_java_dir = get_java_install_dir(app_handle);
    if dropout_java_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&dropout_java_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    // Find the java executable in this directory
                    let java_bin = find_java_executable(&path);
                    if let Some(java_path) = java_bin {
                        if let Some(java) = check_java_installation(&java_path) {
                            if !installations.iter().any(|j| j.path == java.path) {
                                installations.push(java);
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by version
    installations.sort_by(|a, b| {
        let v_a = parse_java_version(&a.version);
        let v_b = parse_java_version(&b.version);
        v_b.cmp(&v_a)
    });

    installations
}

/// Find the java executable in a directory using a limited-depth search
fn find_java_executable(dir: &PathBuf) -> Option<PathBuf> {
    let bin_name = if cfg!(windows) { "java.exe" } else { "java" };

    // Directly look in the bin directory
    let direct_bin = dir.join("bin").join(bin_name);
    if direct_bin.exists() {
        let resolved = std::fs::canonicalize(&direct_bin).unwrap_or(direct_bin);
        return Some(strip_unc_prefix(resolved));
    }

    // macOS: Contents/Home/bin/java
    #[cfg(target_os = "macos")]
    {
        let macos_bin = dir.join("Contents").join("Home").join("bin").join(bin_name);
        if macos_bin.exists() {
            return Some(macos_bin);
        }
    }

    // Look in subdirectories (handle nested directories after Adoptium extraction)
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Try direct bin path
                let nested_bin = path.join("bin").join(bin_name);
                if nested_bin.exists() {
                    let resolved = std::fs::canonicalize(&nested_bin).unwrap_or(nested_bin);
                    return Some(strip_unc_prefix(resolved));
                }

                // macOS: nested/Contents/Home/bin/java
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

/// Resume pending Java downloads from queue
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

        // Try to resume the download
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

/// Cancel current Java download
pub fn cancel_current_download() {
    downloader::cancel_java_download();
}

/// Get pending downloads from queue
pub fn get_pending_downloads(app_handle: &AppHandle) -> Vec<PendingJavaDownload> {
    let queue = DownloadQueue::load(app_handle);
    queue.pending_downloads
}

/// Clear a specific pending download
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

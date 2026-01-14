use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

use crate::core::downloader;
use crate::utils::zip;

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

/// Adoptium `/v3/assets/latest/{version}/hotspot` API response structures
#[derive(Debug, Clone, Deserialize)]
pub struct AdoptiumAsset {
    pub binary: AdoptiumBinary,
    pub release_name: String,
    pub version: AdoptiumVersionData,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdoptiumBinary {
    pub os: String,
    pub architecture: String,
    pub image_type: String,
    pub package: AdoptiumPackage,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdoptiumPackage {
    pub name: String,
    pub link: String,
    pub size: u64,
    pub checksum: Option<String>, // SHA256
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdoptiumVersionData {
    pub major: u32,
    pub minor: u32,
    pub security: u32,
    pub semver: String,
    pub openjdk_version: String,
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
pub fn get_java_install_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".dropout")
        .join("java")
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
        "https://api.adoptium.net/v3/assets/latest/{}/hotspot?os={}&architecture={}&image_type={}",
        major_version, os, arch, image_type
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
    let url = "https://api.adoptium.net/v3/info/available_releases";

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

/// Download and install Java
///
/// # Arguments
/// * `major_version` - Java major version (e.g., 8, 11, 17)
/// * `image_type` - JRE or JDK
/// * `custom_path` - Optional custom installation path
///
/// # Returns
/// * `Ok(JavaInstallation)` - Information about the successfully installed Java
pub async fn download_and_install_java(
    major_version: u32,
    image_type: ImageType,
    custom_path: Option<PathBuf>,
) -> Result<JavaInstallation, String> {
    // 1. Fetch download information
    let info = fetch_java_release(major_version, image_type).await?;

    // 2. Prepare installation directory
    let install_base = custom_path.unwrap_or_else(get_java_install_dir);
    let version_dir = install_base.join(format!("temurin-{}-{}", major_version, image_type));

    std::fs::create_dir_all(&install_base)
        .map_err(|e| format!("Failed to create installation directory: {}", e))?;

    // 3. Download the archive
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
        let client = reqwest::Client::new();
        let response = client
            .get(&info.download_url)
            .send()
            .await
            .map_err(|e| format!("Download failed: {}", e))?;

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read download content: {}", e))?;

        // Verify downloaded file checksum
        if let Some(expected) = &info.checksum {
            if !downloader::verify_checksum(&bytes, Some(expected), None) {
                return Err("Downloaded file verification failed, the file may be corrupted".to_string());
            }
        }

        std::fs::write(&archive_path, &bytes)
            .map_err(|e| format!("Failed to save downloaded file: {}", e))?;
    }

    // 4. Extract
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

    // 5. Clean up downloaded archive
    let _ = std::fs::remove_file(&archive_path);

    // 6. Locate java executable
    // macOS has a different structure: jdk-xxx/Contents/Home/bin/java
    // Linux/Windows: jdk-xxx/bin/java
    let java_home = version_dir.join(&top_level_dir);
    let java_bin = if cfg!(target_os = "macos") {
        java_home.join("Contents").join("Home").join("bin").join("java")
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

    // 7. Verify installation
    let installation = check_java_installation(&java_bin)
        .ok_or_else(|| "Fail to verify Java installation".to_string())?;

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
            if !installations.iter().any(|j: &JavaInstallation| j.path == java.path) {
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
    if let Ok(output) = Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg("java")
        .output()
    {
        if output.status.success() {
            let paths = String::from_utf8_lossy(&output.stdout);
            for line in paths.lines() {
                let path = PathBuf::from(line.trim());
                if path.exists() {
                    candidates.push(path);
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
                    let java_path = entry.path().join("libexec/openjdk.jdk/Contents/Home/bin/java");
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
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());
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
    let output = Command::new(path)
        .arg("-version")
        .output()
        .ok()?;

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
    // Handle both old format (1.8.0_xxx) and new format (11.0.x, 17.0.x)
    let parts: Vec<&str> = version.split('.').collect();
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

/// Detect all installed Java versions (including system installations and DropOut downloads)
pub fn detect_all_java_installations() -> Vec<JavaInstallation> {
    let mut installations = detect_java_installations();

    // Add DropOut downloaded Java versions
    let dropout_java_dir = get_java_install_dir();
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

/// Recursively find the java executable in a directory
fn find_java_executable(dir: &PathBuf) -> Option<PathBuf> {
    let bin_name = if cfg!(windows) { "java.exe" } else { "java" };

    // Directly look in the bin directory
    let direct_bin = dir.join("bin").join(bin_name);
    if direct_bin.exists() {
        return Some(direct_bin);
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
                    return Some(nested_bin);
                }

                // macOS: nested/Contents/Home/bin/java
                #[cfg(target_os = "macos")]
                {
                    let macos_nested = path.join("Contents").join("Home").join("bin").join(bin_name);
                    if macos_nested.exists() {
                        return Some(macos_nested);
                    }
                }
            }
        }
    }

    None
}

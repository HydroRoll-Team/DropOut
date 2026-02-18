use crate::core::java::error::JavaError;
use crate::core::java::provider::JavaProvider;
use crate::core::java::save_catalog_cache;
use crate::core::java::{ImageType, JavaCatalog, JavaDownloadInfo, JavaReleaseInfo};
use serde::Deserialize;
use tauri::AppHandle;
use ts_rs::TS;

const ADOPTIUM_API_BASE: &str = "https://api.adoptium.net/v3";

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "java/providers/adoptium.ts")]
pub struct AdoptiumAsset {
    pub binary: AdoptiumBinary,
    pub release_name: String,
    pub version: AdoptiumVersionData,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[allow(dead_code)]
#[ts(export, export_to = "java/providers/adoptium.ts")]
pub struct AdoptiumBinary {
    pub os: String,
    pub architecture: String,
    pub image_type: String,
    pub package: AdoptiumPackage,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "java/providers/adoptium.ts")]
pub struct AdoptiumPackage {
    pub name: String,
    pub link: String,
    pub size: u64,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[allow(dead_code)]
#[ts(export, export_to = "java/providers/adoptium.ts")]
pub struct AdoptiumVersionData {
    pub major: u32,
    pub minor: u32,
    pub security: u32,
    pub semver: String,
    pub openjdk_version: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[allow(dead_code)]
#[ts(export, export_to = "java/providers/adoptium.ts")]
pub struct AvailableReleases {
    pub available_releases: Vec<u32>,
    pub available_lts_releases: Vec<u32>,
    pub most_recent_lts: Option<u32>,
    pub most_recent_feature_release: Option<u32>,
}

pub struct AdoptiumProvider;

impl AdoptiumProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for AdoptiumProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl JavaProvider for AdoptiumProvider {
    async fn fetch_catalog(
        &self,
        app_handle: &AppHandle,
        force_refresh: bool,
    ) -> Result<JavaCatalog, JavaError> {
        if !force_refresh {
            if let Some(cached) = crate::core::java::load_cached_catalog(app_handle) {
                return Ok(cached);
            }
        }

        let os = self.os_name();
        let arch = self.arch_name();
        let client = reqwest::Client::new();

        let releases_url = format!("{}/info/available_releases", ADOPTIUM_API_BASE);
        let available: AvailableReleases = client
            .get(&releases_url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| {
                JavaError::NetworkError(format!("Failed to fetch available releases: {}", e))
            })?
            .json::<AvailableReleases>()
            .await
            .map_err(|e| {
                JavaError::SerializationError(format!("Failed to parse available releases: {}", e))
            })?;

        // Parallelize HTTP requests for better performance
        let mut fetch_tasks = Vec::new();

        for major_version in &available.available_releases {
            for image_type in &["jre", "jdk"] {
                let major_version = *major_version;
                let image_type = image_type.to_string();
                let url = format!(
                    "{}/assets/latest/{}/hotspot?os={}&architecture={}&image_type={}",
                    ADOPTIUM_API_BASE, major_version, os, arch, image_type
                );
                let client = client.clone();
                let is_lts = available.available_lts_releases.contains(&major_version);
                let arch = arch.to_string();

                let task = tokio::spawn(async move {
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
                                        return Some(JavaReleaseInfo {
                                            major_version,
                                            image_type,
                                            version: asset.version.semver.clone(),
                                            release_name: asset.release_name.clone(),
                                            release_date,
                                            file_size: asset.binary.package.size,
                                            checksum: asset.binary.package.checksum,
                                            download_url: asset.binary.package.link,
                                            is_lts,
                                            is_available: true,
                                            architecture: asset.binary.architecture.clone(),
                                        });
                                    }
                                }
                            }
                            // Fallback for unsuccessful response
                            Some(JavaReleaseInfo {
                                major_version,
                                image_type,
                                version: format!("{}.x", major_version),
                                release_name: format!("jdk-{}", major_version),
                                release_date: None,
                                file_size: 0,
                                checksum: None,
                                download_url: String::new(),
                                is_lts,
                                is_available: false,
                                architecture: arch,
                            })
                        }
                        Err(_) => Some(JavaReleaseInfo {
                            major_version,
                            image_type,
                            version: format!("{}.x", major_version),
                            release_name: format!("jdk-{}", major_version),
                            release_date: None,
                            file_size: 0,
                            checksum: None,
                            download_url: String::new(),
                            is_lts,
                            is_available: false,
                            architecture: arch,
                        }),
                    }
                });
                fetch_tasks.push(task);
            }
        }

        // Collect all results concurrently
        let mut releases = Vec::new();
        for task in fetch_tasks {
            match task.await {
                Ok(Some(release)) => {
                    releases.push(release);
                }
                Ok(None) => {
                    // Task completed but returned None, should not happen in current implementation
                }
                Err(e) => {
                    return Err(JavaError::NetworkError(format!(
                        "Failed to join Adoptium catalog fetch task: {}",
                        e
                    )));
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

        let _ = save_catalog_cache(app_handle, &catalog);

        Ok(catalog)
    }

    async fn fetch_release(
        &self,
        major_version: u32,
        image_type: ImageType,
    ) -> Result<JavaDownloadInfo, JavaError> {
        let os = self.os_name();
        let arch = self.arch_name();

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
            .map_err(|e| JavaError::NetworkError(format!("Network request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(JavaError::NetworkError(format!(
                "Adoptium API returned error: {} - The version/platform might be unavailable",
                response.status()
            )));
        }

        let assets: Vec<AdoptiumAsset> =
            response.json::<Vec<AdoptiumAsset>>().await.map_err(|e| {
                JavaError::SerializationError(format!("Failed to parse API response: {}", e))
            })?;

        let asset = assets
            .into_iter()
            .next()
            .ok_or_else(|| JavaError::NotFound)?;

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

    async fn available_versions(&self) -> Result<Vec<u32>, JavaError> {
        let url = format!("{}/info/available_releases", ADOPTIUM_API_BASE);

        let response = reqwest::get(url)
            .await
            .map_err(|e| JavaError::NetworkError(format!("Network request failed: {}", e)))?;

        let releases: AvailableReleases =
            response.json::<AvailableReleases>().await.map_err(|e| {
                JavaError::SerializationError(format!("Failed to parse response: {}", e))
            })?;

        Ok(releases.available_releases)
    }

    fn provider_name(&self) -> &'static str {
        "adoptium"
    }

    fn os_name(&self) -> &'static str {
        #[cfg(target_os = "linux")]
        {
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
            "linux"
        }
    }

    fn arch_name(&self) -> &'static str {
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
            "x64"
        }
    }

    fn install_prefix(&self) -> &'static str {
        "temurin"
    }
}

use crate::core::java::error::JavaError;
use crate::core::java::provider::JavaProvider;
use crate::core::java::save_catalog_cache;
use crate::core::java::{ImageType, JavaCatalog, JavaDownloadInfo, JavaReleaseInfo};
use serde::Deserialize;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Semaphore;
use tokio::time::{sleep, Duration};
use ts_rs::TS;

const ADOPTIUM_API_BASE: &str = "https://api.adoptium.net/v3";
const CATALOG_MAX_CONCURRENT_REQUESTS: usize = 6;
#[cfg(not(test))]
const CATALOG_REQUEST_RETRIES: u32 = 3;
#[cfg(test)]
const CATALOG_REQUEST_RETRIES: u32 = 2; // TODO: Consider making this configurable
#[cfg(not(test))]
const CATALOG_RETRY_BASE_DELAY_MS: u64 = 300;
#[cfg(test)]
const CATALOG_RETRY_BASE_DELAY_MS: u64 = 10; // TODO: Consider making this configurable

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/providers/adoptium.ts"
)]
pub struct AdoptiumAsset {
    pub binary: AdoptiumBinary,
    pub release_name: String,
    pub version: AdoptiumVersionData,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[allow(dead_code)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/providers/adoptium.ts"
)]
pub struct AdoptiumBinary {
    pub os: String,
    pub architecture: String,
    pub image_type: String,
    pub package: AdoptiumPackage,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/providers/adoptium.ts"
)]
pub struct AdoptiumPackage {
    pub name: String,
    pub link: String,
    pub size: u64,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[allow(dead_code)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/providers/adoptium.ts"
)]
pub struct AdoptiumVersionData {
    pub major: u32,
    pub minor: u32,
    pub security: u32,
    pub semver: String,
    pub openjdk_version: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[allow(dead_code)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/providers/adoptium.ts"
)]
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

async fn fetch_available_releases_with_retry(
    client: &reqwest::Client,
    releases_url: &str,
) -> Result<AvailableReleases, JavaError> {
    for attempt in 0..=CATALOG_REQUEST_RETRIES {
        let response = client
            .get(releases_url)
            .header("Accept", "application/json")
            .send()
            .await;

        match response {
            Ok(resp) => {
                if resp.status().is_success() {
                    return resp.json::<AvailableReleases>().await.map_err(|e| {
                        JavaError::SerializationError(format!(
                            "Failed to parse available releases: {}",
                            e
                        ))
                    });
                }

                if attempt == CATALOG_REQUEST_RETRIES {
                    return Err(JavaError::NetworkError(format!(
                        "Failed to fetch available releases after retries, status: {}",
                        resp.status()
                    )));
                }
            }
            Err(err) => {
                if attempt == CATALOG_REQUEST_RETRIES {
                    return Err(JavaError::NetworkError(format!(
                        "Failed to fetch available releases: {}",
                        err
                    )));
                }
            }
        }

        let backoff = CATALOG_RETRY_BASE_DELAY_MS * (1_u64 << attempt);
        sleep(Duration::from_millis(backoff)).await;
    }

    Err(JavaError::NetworkError(
        "Failed to fetch available releases after retries".to_string(),
    ))
}

async fn fetch_adoptium_assets_with_retry(
    client: &reqwest::Client,
    url: &str,
) -> Result<Vec<AdoptiumAsset>, String> {
    let mut last_error = "unknown error".to_string();

    for attempt in 0..=CATALOG_REQUEST_RETRIES {
        match client
            .get(url)
            .header("Accept", "application/json")
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    return response
                        .json::<Vec<AdoptiumAsset>>()
                        .await
                        .map_err(|e| format!("Failed to parse assets response: {}", e));
                }

                last_error = format!("HTTP status {}", response.status());
            }
            Err(err) => {
                last_error = err.to_string();
            }
        }

        if attempt < CATALOG_REQUEST_RETRIES {
            let backoff = CATALOG_RETRY_BASE_DELAY_MS * (1_u64 << attempt);
            sleep(Duration::from_millis(backoff)).await;
        }
    }

    Err(last_error)
}

impl JavaProvider for AdoptiumProvider {
    async fn fetch_catalog(
        &self,
        app_handle: &AppHandle,
        force_refresh: bool,
    ) -> Result<JavaCatalog, JavaError> {
        if !force_refresh {
            match crate::core::java::load_cached_catalog_result(app_handle) {
                Ok(Some(cached)) => return Ok(cached),
                Ok(None) => {}
                Err(err) => {
                    log::warn!("Failed to load Java catalog cache: {}", err);
                }
            }
        }

        let os = self.os_name();
        let arch = self.arch_name();
        let client = reqwest::Client::new();

        let releases_url = format!("{}/info/available_releases", ADOPTIUM_API_BASE);
        let available = fetch_available_releases_with_retry(&client, &releases_url).await?;

        // Bounded parallel requests with retry to avoid request spikes.
        let mut fetch_tasks = Vec::new();
        let semaphore = Arc::new(Semaphore::new(CATALOG_MAX_CONCURRENT_REQUESTS));

        for major_version in &available.available_releases {
            for image_type in [ImageType::Jre, ImageType::Jdk] {
                let major_version = *major_version;
                let image_type = image_type;
                let url = format!(
                    "{}/assets/latest/{}/hotspot?os={}&architecture={}&image_type={}",
                    ADOPTIUM_API_BASE, major_version, os, arch, image_type
                );
                let client = client.clone();
                let is_lts = available.available_lts_releases.contains(&major_version);
                let arch = arch.to_string();
                let semaphore = semaphore.clone();

                let task = tokio::spawn(async move {
                    let _permit = semaphore.acquire_owned().await.ok();

                    if let Ok(assets) = fetch_adoptium_assets_with_retry(&client, &url).await {
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
                    } else {
                        log::warn!(
                            "Adoptium catalog fetch failed after retries (major={}, image_type={})",
                            major_version,
                            image_type
                        );
                    }

                    // Fallback for failed/unavailable response
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
            image_type,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration as StdDuration;

    #[derive(Clone)]
    struct MockResponse {
        status_line: &'static str,
        body: &'static str,
        delay_ms: u64,
    }

    fn spawn_mock_server(
        responses: Vec<MockResponse>,
    ) -> (String, Arc<AtomicUsize>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server failed");
        let addr = listener.local_addr().expect("read local addr failed");
        let hits = Arc::new(AtomicUsize::new(0));
        let hits_clone = Arc::clone(&hits);

        let handle = thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().expect("accept failed");
                hits_clone.fetch_add(1, Ordering::SeqCst);

                let _ = stream.set_read_timeout(Some(StdDuration::from_millis(100)));
                let mut buf = [0_u8; 2048];
                let _ = stream.read(&mut buf);

                if response.delay_ms > 0 {
                    thread::sleep(StdDuration::from_millis(response.delay_ms));
                }

                let body_bytes = response.body.as_bytes();
                let head = format!(
                    "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    response.status_line,
                    body_bytes.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(body_bytes);
                let _ = stream.flush();
            }
        });

        (format!("http://{}", addr), hits, handle)
    }

    #[tokio::test]
    async fn fetch_available_releases_retries_on_timeout() {
        let attempts = CATALOG_REQUEST_RETRIES as usize + 1;
        let responses = vec![
            MockResponse {
                status_line: "200 OK",
                body: "{\"available_releases\":[21],\"available_lts_releases\":[21],\"most_recent_lts\":21,\"most_recent_feature_release\":21}",
                delay_ms: 120,
            };
            attempts
        ];
        let (base_url, hits, handle) = spawn_mock_server(responses);

        let client = reqwest::Client::builder()
            .timeout(StdDuration::from_millis(30))
            .build()
            .expect("build client failed");

        let result =
            fetch_available_releases_with_retry(&client, &format!("{}/releases", base_url)).await;
        let _ = handle.join();

        assert!(matches!(result, Err(JavaError::NetworkError(_))));
        assert_eq!(hits.load(Ordering::SeqCst), attempts);
    }

    #[tokio::test]
    async fn fetch_available_releases_retries_on_http_5xx() {
        let attempts = CATALOG_REQUEST_RETRIES as usize + 1;
        let responses = vec![
            MockResponse {
                status_line: "503 Service Unavailable",
                body: "{}",
                delay_ms: 0,
            };
            attempts
        ];
        let (base_url, hits, handle) = spawn_mock_server(responses);
        let client = reqwest::Client::new();

        let result =
            fetch_available_releases_with_retry(&client, &format!("{}/releases", base_url)).await;
        let _ = handle.join();

        assert!(matches!(result, Err(JavaError::NetworkError(_))));
        assert_eq!(hits.load(Ordering::SeqCst), attempts);
    }

    #[tokio::test]
    async fn fetch_available_releases_parse_failure_returns_serialization_error() {
        let responses = vec![MockResponse {
            status_line: "200 OK",
            body: "{this is invalid json",
            delay_ms: 0,
        }];
        let (base_url, hits, handle) = spawn_mock_server(responses);
        let client = reqwest::Client::new();

        let result =
            fetch_available_releases_with_retry(&client, &format!("{}/releases", base_url)).await;
        let _ = handle.join();

        assert!(matches!(result, Err(JavaError::SerializationError(_))));
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn fetch_assets_parse_failure_returns_error() {
        let responses = vec![MockResponse {
            status_line: "200 OK",
            body: "[invalid",
            delay_ms: 0,
        }];
        let (base_url, hits, handle) = spawn_mock_server(responses);
        let client = reqwest::Client::new();

        let result =
            fetch_adoptium_assets_with_retry(&client, &format!("{}/assets", base_url)).await;
        let _ = handle.join();

        assert!(result.is_err());
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }
}

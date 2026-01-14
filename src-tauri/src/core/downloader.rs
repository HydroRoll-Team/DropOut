use futures::StreamExt;
use serde::{Deserialize, Serialize};
use sha1::Digest as Sha1Digest;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Window};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTask {
    pub url: String,
    pub path: PathBuf,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub file: String,
    pub downloaded: u64,
    pub total: u64,
    pub status: String, // "Downloading", "Verifying", "Finished", "Error"
}

/// calculate SHA256 hash of data
pub fn compute_sha256(data: &[u8]) -> String {
    let mut hasher = sha2::Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// calculate SHA1 hash of data
pub fn compute_sha1(data: &[u8]) -> String {
    let mut hasher = sha1::Sha1::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// verify file checksum, prefer SHA256, fallback to SHA1
pub fn verify_checksum(data: &[u8], sha256: Option<&str>, sha1: Option<&str>) -> bool {
    if let Some(expected) = sha256 {
        return compute_sha256(data) == expected;
    }
    if let Some(expected) = sha1 {
        return compute_sha1(data) == expected;
    }
    // No checksum provided, default to true
    true
}

pub async fn download_files(window: Window, tasks: Vec<DownloadTask>) -> Result<(), String> {
    let client = reqwest::Client::new();
    let semaphore = Arc::new(Semaphore::new(10)); // Max 10 concurrent downloads

    // Notify start (total files)
    let _ = window.emit("download-start", tasks.len());

    let tasks_stream = futures::stream::iter(tasks).map(|task| {
        let client = client.clone();
        let window = window.clone();
        let semaphore = semaphore.clone();

        async move {
            let _permit = semaphore.acquire().await.unwrap();
            let file_name = task.path.file_name().unwrap().to_string_lossy().to_string();

            // 1. Check if file exists and verify checksum
            if task.path.exists() {
                let _ = window.emit(
                    "download-progress",
                    ProgressEvent {
                        file: file_name.clone(),
                        downloaded: 0,
                        total: 0,
                        status: "Verifying".into(),
                    },
                );

                if task.sha256.is_some() || task.sha1.is_some() {
                    if let Ok(data) = tokio::fs::read(&task.path).await {
                        if verify_checksum(
                            &data,
                            task.sha256.as_deref(),
                            task.sha1.as_deref(),
                        ) {
                            // Already valid
                            let _ = window.emit(
                                "download-progress",
                                ProgressEvent {
                                    file: file_name.clone(),
                                    downloaded: 0,
                                    total: 0,
                                    status: "Skipped".into(),
                                },
                            );
                            return Ok(());
                        }
                    }
                }
            }

            // 2. Download
            if let Some(parent) = task.path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            match client.get(&task.url).send().await {
                Ok(mut resp) => {
                    let total_size = resp.content_length().unwrap_or(0);
                    let mut file = match tokio::fs::File::create(&task.path).await {
                        Ok(f) => f,
                        Err(e) => return Err(format!("Create file error: {}", e)),
                    };

                    let mut downloaded: u64 = 0;
                    loop {
                        match resp.chunk().await {
                            Ok(Some(chunk)) => {
                                if let Err(e) = file.write_all(&chunk).await {
                                    return Err(format!("Write error: {}", e));
                                }
                                downloaded += chunk.len() as u64;
                                let _ = window.emit(
                                    "download-progress",
                                    ProgressEvent {
                                        file: file_name.clone(),
                                        downloaded,
                                        total: total_size,
                                        status: "Downloading".into(),
                                    },
                                );
                            }
                            Ok(None) => break,
                            Err(e) => return Err(format!("Download error: {}", e)),
                        }
                    }
                }
                Err(e) => return Err(format!("Request error: {}", e)),
            }

            let _ = window.emit(
                "download-progress",
                ProgressEvent {
                    file: file_name.clone(),
                    downloaded: 0,
                    total: 0,
                    status: "Finished".into(),
                },
            );

            Ok(())
        }
    });

    // Buffer unordered to run concurrently
    tasks_stream
        .buffer_unordered(10)
        .collect::<Vec<Result<(), String>>>()
        .await;

    let _ = window.emit("download-complete", ());
    Ok(())
}

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Window};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTask {
    pub url: String,
    pub path: PathBuf,
    pub sha1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub file: String,
    pub downloaded: u64,
    pub total: u64,
    pub status: String, // "Downloading", "Verifying", "Finished", "Error"
    pub completed_files: usize,
    pub total_files: usize,
    pub total_downloaded_bytes: u64,
}

/// Snapshot of global progress state
struct ProgressSnapshot {
    completed_files: usize,
    total_files: usize,
    total_downloaded_bytes: u64,
}

/// Centralized progress tracking with atomic counters
struct GlobalProgress {
    completed_files: AtomicUsize,
    total_downloaded_bytes: AtomicU64,
    total_files: usize,
}

impl GlobalProgress {
    fn new(total_files: usize) -> Self {
        Self {
            completed_files: AtomicUsize::new(0),
            total_downloaded_bytes: AtomicU64::new(0),
            total_files,
        }
    }

    /// Get current progress snapshot without modification
    fn snapshot(&self) -> ProgressSnapshot {
        ProgressSnapshot {
            completed_files: self.completed_files.load(Ordering::Relaxed),
            total_files: self.total_files,
            total_downloaded_bytes: self.total_downloaded_bytes.load(Ordering::Relaxed),
        }
    }

    /// Increment completed files counter and return updated snapshot
    fn inc_completed(&self) -> ProgressSnapshot {
        let completed = self.completed_files.fetch_add(1, Ordering::Relaxed) + 1;
        ProgressSnapshot {
            completed_files: completed,
            total_files: self.total_files,
            total_downloaded_bytes: self.total_downloaded_bytes.load(Ordering::Relaxed),
        }
    }

    /// Add downloaded bytes and return updated snapshot
    fn add_bytes(&self, delta: u64) -> ProgressSnapshot {
        let total_bytes = self.total_downloaded_bytes.fetch_add(delta, Ordering::Relaxed) + delta;
        ProgressSnapshot {
            completed_files: self.completed_files.load(Ordering::Relaxed),
            total_files: self.total_files,
            total_downloaded_bytes: total_bytes,
        }
    }
}

/// Emit a progress event to the frontend
fn emit_progress(
    window: &Window,
    file_name: &str,
    status: &str,
    downloaded: u64,
    total: u64,
    snapshot: &ProgressSnapshot,
) {
    let _ = window.emit(
        "download-progress",
        ProgressEvent {
            file: file_name.to_string(),
            downloaded,
            total,
            status: status.into(),
            completed_files: snapshot.completed_files,
            total_files: snapshot.total_files,
            total_downloaded_bytes: snapshot.total_downloaded_bytes,
        },
    );
}

pub async fn download_files(window: Window, tasks: Vec<DownloadTask>, max_concurrent: usize) -> Result<(), String> {
    // Clamp max_concurrent to a valid range (1-128) to prevent edge cases
    let max_concurrent = max_concurrent.clamp(1, 128);
    
    let client = reqwest::Client::builder()
        .pool_max_idle_per_host(max_concurrent)
        .build()
        .map_err(|e| e.to_string())?;
    let semaphore = Arc::new(Semaphore::new(max_concurrent));
    let progress = Arc::new(GlobalProgress::new(tasks.len()));

    // Notify start (total files)
    let _ = window.emit("download-start", tasks.len());

    let tasks_stream = futures::stream::iter(tasks).map(|task| {
        let client = client.clone();
        let window = window.clone();
        let semaphore = semaphore.clone();
        let progress = progress.clone();

        async move {
            let _permit = semaphore.acquire().await.unwrap();
            let file_name = task.path.file_name().unwrap().to_string_lossy().to_string();

            // 1. Check if file exists and verify SHA1
            if task.path.exists() {
                emit_progress(&window, &file_name, "Verifying", 0, 0, &progress.snapshot());

                if let Some(expected_sha1) = &task.sha1 {
                    if let Ok(data) = tokio::fs::read(&task.path).await {
                        let mut hasher = sha1::Sha1::new();
                        use sha1::Digest;
                        hasher.update(&data);
                        let result = hex::encode(hasher.finalize());
                        if &result == expected_sha1 {
                            // Already valid, skip download
                            emit_progress(&window, &file_name, "Skipped", 0, 0, &progress.inc_completed());
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
                                let snapshot = progress.add_bytes(chunk.len() as u64);
                                emit_progress(&window, &file_name, "Downloading", downloaded, total_size, &snapshot);
                            }
                            Ok(None) => break,
                            Err(e) => return Err(format!("Download error: {}", e)),
                        }
                    }
                }
                Err(e) => return Err(format!("Request error: {}", e)),
            }

            emit_progress(&window, &file_name, "Finished", 0, 0, &progress.inc_completed());
            Ok(())
        }
    });

    // Buffer unordered to run concurrently
    tasks_stream
        .buffer_unordered(max_concurrent)
        .collect::<Vec<Result<(), String>>>()
        .await;

    let _ = window.emit("download-complete", ());
    Ok(())
}

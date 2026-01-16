use futures::StreamExt;
use serde::{Deserialize, Serialize};
use sha1::Digest as Sha1Digest;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, Window};
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
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

/// Metadata for resumable downloads stored in .part.meta file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadMetadata {
    pub url: String,
    pub file_name: String,
    pub total_size: u64,
    pub downloaded_bytes: u64,
    pub checksum: Option<String>,
    pub timestamp: u64,
    pub segments: Vec<DownloadSegment>,
}

/// A download segment for multi-segment parallel downloading
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSegment {
    pub start: u64,
    pub end: u64,
    pub downloaded: u64,
    pub completed: bool,
}

/// Progress event for Java download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaDownloadProgress {
    pub file_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
    pub eta_seconds: u64,
    pub status: String, // "Downloading", "Extracting", "Verifying", "Completed", "Paused", "Error"
    pub percentage: f32,
}

/// Pending download task for queue persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingJavaDownload {
    pub major_version: u32,
    pub image_type: String,
    pub download_url: String,
    pub file_name: String,
    pub file_size: u64,
    pub checksum: Option<String>,
    pub install_path: String,
    pub created_at: u64,
}

/// Download queue for persistence
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DownloadQueue {
    pub pending_downloads: Vec<PendingJavaDownload>,
}

impl DownloadQueue {
    /// Load download queue from file
    pub fn load(app_handle: &AppHandle) -> Self {
        let queue_path = app_handle
            .path()
            .app_data_dir()
            .unwrap()
            .join("download_queue.json");
        if queue_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&queue_path) {
                if let Ok(queue) = serde_json::from_str(&content) {
                    return queue;
                }
            }
        }
        Self::default()
    }

    /// Save download queue to file
    pub fn save(&self, app_handle: &AppHandle) -> Result<(), String> {
        let queue_path = app_handle
            .path()
            .app_data_dir()
            .unwrap()
            .join("download_queue.json");
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&queue_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Add a pending download
    pub fn add(&mut self, download: PendingJavaDownload) {
        // Remove existing download for same version/type
        self.pending_downloads.retain(|d| {
            !(d.major_version == download.major_version && d.image_type == download.image_type)
        });
        self.pending_downloads.push(download);
    }

    /// Remove a completed or cancelled download
    pub fn remove(&mut self, major_version: u32, image_type: &str) {
        self.pending_downloads
            .retain(|d| !(d.major_version == major_version && d.image_type == image_type));
    }
}

/// Global cancel flag for Java downloads
pub static JAVA_DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);

/// Reset the cancel flag
pub fn reset_java_download_cancel() {
    JAVA_DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);
}

/// Cancel the current Java download
pub fn cancel_java_download() {
    JAVA_DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
}

/// Check if download is cancelled
pub fn is_java_download_cancelled() -> bool {
    JAVA_DOWNLOAD_CANCELLED.load(Ordering::SeqCst)
}

/// Determine optimal segment count based on file size
fn get_segment_count(file_size: u64) -> usize {
    if file_size < 20 * 1024 * 1024 {
        1 // < 20MB: single segment
    } else if file_size < 100 * 1024 * 1024 {
        4 // 20-100MB: 4 segments
    } else {
        8 // > 100MB: 8 segments
    }
}

/// Download a large file with resume support and progress events
pub async fn download_with_resume(
    app_handle: &AppHandle,
    url: &str,
    dest_path: &PathBuf,
    checksum: Option<&str>,
    total_size: u64,
) -> Result<(), String> {
    reset_java_download_cancel();

    let part_path = dest_path.with_extension(
        dest_path
            .extension()
            .map(|e| format!("{}.part", e.to_string_lossy()))
            .unwrap_or_else(|| "part".to_string()),
    );
    let meta_path = PathBuf::from(format!("{}.meta", part_path.display()));
    let file_name = dest_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Load or create metadata
    let mut metadata = if meta_path.exists() {
        let content = tokio::fs::read_to_string(&meta_path)
            .await
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&content)
            .unwrap_or_else(|_| create_new_metadata(url, &file_name, total_size, checksum))
    } else {
        create_new_metadata(url, &file_name, total_size, checksum)
    };

    // Create parent directory
    if let Some(parent) = dest_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Open or create part file
    let file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .read(true)
        .truncate(false)
        .open(&part_path)
        .await
        .map_err(|e| format!("Failed to open part file: {}", e))?;

    let file = Arc::new(tokio::sync::Mutex::new(file));
    let client = reqwest::Client::new();
    let progress = Arc::new(AtomicU64::new(metadata.downloaded_bytes));
    let start_time = std::time::Instant::now();
    let last_progress_bytes = Arc::new(AtomicU64::new(metadata.downloaded_bytes));

    // Download segments concurrently
    let segment_count = metadata.segments.len();
    let semaphore = Arc::new(Semaphore::new(segment_count.min(8)));
    let mut handles = Vec::new();

    for (idx, segment) in metadata.segments.iter().enumerate() {
        if segment.completed {
            continue;
        }

        let client = client.clone();
        let url = url.to_string();
        let file = file.clone();
        let progress = progress.clone();
        let semaphore = semaphore.clone();
        let segment_start = segment.start + segment.downloaded;
        let segment_end = segment.end;
        let app_handle = app_handle.clone();
        let file_name = file_name.clone();
        let last_progress_bytes = last_progress_bytes.clone();

        let handle = tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();

            if is_java_download_cancelled() {
                return Err("Download cancelled".to_string());
            }

            // Send Range request
            let range = format!("bytes={}-{}", segment_start, segment_end);
            let response = client
                .get(&url)
                .header("Range", &range)
                .send()
                .await
                .map_err(|e| format!("Request failed: {}", e))?;

            if !response.status().is_success()
                && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
            {
                return Err(format!("Server returned error: {}", response.status()));
            }

            let mut stream = response.bytes_stream();
            let mut current_pos = segment_start;

            while let Some(chunk_result) = stream.next().await {
                if is_java_download_cancelled() {
                    return Err("Download cancelled".to_string());
                }

                let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
                let chunk_len = chunk.len() as u64;

                // Write to file at correct position
                {
                    let mut file_guard = file.lock().await;
                    file_guard
                        .seek(std::io::SeekFrom::Start(current_pos))
                        .await
                        .map_err(|e| format!("Seek error: {}", e))?;
                    file_guard
                        .write_all(&chunk)
                        .await
                        .map_err(|e| format!("Write error: {}", e))?;
                }

                current_pos += chunk_len;
                let total_downloaded = progress.fetch_add(chunk_len, Ordering::Relaxed) + chunk_len;

                // Emit progress event (throttled)
                let last_bytes = last_progress_bytes.load(Ordering::Relaxed);
                if total_downloaded - last_bytes > 100 * 1024 || total_downloaded >= total_size {
                    last_progress_bytes.store(total_downloaded, Ordering::Relaxed);

                    let elapsed = start_time.elapsed().as_secs_f64();
                    let speed = if elapsed > 0.0 {
                        (total_downloaded as f64 / elapsed) as u64
                    } else {
                        0
                    };
                    let remaining = total_size.saturating_sub(total_downloaded);
                    let eta = if speed > 0 { remaining / speed } else { 0 };
                    let percentage = (total_downloaded as f32 / total_size as f32) * 100.0;

                    let _ = app_handle.emit(
                        "java-download-progress",
                        JavaDownloadProgress {
                            file_name: file_name.clone(),
                            downloaded_bytes: total_downloaded,
                            total_bytes: total_size,
                            speed_bytes_per_sec: speed,
                            eta_seconds: eta,
                            status: "Downloading".to_string(),
                            percentage,
                        },
                    );
                }
            }

            Ok::<usize, String>(idx)
        });

        handles.push(handle);
    }

    // Wait for all segments
    let mut all_success = true;
    for handle in handles {
        match handle.await {
            Ok(Ok(idx)) => {
                metadata.segments[idx].completed = true;
            }
            Ok(Err(e)) => {
                all_success = false;
                if e.contains("cancelled") {
                    // Save progress for resume
                    metadata.downloaded_bytes = progress.load(Ordering::Relaxed);
                    let meta_content =
                        serde_json::to_string_pretty(&metadata).map_err(|e| e.to_string())?;
                    tokio::fs::write(&meta_path, meta_content).await.ok();
                    return Err(e);
                }
            }
            Err(e) => {
                all_success = false;
                eprintln!("Segment task panicked: {}", e);
            }
        }
    }

    if !all_success {
        // Save progress
        metadata.downloaded_bytes = progress.load(Ordering::Relaxed);
        let meta_content = serde_json::to_string_pretty(&metadata).map_err(|e| e.to_string())?;
        tokio::fs::write(&meta_path, meta_content).await.ok();
        return Err("Some segments failed".to_string());
    }

    // Verify checksum if provided
    if let Some(expected) = checksum {
        let _ = app_handle.emit(
            "java-download-progress",
            JavaDownloadProgress {
                file_name: file_name.clone(),
                downloaded_bytes: total_size,
                total_bytes: total_size,
                speed_bytes_per_sec: 0,
                eta_seconds: 0,
                status: "Verifying".to_string(),
                percentage: 100.0,
            },
        );

        let data = tokio::fs::read(&part_path)
            .await
            .map_err(|e| format!("Failed to read file for verification: {}", e))?;

        if !verify_checksum(&data, Some(expected), None) {
            // Checksum failed, delete files and retry
            tokio::fs::remove_file(&part_path).await.ok();
            tokio::fs::remove_file(&meta_path).await.ok();
            return Err("Checksum verification failed".to_string());
        }
    }

    // Rename part file to final destination
    tokio::fs::rename(&part_path, dest_path)
        .await
        .map_err(|e| format!("Failed to rename file: {}", e))?;

    // Clean up metadata file
    tokio::fs::remove_file(&meta_path).await.ok();

    Ok(())
}

/// Create new download metadata with segments
fn create_new_metadata(
    url: &str,
    file_name: &str,
    total_size: u64,
    checksum: Option<&str>,
) -> DownloadMetadata {
    let segment_count = get_segment_count(total_size);
    let segment_size = total_size / segment_count as u64;
    let mut segments = Vec::new();

    for i in 0..segment_count {
        let start = i as u64 * segment_size;
        let end = if i == segment_count - 1 {
            total_size - 1
        } else {
            (i as u64 + 1) * segment_size - 1
        };
        segments.push(DownloadSegment {
            start,
            end,
            downloaded: 0,
            completed: false,
        });
    }

    DownloadMetadata {
        url: url.to_string(),
        file_name: file_name.to_string(),
        total_size,
        downloaded_bytes: 0,
        checksum: checksum.map(|s| s.to_string()),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        segments,
    }
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
        let total_bytes = self
            .total_downloaded_bytes
            .fetch_add(delta, Ordering::Relaxed)
            + delta;
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

pub async fn download_files(
    window: Window,
    tasks: Vec<DownloadTask>,
    max_concurrent: usize,
) -> Result<(), String> {
    // Clamp max_concurrent to a valid range (1-128) to prevent edge cases
    let max_concurrent = max_concurrent.clamp(1, 128);

    let client = reqwest::Client::new();
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

            // 1. Check if file exists and verify checksum
            if task.path.exists() {
                emit_progress(&window, &file_name, "Verifying", 0, 0, &progress.snapshot());

                if task.sha256.is_some() || task.sha1.is_some() {
                    if let Ok(data) = tokio::fs::read(&task.path).await {
                        if verify_checksum(&data, task.sha256.as_deref(), task.sha1.as_deref()) {
                            // Already valid, skip download
                            let skipped_size = tokio::fs::metadata(&task.path)
                                .await
                                .map(|m| m.len())
                                .unwrap_or(0);
                            if skipped_size > 0 {
                                let _ = progress.add_bytes(skipped_size);
                            }
                            emit_progress(
                                &window,
                                &file_name,
                                "Skipped",
                                0,
                                0,
                                &progress.inc_completed(),
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
                                let snapshot = progress.add_bytes(chunk.len() as u64);
                                emit_progress(
                                    &window,
                                    &file_name,
                                    "Downloading",
                                    downloaded,
                                    total_size,
                                    &snapshot,
                                );
                            }
                            Ok(None) => break,
                            Err(e) => return Err(format!("Download error: {}", e)),
                        }
                    }
                }
                Err(e) => return Err(format!("Request error: {}", e)),
            }

            emit_progress(
                &window,
                &file_name,
                "Finished",
                0,
                0,
                &progress.inc_completed(),
            );
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

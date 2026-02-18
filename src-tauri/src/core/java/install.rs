use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter};

use crate::core::downloader::{DownloadQueue, JavaDownloadProgress, PendingJavaDownload};
use crate::utils::zip;

use super::{
    fetch_java_release_with, get_java_install_dir, strip_unc_prefix, validation, ImageType,
    JavaInstallation, JavaProvider,
};

pub async fn download_and_install_java_with_provider<P: JavaProvider>(
    provider: &P,
    app_handle: &AppHandle,
    major_version: u32,
    image_type: ImageType,
    custom_path: Option<PathBuf>,
) -> Result<JavaInstallation, String> {
    let info = fetch_java_release_with(provider, major_version, image_type)
        .await
        .map_err(|e| e.to_string())?;
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
    let java_bin = resolve_java_executable(&java_home);

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
        let names: Vec<String> = entries
            .iter()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        Err(format!(
            "Expected exactly one top-level directory, found {}: {:?}",
            names.len(),
            names
        ))
    }
}

fn resolve_java_executable(java_home: &Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        java_home
            .join("Contents")
            .join("Home")
            .join("bin")
            .join("java")
    } else if cfg!(windows) {
        java_home.join("bin").join("java.exe")
    } else {
        java_home.join("bin").join("java")
    }
}

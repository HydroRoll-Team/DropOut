use crate::core::java::error::JavaError;
use crate::core::java::JavaCatalog;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CACHE_DURATION_SECS: u64 = 24 * 60 * 60;

fn get_catalog_cache_path(app_handle: &AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap()
        .join("java_catalog_cache.json")
}

fn write_file_atomic(path: &PathBuf, content: &str) -> Result<(), JavaError> {
    let parent = path.parent().ok_or_else(|| {
        JavaError::InvalidConfig("Java cache path has no parent directory".to_string())
    })?;
    std::fs::create_dir_all(parent)?;

    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, content)?;

    if path.exists() {
        let _ = std::fs::remove_file(path);
    }

    std::fs::rename(&tmp_path, path)?;
    Ok(())
}

pub fn load_cached_catalog_result(
    app_handle: &AppHandle,
) -> Result<Option<JavaCatalog>, JavaError> {
    let cache_path = get_catalog_cache_path(app_handle);
    if !cache_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&cache_path)?;
    let catalog: JavaCatalog = serde_json::from_str(&content)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| JavaError::Other(format!("System time error: {}", e)))?
        .as_secs();

    if now - catalog.cached_at < CACHE_DURATION_SECS {
        Ok(Some(catalog))
    } else {
        Ok(None)
    }
}

#[allow(dead_code)]
pub fn load_cached_catalog(app_handle: &AppHandle) -> Option<JavaCatalog> {
    match load_cached_catalog_result(app_handle) {
        Ok(value) => value,
        Err(_) => None,
    }
}

pub fn save_catalog_cache(app_handle: &AppHandle, catalog: &JavaCatalog) -> Result<(), JavaError> {
    let cache_path = get_catalog_cache_path(app_handle);
    let content = serde_json::to_string_pretty(catalog)?;
    write_file_atomic(&cache_path, &content)
}

#[allow(dead_code)]
pub fn clear_catalog_cache(app_handle: &AppHandle) -> Result<(), JavaError> {
    let cache_path = get_catalog_cache_path(app_handle);
    if cache_path.exists() {
        std::fs::remove_file(&cache_path)?;
    }
    Ok(())
}

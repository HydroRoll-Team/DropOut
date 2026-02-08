use crate::core::java::error::JavaError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/persistence.ts"
)]
pub struct JavaConfig {
    pub user_defined_paths: Vec<String>,
    pub preferred_java_path: Option<String>,
    pub last_detection_time: u64,
}

impl Default for JavaConfig {
    fn default() -> Self {
        Self {
            user_defined_paths: Vec::new(),
            preferred_java_path: None,
            last_detection_time: 0,
        }
    }
}

fn get_java_config_path(app_handle: &AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap()
        .join("java_config.json")
}

fn write_file_atomic(path: &PathBuf, content: &str) -> Result<(), JavaError> {
    let parent = path.parent().ok_or_else(|| {
        JavaError::InvalidConfig("Java config path has no parent directory".to_string())
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

pub fn load_java_config(app_handle: &AppHandle) -> JavaConfig {
    match load_java_config_result(app_handle) {
        Ok(config) => config,
        Err(err) => {
            let config_path = get_java_config_path(app_handle);
            log::warn!(
                "Failed to load Java config at {}: {}. Using default configuration.",
                config_path.display(),
                err
            );
            JavaConfig::default()
        }
    }
}

pub fn load_java_config_result(app_handle: &AppHandle) -> Result<JavaConfig, JavaError> {
    let config_path = get_java_config_path(app_handle);
    if !config_path.exists() {
        return Ok(JavaConfig::default());
    }

    let content = std::fs::read_to_string(&config_path)?;
    let config: JavaConfig = serde_json::from_str(&content)?;
    Ok(config)
}

pub fn save_java_config(app_handle: &AppHandle, config: &JavaConfig) -> Result<(), JavaError> {
    let config_path = get_java_config_path(app_handle);
    let content = serde_json::to_string_pretty(config)?;
    write_file_atomic(&config_path, &content)
}

#[allow(dead_code)]
pub fn add_user_defined_path(app_handle: &AppHandle, path: String) -> Result<(), JavaError> {
    let mut config = load_java_config(app_handle);
    if !config.user_defined_paths.contains(&path) {
        config.user_defined_paths.push(path);
    }
    save_java_config(app_handle, &config)
}

#[allow(dead_code)]
pub fn remove_user_defined_path(app_handle: &AppHandle, path: &str) -> Result<(), JavaError> {
    let mut config = load_java_config(app_handle);
    config.user_defined_paths.retain(|p| p != path);
    save_java_config(app_handle, &config)
}

#[allow(dead_code)]
pub fn set_preferred_java_path(
    app_handle: &AppHandle,
    path: Option<String>,
) -> Result<(), JavaError> {
    let mut config = load_java_config(app_handle);
    config.preferred_java_path = path;
    save_java_config(app_handle, &config)
}

#[allow(dead_code)]
pub fn get_preferred_java_path(app_handle: &AppHandle) -> Option<String> {
    let config = load_java_config(app_handle);
    config.preferred_java_path
}

#[allow(dead_code)]
pub fn update_last_detection_time(app_handle: &AppHandle) -> Result<(), JavaError> {
    let mut config = load_java_config(app_handle);
    config.last_detection_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| JavaError::Other(format!("System time error: {}", e)))?
        .as_secs();
    save_java_config(app_handle, &config)
}

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

pub fn load_java_config(app_handle: &AppHandle) -> JavaConfig {
    let config_path = get_java_config_path(app_handle);
    if !config_path.exists() {
        return JavaConfig::default();
    }

    match std::fs::read_to_string(&config_path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(config) => config,
            Err(err) => {
                // Log the error but don't panic - return default config
                log::warn!(
                    "Failed to parse Java config at {}: {}. Using default configuration.",
                    config_path.display(),
                    err
                );
                JavaConfig::default()
            }
        },
        Err(err) => {
            log::warn!(
                "Failed to read Java config at {}: {}. Using default configuration.",
                config_path.display(),
                err
            );
            JavaConfig::default()
        }
    }
}

pub fn save_java_config(app_handle: &AppHandle, config: &JavaConfig) -> Result<(), JavaError> {
    let config_path = get_java_config_path(app_handle);
    let content = serde_json::to_string_pretty(config)?;

    std::fs::create_dir_all(config_path.parent().ok_or_else(|| {
        JavaError::InvalidConfig("Java config path has no parent directory".to_string())
    })?)?;

    std::fs::write(&config_path, content)?;
    Ok(())
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

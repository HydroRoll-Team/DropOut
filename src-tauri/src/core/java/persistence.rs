use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
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
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => JavaConfig::default(),
    }
}

pub fn save_java_config(app_handle: &AppHandle, config: &JavaConfig) -> Result<(), String> {
    let config_path = get_java_config_path(app_handle);
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(
        config_path
            .parent()
            .expect("Java config path should have a parent directory"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[allow(dead_code)]
pub fn add_user_defined_path(app_handle: &AppHandle, path: String) -> Result<(), String> {
    let mut config = load_java_config(app_handle);
    if !config.user_defined_paths.contains(&path) {
        config.user_defined_paths.push(path);
    }
    save_java_config(app_handle, &config)
}

#[allow(dead_code)]
pub fn remove_user_defined_path(app_handle: &AppHandle, path: &str) -> Result<(), String> {
    let mut config = load_java_config(app_handle);
    config.user_defined_paths.retain(|p| p != path);
    save_java_config(app_handle, &config)
}

#[allow(dead_code)]
pub fn set_preferred_java_path(app_handle: &AppHandle, path: Option<String>) -> Result<(), String> {
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
pub fn update_last_detection_time(app_handle: &AppHandle) -> Result<(), String> {
    let mut config = load_java_config(app_handle);
    config.last_detection_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    save_java_config(app_handle, &config)
}

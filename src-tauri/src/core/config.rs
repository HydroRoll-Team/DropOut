use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LauncherConfig {
    pub min_memory: u32, // in MB
    pub max_memory: u32, // in MB
    pub java_path: String,
    pub width: u32,
    pub height: u32,
    pub download_threads: u32, // concurrent download threads (1-128)
    pub custom_background_path: Option<String>,
    pub enable_gpu_acceleration: bool,
    pub enable_visual_effects: bool,
    pub active_effect: String,
    pub theme: String,
    pub log_upload_service: String, // "paste.rs" or "pastebin.com"
    pub pastebin_api_key: Option<String>,
}

impl Default for LauncherConfig {
    fn default() -> Self {
        Self {
            min_memory: 1024,
            max_memory: 2048,
            java_path: "java".to_string(),
            width: 854,
            height: 480,
            download_threads: 32,
            custom_background_path: None,
            enable_gpu_acceleration: false,
            enable_visual_effects: true,
            active_effect: "constellation".to_string(),
            theme: "dark".to_string(),
            log_upload_service: "paste.rs".to_string(),
            pastebin_api_key: None,
        }
    }
}

pub struct ConfigState {
    pub config: Mutex<LauncherConfig>,
    pub file_path: PathBuf,
}

impl ConfigState {
    pub fn new(app_handle: &AppHandle) -> Self {
        let app_dir = app_handle.path().app_data_dir().unwrap();
        let config_path = app_dir.join("config.json");

        let config = if config_path.exists() {
            let content = fs::read_to_string(&config_path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            LauncherConfig::default()
        };

        Self {
            config: Mutex::new(config),
            file_path: config_path,
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let config = self.config.lock().unwrap();
        let content = serde_json::to_string_pretty(&*config).map_err(|e| e.to_string())?;
        fs::create_dir_all(self.file_path.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::write(&self.file_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }
}

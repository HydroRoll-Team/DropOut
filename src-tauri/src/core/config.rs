use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "config.ts")]
#[serde(default)]
pub struct AssistantConfig {
    pub enabled: bool,
    pub llm_provider: String, // "ollama" or "openai"
    // Ollama settings
    pub ollama_endpoint: String,
    pub ollama_model: String,
    // OpenAI settings
    pub openai_api_key: Option<String>,
    pub openai_endpoint: String,
    pub openai_model: String,
    // Common settings
    pub system_prompt: String,
    pub response_language: String,
    // TTS settings
    pub tts_enabled: bool,
    pub tts_provider: String, // "disabled", "piper", "edge"
}

impl Default for AssistantConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            llm_provider: "ollama".to_string(),
            ollama_endpoint: "http://localhost:11434".to_string(),
            ollama_model: "llama3".to_string(),
            openai_api_key: None,
            openai_endpoint: "https://api.openai.com/v1".to_string(),
            openai_model: "gpt-3.5-turbo".to_string(),
            system_prompt: "You are a helpful Minecraft expert assistant. You help players with game issues, mod installation, performance optimization, and gameplay tips. Analyze any game logs provided and give concise, actionable advice.".to_string(),
            response_language: "auto".to_string(),
            tts_enabled: false,
            tts_provider: "disabled".to_string(),
        }
    }
}

/// Feature-gated arguments configuration
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "config.ts")]
#[serde(default)]
pub struct FeatureFlags {
    /// Demo user: enables demo-related arguments when rules require it
    pub demo_user: bool,
    /// Quick Play: enable quick play arguments
    pub quick_play_enabled: bool,
    /// Quick Play singleplayer world path (if provided)
    pub quick_play_path: Option<String>,
    /// Quick Play singleplayer flag
    pub quick_play_singleplayer: bool,
    /// Quick Play multiplayer server address (optional)
    pub quick_play_multiplayer_server: Option<String>,
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self {
            demo_user: false,
            quick_play_enabled: false,
            quick_play_path: None,
            quick_play_singleplayer: true,
            quick_play_multiplayer_server: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "config.ts")]
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
    pub assistant: AssistantConfig,
    // Storage management
    pub use_shared_caches: bool, // Use global shared versions/libraries/assets
    pub keep_legacy_per_instance_storage: bool, // Keep old per-instance caches (no migration)
    // Feature-gated argument flags
    pub feature_flags: FeatureFlags,
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
            assistant: AssistantConfig::default(),
            use_shared_caches: false,
            keep_legacy_per_instance_storage: true,
            feature_flags: FeatureFlags::default(),
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

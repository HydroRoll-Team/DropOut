//! Instance/Profile management module.
//!
//! This module provides functionality to:
//! - Create and manage multiple isolated game instances
//! - Each instance has its own versions, libraries, assets, mods, and saves
//! - Support for instance switching and isolation

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Represents a game instance/profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub id: String,                         // 唯一标识符（UUID）
    pub name: String,                       // 显示名称
    pub game_dir: PathBuf,                  // 游戏目录路径
    pub version_id: Option<String>,         // 当前选择的版本ID
    pub created_at: i64,                    // 创建时间戳
    pub last_played: Option<i64>,           // 最后游玩时间
    pub icon_path: Option<String>,          // 图标路径（可选）
    pub notes: Option<String>,              // 备注（可选）
    pub mod_loader: Option<String>,         // 模组加载器类型："fabric", "forge", "vanilla"
    pub mod_loader_version: Option<String>, // 模组加载器版本
}

/// Configuration for all instances
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InstanceConfig {
    pub instances: Vec<Instance>,
    pub active_instance_id: Option<String>, // 当前活动的实例ID
}

/// State management for instances
pub struct InstanceState {
    pub instances: Mutex<InstanceConfig>,
    pub file_path: PathBuf,
}

impl InstanceState {
    /// Create a new InstanceState
    pub fn new(app_handle: &AppHandle) -> Self {
        let app_dir = app_handle.path().app_data_dir().unwrap();
        let file_path = app_dir.join("instances.json");

        let config = if file_path.exists() {
            let content = fs::read_to_string(&file_path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_else(|_| InstanceConfig::default())
        } else {
            InstanceConfig::default()
        };

        Self {
            instances: Mutex::new(config),
            file_path,
        }
    }

    /// Save the instance configuration to disk
    pub fn save(&self) -> Result<(), String> {
        let config = self.instances.lock().unwrap();
        let content = serde_json::to_string_pretty(&*config).map_err(|e| e.to_string())?;
        fs::create_dir_all(self.file_path.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::write(&self.file_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Create a new instance
    pub fn create_instance(
        &self,
        name: String,
        app_handle: &AppHandle,
    ) -> Result<Instance, String> {
        let app_dir = app_handle.path().app_data_dir().unwrap();
        let instance_id = uuid::Uuid::new_v4().to_string();
        let instance_dir = app_dir.join("instances").join(&instance_id);
        let game_dir = instance_dir.clone();

        // Create instance directory structure
        fs::create_dir_all(&instance_dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("versions")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("libraries")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("assets")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("mods")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("config")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("saves")).map_err(|e| e.to_string())?;

        let instance = Instance {
            id: instance_id.clone(),
            name,
            game_dir,
            version_id: None,
            created_at: chrono::Utc::now().timestamp(),
            last_played: None,
            icon_path: None,
            notes: None,
            mod_loader: Some("vanilla".to_string()),
            mod_loader_version: None,
        };

        let mut config = self.instances.lock().unwrap();
        config.instances.push(instance.clone());

        // If this is the first instance, set it as active
        if config.active_instance_id.is_none() {
            config.active_instance_id = Some(instance_id);
        }

        drop(config);
        self.save()?;

        Ok(instance)
    }

    /// Delete an instance
    pub fn delete_instance(&self, id: &str) -> Result<(), String> {
        let mut config = self.instances.lock().unwrap();

        // Find the instance
        let instance_index = config
            .instances
            .iter()
            .position(|i| i.id == id)
            .ok_or_else(|| format!("Instance {} not found", id))?;

        let instance = config.instances[instance_index].clone();

        // Remove from list
        config.instances.remove(instance_index);

        // If this was the active instance, clear or set another as active
        if config.active_instance_id.as_ref() == Some(&id.to_string()) {
            config.active_instance_id = config.instances.first().map(|i| i.id.clone());
        }

        drop(config);
        self.save()?;

        // Delete the instance directory
        if instance.game_dir.exists() {
            fs::remove_dir_all(&instance.game_dir)
                .map_err(|e| format!("Failed to delete instance directory: {}", e))?;
        }

        Ok(())
    }

    /// Update an instance
    pub fn update_instance(&self, instance: Instance) -> Result<(), String> {
        let mut config = self.instances.lock().unwrap();

        let index = config
            .instances
            .iter()
            .position(|i| i.id == instance.id)
            .ok_or_else(|| format!("Instance {} not found", instance.id))?;

        config.instances[index] = instance;
        drop(config);
        self.save()?;

        Ok(())
    }

    /// Get an instance by ID
    pub fn get_instance(&self, id: &str) -> Option<Instance> {
        let config = self.instances.lock().unwrap();
        config.instances.iter().find(|i| i.id == id).cloned()
    }

    /// List all instances
    pub fn list_instances(&self) -> Vec<Instance> {
        let config = self.instances.lock().unwrap();
        config.instances.clone()
    }

    /// Set the active instance
    pub fn set_active_instance(&self, id: &str) -> Result<(), String> {
        let mut config = self.instances.lock().unwrap();

        // Verify the instance exists
        if !config.instances.iter().any(|i| i.id == id) {
            return Err(format!("Instance {} not found", id));
        }

        config.active_instance_id = Some(id.to_string());
        drop(config);
        self.save()?;

        Ok(())
    }

    /// Get the active instance
    pub fn get_active_instance(&self) -> Option<Instance> {
        let config = self.instances.lock().unwrap();
        config
            .active_instance_id
            .as_ref()
            .and_then(|id| config.instances.iter().find(|i| i.id == *id))
            .cloned()
    }

    /// Get the game directory for an instance
    pub fn get_instance_game_dir(&self, id: &str) -> Option<PathBuf> {
        self.get_instance(id).map(|i| i.game_dir)
    }

    /// Duplicate an instance
    pub fn duplicate_instance(
        &self,
        id: &str,
        new_name: String,
        app_handle: &AppHandle,
    ) -> Result<Instance, String> {
        let source_instance = self
            .get_instance(id)
            .ok_or_else(|| format!("Instance {} not found", id))?;

        // Create new instance
        let mut new_instance = self.create_instance(new_name, app_handle)?;

        // Copy instance properties
        new_instance.version_id = source_instance.version_id.clone();
        new_instance.mod_loader = source_instance.mod_loader.clone();
        new_instance.mod_loader_version = source_instance.mod_loader_version.clone();
        new_instance.notes = source_instance.notes.clone();

        // Copy directory contents
        if source_instance.game_dir.exists() {
            copy_dir_all(&source_instance.game_dir, &new_instance.game_dir)
                .map_err(|e| format!("Failed to copy instance directory: {}", e))?;
        }

        self.update_instance(new_instance.clone())?;

        Ok(new_instance)
    }
}

/// Copy a directory recursively
fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), std::io::Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

/// Migrate legacy data to instance system
pub fn migrate_legacy_data(
    app_handle: &AppHandle,
    instance_state: &InstanceState,
) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let old_versions_dir = app_dir.join("versions");
    let old_libraries_dir = app_dir.join("libraries");
    let old_assets_dir = app_dir.join("assets");

    // Check if legacy data exists
    let has_legacy_data =
        old_versions_dir.exists() || old_libraries_dir.exists() || old_assets_dir.exists();

    if !has_legacy_data {
        return Ok(()); // No legacy data to migrate
    }

    // Check if instances already exist
    let config = instance_state.instances.lock().unwrap();
    if !config.instances.is_empty() {
        drop(config);
        return Ok(()); // Already have instances, skip migration
    }
    drop(config);

    // Create default instance
    let default_instance = instance_state
        .create_instance("Default".to_string(), app_handle)
        .map_err(|e| format!("Failed to create default instance: {}", e))?;

    let new_versions_dir = default_instance.game_dir.join("versions");
    let new_libraries_dir = default_instance.game_dir.join("libraries");
    let new_assets_dir = default_instance.game_dir.join("assets");

    // Move legacy data
    if old_versions_dir.exists() {
        if new_versions_dir.exists() {
            // Merge directories
            copy_dir_all(&old_versions_dir, &new_versions_dir)
                .map_err(|e| format!("Failed to migrate versions: {}", e))?;
        } else {
            fs::rename(&old_versions_dir, &new_versions_dir)
                .map_err(|e| format!("Failed to migrate versions: {}", e))?;
        }
    }

    if old_libraries_dir.exists() {
        if new_libraries_dir.exists() {
            copy_dir_all(&old_libraries_dir, &new_libraries_dir)
                .map_err(|e| format!("Failed to migrate libraries: {}", e))?;
        } else {
            fs::rename(&old_libraries_dir, &new_libraries_dir)
                .map_err(|e| format!("Failed to migrate libraries: {}", e))?;
        }
    }

    if old_assets_dir.exists() {
        if new_assets_dir.exists() {
            copy_dir_all(&old_assets_dir, &new_assets_dir)
                .map_err(|e| format!("Failed to migrate assets: {}", e))?;
        } else {
            fs::rename(&old_assets_dir, &new_assets_dir)
                .map_err(|e| format!("Failed to migrate assets: {}", e))?;
        }
    }

    Ok(())
}

//! Instance/Profile management module.
//!
//! This module provides functionality to:
//! - Create and manage multiple isolated game instances
//! - Each instance has its own versions, libraries, assets, mods, and saves
//! - Support for instance switching and isolation

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
    pub jvm_args_override: Option<String>,  // JVM参数覆盖（可选）
    #[serde(default)]
    pub memory_override: Option<MemoryOverride>, // 内存设置覆盖（可选）
}

/// Memory settings override for an instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryOverride {
    pub min: u32, // MB
    pub max: u32, // MB
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
            jvm_args_override: None,
            memory_override: None,
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

        // Prepare new instance metadata (but don't save yet)
        let new_id = uuid::Uuid::new_v4().to_string();
        let instances_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("instances");
        let new_game_dir = instances_dir.join(&new_id);

        // Copy directory FIRST - if this fails, don't create metadata
        if source_instance.game_dir.exists() {
            copy_dir_all(&source_instance.game_dir, &new_game_dir)
                .map_err(|e| format!("Failed to copy instance directory: {}", e))?;
        } else {
            // If source dir doesn't exist, create new empty game dir
            std::fs::create_dir_all(&new_game_dir)
                .map_err(|e| format!("Failed to create instance directory: {}", e))?;
        }

        // NOW create metadata and save
        let new_instance = Instance {
            id: new_id,
            name: new_name,
            game_dir: new_game_dir,
            version_id: source_instance.version_id.clone(),
            mod_loader: source_instance.mod_loader.clone(),
            mod_loader_version: source_instance.mod_loader_version.clone(),
            notes: source_instance.notes.clone(),
            icon_path: source_instance.icon_path.clone(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
            last_played: None,
            jvm_args_override: source_instance.jvm_args_override.clone(),
            memory_override: source_instance.memory_override.clone(),
        };

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

/// Migrate instance caches to shared global caches
///
/// This function deduplicates versions, libraries, and assets from all instances
/// into a global shared cache. It prefers hard links (instant, zero-copy) and
/// falls back to copying if hard links are not supported.
///
/// # Arguments
/// * `app_handle` - Tauri app handle
/// * `instance_state` - Instance state management
///
/// # Returns
/// * `Ok((moved_count, hardlink_count, copy_count, saved_bytes))` on success
/// * `Err(String)` on failure
pub fn migrate_to_shared_caches(
    app_handle: &AppHandle,
    instance_state: &InstanceState,
) -> Result<(usize, usize, usize, u64), String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();

    // Global shared cache directories
    let global_versions = app_dir.join("versions");
    let global_libraries = app_dir.join("libraries");
    let global_assets = app_dir.join("assets");

    // Create global cache directories
    std::fs::create_dir_all(&global_versions).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&global_libraries).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&global_assets).map_err(|e| e.to_string())?;

    let mut total_moved = 0;
    let mut hardlink_count = 0;
    let mut copy_count = 0;
    let mut saved_bytes = 0u64;

    // Get all instances
    let instances = instance_state.list_instances();

    for instance in instances {
        let instance_versions = instance.game_dir.join("versions");
        let instance_libraries = instance.game_dir.join("libraries");
        let instance_assets = instance.game_dir.join("assets");

        // Migrate versions
        if instance_versions.exists() {
            let (moved, hardlinks, copies, bytes) =
                deduplicate_directory(&instance_versions, &global_versions)?;
            total_moved += moved;
            hardlink_count += hardlinks;
            copy_count += copies;
            saved_bytes += bytes;
        }

        // Migrate libraries
        if instance_libraries.exists() {
            let (moved, hardlinks, copies, bytes) =
                deduplicate_directory(&instance_libraries, &global_libraries)?;
            total_moved += moved;
            hardlink_count += hardlinks;
            copy_count += copies;
            saved_bytes += bytes;
        }

        // Migrate assets
        if instance_assets.exists() {
            let (moved, hardlinks, copies, bytes) =
                deduplicate_directory(&instance_assets, &global_assets)?;
            total_moved += moved;
            hardlink_count += hardlinks;
            copy_count += copies;
            saved_bytes += bytes;
        }
    }

    Ok((total_moved, hardlink_count, copy_count, saved_bytes))
}

/// Deduplicate a directory tree into a global cache
///
/// Recursively processes all files, checking SHA1 hashes for deduplication.
/// Returns (total_moved, hardlink_count, copy_count, saved_bytes)
fn deduplicate_directory(
    source_dir: &Path,
    dest_dir: &Path,
) -> Result<(usize, usize, usize, u64), String> {
    let mut moved = 0;
    let mut hardlinks = 0;
    let mut copies = 0;
    let mut saved_bytes = 0u64;

    // Build a hash map of existing files in dest (hash -> path)
    let mut dest_hashes: HashMap<String, PathBuf> = HashMap::new();
    if dest_dir.exists() {
        index_directory_hashes(dest_dir, dest_dir, &mut dest_hashes)?;
    }

    // Process source directory
    process_directory_for_migration(
        source_dir,
        source_dir,
        dest_dir,
        &dest_hashes,
        &mut moved,
        &mut hardlinks,
        &mut copies,
        &mut saved_bytes,
    )?;

    Ok((moved, hardlinks, copies, saved_bytes))
}

/// Index all files in a directory by their SHA1 hash
fn index_directory_hashes(
    dir: &Path,
    base: &Path,
    hashes: &mut HashMap<String, PathBuf>,
) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }

    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            index_directory_hashes(&path, base, hashes)?;
        } else if path.is_file() {
            let hash = compute_file_sha1(&path)?;
            hashes.insert(hash, path);
        }
    }

    Ok(())
}

/// Process directory for migration (recursive)
fn process_directory_for_migration(
    current: &Path,
    source_base: &Path,
    dest_base: &Path,
    dest_hashes: &HashMap<String, PathBuf>,
    moved: &mut usize,
    hardlinks: &mut usize,
    copies: &mut usize,
    saved_bytes: &mut u64,
) -> Result<(), String> {
    if !current.is_dir() {
        return Ok(());
    }

    for entry in std::fs::read_dir(current).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let source_path = entry.path();

        // Compute relative path
        let rel_path = source_path
            .strip_prefix(source_base)
            .map_err(|e| e.to_string())?;
        let dest_path = dest_base.join(rel_path);

        if source_path.is_dir() {
            // Recurse into subdirectory
            process_directory_for_migration(
                &source_path,
                source_base,
                dest_base,
                dest_hashes,
                moved,
                hardlinks,
                copies,
                saved_bytes,
            )?;
        } else if source_path.is_file() {
            let file_size = std::fs::metadata(&source_path)
                .map(|m| m.len())
                .unwrap_or(0);

            // Compute file hash
            let source_hash = compute_file_sha1(&source_path)?;

            // Check if file already exists in dest with same hash
            if let Some(_existing) = dest_hashes.get(&source_hash) {
                // File exists, delete source (already deduplicated)
                std::fs::remove_file(&source_path).map_err(|e| e.to_string())?;
                *saved_bytes += file_size;
                *moved += 1;
            } else {
                // File doesn't exist, move it
                // Create parent directory in dest
                if let Some(parent) = dest_path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }

                // Try hard link first
                if std::fs::hard_link(&source_path, &dest_path).is_ok() {
                    // Hard link succeeded, remove source
                    std::fs::remove_file(&source_path).map_err(|e| e.to_string())?;
                    *hardlinks += 1;
                    *moved += 1;
                } else {
                    // Hard link failed (different filesystem?), copy instead
                    std::fs::copy(&source_path, &dest_path).map_err(|e| e.to_string())?;
                    std::fs::remove_file(&source_path).map_err(|e| e.to_string())?;
                    *copies += 1;
                    *moved += 1;
                }
            }
        }
    }

    Ok(())
}

/// Compute SHA1 hash of a file
fn compute_file_sha1(path: &Path) -> Result<String, String> {
    use sha1::{Digest, Sha1};

    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha1::new();
    hasher.update(&data);
    Ok(hex::encode(hasher.finalize()))
}

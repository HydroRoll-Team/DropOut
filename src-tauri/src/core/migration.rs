use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct DetectedLauncher {
    pub launcher_type: String,
    pub instances_dir: PathBuf,
    pub instance_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct ImportableInstance {
    pub source_path: PathBuf,
    pub name: String,
    pub minecraft_version: Option<String>,
    pub mod_loader: Option<String>,
    pub mod_loader_version: Option<String>,
}

/// Scan common launcher install paths and return detected launchers.
pub fn detect_launchers() -> Vec<DetectedLauncher> {
    let candidates = launcher_candidates();
    candidates
        .into_iter()
        .filter_map(|(launcher_type, path)| {
            if !path.is_dir() {
                return None;
            }
            let count = count_instances(&path);
            if count == 0 {
                return None;
            }
            Some(DetectedLauncher {
                launcher_type,
                instances_dir: path,
                instance_count: count,
            })
        })
        .collect()
}

/// Scan a launcher's instances directory and parse each instance's metadata.
pub fn scan_instances(instances_dir: &Path) -> Result<Vec<ImportableInstance>, String> {
    let entries = fs::read_dir(instances_dir).map_err(|e| e.to_string())?;
    let mut result = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let cfg_path = path.join("instance.cfg");
        if !cfg_path.exists() {
            continue;
        }

        let cfg = fs::read_to_string(&cfg_path).unwrap_or_default();
        let name = cfg_value(&cfg, "name")
            .unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());

        let (mc_version, mod_loader, mod_loader_version) =
            match fs::read_to_string(path.join("mmc-pack.json")) {
                Ok(content) => {
                    let json: serde_json::Value =
                        serde_json::from_str(&content).unwrap_or_default();
                    parse_mmc_components(&json)
                }
                Err(_) => (cfg_value(&cfg, "IntendedVersion"), None, None),
            };

        result.push(ImportableInstance {
            source_path: path,
            name,
            minecraft_version: mc_version,
            mod_loader,
            mod_loader_version,
        });
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

/// Copy a launcher instance's game files into a DropOut game directory.
pub fn copy_instance_files(source_path: &Path, dest_game_dir: &Path) -> Result<(), String> {
    // MultiMC/Prism keep game files in .minecraft/ or minecraft/
    let game_src = if source_path.join(".minecraft").is_dir() {
        source_path.join(".minecraft")
    } else if source_path.join("minecraft").is_dir() {
        source_path.join("minecraft")
    } else {
        // Fallback: copy everything except instance.cfg and mmc-pack.json
        source_path.to_path_buf()
    };

    copy_dir_recursive(&game_src, dest_game_dir)
}

// --- Helpers ---

fn cfg_value(content: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}=");
    content
        .lines()
        .find_map(|line| Some(line.strip_prefix(&prefix)?.trim().to_string()))
}

fn parse_mmc_components(
    json: &serde_json::Value,
) -> (Option<String>, Option<String>, Option<String>) {
    let mut mc_version = None;
    let mut mod_loader = None;
    let mut mod_loader_version = None;

    for component in json["components"].as_array().into_iter().flatten() {
        let version = component["version"].as_str().map(String::from);
        match component["uid"].as_str().unwrap_or("") {
            "net.minecraft" => mc_version = version,
            "net.minecraftforge" => {
                mod_loader = Some("forge".into());
                mod_loader_version = version;
            }
            "net.neoforged" => {
                mod_loader = Some("neoforge".into());
                mod_loader_version = version;
            }
            "net.fabricmc.fabric-loader" => {
                mod_loader = Some("fabric".into());
                mod_loader_version = version;
            }
            "org.quiltmc.quilt-loader" => {
                mod_loader = Some("quilt".into());
                mod_loader_version = version;
            }
            _ => {}
        }
    }

    (mc_version, mod_loader, mod_loader_version)
}

fn count_instances(dir: &Path) -> usize {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().join("instance.cfg").exists())
                .count()
        })
        .unwrap_or(0)
}

fn launcher_candidates() -> Vec<(String, PathBuf)> {
    let mut candidates = Vec::new();
    if let Some(home) = dirs::home_dir() {
        #[cfg(target_os = "linux")]
        {
            let share = home.join(".local/share");
            candidates.push(("prism".into(), share.join("PrismLauncher/instances")));
            candidates.push(("multimc".into(), share.join("multimc/instances")));
            candidates.push(("multimc".into(), share.join("MultiMC/instances")));
        }

        #[cfg(target_os = "macos")]
        {
            let support = home.join("Library/Application Support");
            candidates.push(("prism".into(), support.join("PrismLauncher/instances")));
            candidates.push(("multimc".into(), support.join("MultiMC/instances")));
        }

        #[cfg(target_os = "windows")]
        {
            if let Some(appdata) = dirs::data_dir() {
                candidates.push(("prism".into(), appdata.join("PrismLauncher/instances")));
            }
            if let Some(roaming) = dirs::config_dir() {
                candidates.push(("multimc".into(), roaming.join("MultiMC/instances")));
            }
        }
    }
    candidates
}

pub fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

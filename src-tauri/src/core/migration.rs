use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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
    pub game_dir: PathBuf,
    pub launcher_type: String,
    pub source_kind: String,
    pub version_id: Option<String>,
    pub name: String,
    pub minecraft_version: Option<String>,
    pub mod_loader: Option<String>,
    pub mod_loader_version: Option<String>,
}

/// Scan common launcher install paths and return detected launchers.
pub fn detect_launchers() -> Vec<DetectedLauncher> {
    let candidates = launcher_candidates();
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter_map(|(launcher_type, path)| {
            if !seen.insert((launcher_type.clone(), path.clone())) {
                return None;
            }
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
    let mut result = Vec::new();
    let mut seen = HashSet::new();

    push_if_importable(instances_dir, &mut seen, &mut result);

    let entries = fs::read_dir(instances_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        push_if_importable(&path, &mut seen, &mut result);

        if path.join("versions").is_dir() {
            scan_minecraft_versions(&path, &mut seen, &mut result);
        }
    }

    if instances_dir.join("versions").is_dir() {
        scan_minecraft_versions(instances_dir, &mut seen, &mut result);
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

pub fn import_metadata(source_path: &Path) -> ImportableInstance {
    parse_importable(source_path).unwrap_or_else(|| {
        let name = source_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Imported".to_string());
        ImportableInstance {
            source_path: source_path.to_path_buf(),
            game_dir: source_path.to_path_buf(),
            launcher_type: "custom".into(),
            source_kind: "directory".into(),
            version_id: None,
            name,
            minecraft_version: None,
            mod_loader: None,
            mod_loader_version: None,
        }
    })
}

fn push_if_importable(
    path: &Path,
    seen: &mut HashSet<PathBuf>,
    result: &mut Vec<ImportableInstance>,
) {
    if let Some(instance) = parse_importable(path) {
        if seen.insert(instance.source_path.clone()) {
            result.push(instance);
        }
    }
}

fn parse_importable(path: &Path) -> Option<ImportableInstance> {
    if path.join("instance.cfg").exists() || path.join("mmc-pack.json").exists() {
        return Some(parse_multimc_instance(path));
    }

    parse_minecraft_version_dir(path)
}

/// Copy a launcher instance's game files into a DropOut game directory.
pub fn copy_instance_files(source_path: &Path, dest_game_dir: &Path) -> Result<(), String> {
    if let Some(version_game_dir) = game_dir_from_version_dir(source_path) {
        copy_minecraft_game_files(&version_game_dir, dest_game_dir)?;
        return copy_selected_version_dir(source_path, dest_game_dir);
    }

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

fn parse_multimc_instance(path: &Path) -> ImportableInstance {
    let cfg = fs::read_to_string(path.join("instance.cfg")).unwrap_or_default();
    let name = cfg_value(&cfg, "name").unwrap_or_else(|| {
        path.file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "Imported".to_string())
    });

    let (mc_version, mod_loader, mod_loader_version) =
        match fs::read_to_string(path.join("mmc-pack.json")) {
            Ok(content) => {
                let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
                parse_mmc_components(&json)
            }
            Err(_) => (cfg_value(&cfg, "IntendedVersion"), None, None),
        };

    ImportableInstance {
        source_path: path.to_path_buf(),
        game_dir: multimc_game_dir(path),
        launcher_type: launcher_type_for_instance(path),
        source_kind: "instance".into(),
        version_id: mc_version.clone(),
        name,
        minecraft_version: mc_version,
        mod_loader,
        mod_loader_version,
    }
}

fn parse_minecraft_version_dir(path: &Path) -> Option<ImportableInstance> {
    let version_id = path.file_name()?.to_string_lossy().to_string();
    let version_json = path.join(format!("{version_id}.json"));
    if !version_json.exists() {
        return None;
    }

    let game_dir = game_dir_from_version_dir(path)?;
    let content = fs::read_to_string(&version_json).unwrap_or_default();
    let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
    let (minecraft_version, mod_loader, mod_loader_version) =
        parse_version_json_metadata(&version_id, &json);
    let launcher_type = launcher_type_for_game_dir(&game_dir);

    Some(ImportableInstance {
        source_path: path.to_path_buf(),
        game_dir,
        launcher_type,
        source_kind: "version".into(),
        version_id: Some(version_id.clone()),
        name: version_id,
        minecraft_version,
        mod_loader,
        mod_loader_version,
    })
}

fn scan_minecraft_versions(
    game_dir: &Path,
    seen: &mut HashSet<PathBuf>,
    result: &mut Vec<ImportableInstance>,
) {
    let versions_dir = game_dir.join("versions");
    let Ok(entries) = fs::read_dir(versions_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        push_if_importable(&path, seen, result);
    }
}

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

fn parse_version_json_metadata(
    version_id: &str,
    json: &serde_json::Value,
) -> (Option<String>, Option<String>, Option<String>) {
    let minecraft_version = json["inheritsFrom"]
        .as_str()
        .or_else(|| json["id"].as_str())
        .map(String::from);

    let mut mod_loader = None;
    let mut mod_loader_version = None;
    let id_lower = version_id.to_lowercase();

    if id_lower.contains("fabric") {
        mod_loader = Some("fabric".into());
    } else if id_lower.contains("forge") {
        mod_loader = Some("forge".into());
    } else if id_lower.contains("neoforge") || id_lower.contains("neo-forge") {
        mod_loader = Some("neoforge".into());
    } else if id_lower.contains("quilt") {
        mod_loader = Some("quilt".into());
    }

    for library in json["libraries"].as_array().into_iter().flatten() {
        let Some(name) = library["name"].as_str() else {
            continue;
        };

        if name.starts_with("net.fabricmc:fabric-loader:") {
            mod_loader = Some("fabric".into());
            mod_loader_version = name.split(':').nth(2).map(String::from);
        } else if name.starts_with("net.minecraftforge:forge:") {
            mod_loader = Some("forge".into());
            mod_loader_version = name.split(':').nth(2).map(String::from);
        } else if name.starts_with("net.neoforged:neoforge:") {
            mod_loader = Some("neoforge".into());
            mod_loader_version = name.split(':').nth(2).map(String::from);
        } else if name.starts_with("org.quiltmc:quilt-loader:") {
            mod_loader = Some("quilt".into());
            mod_loader_version = name.split(':').nth(2).map(String::from);
        }
    }

    (minecraft_version, mod_loader, mod_loader_version)
}

fn multimc_game_dir(path: &Path) -> PathBuf {
    if path.join(".minecraft").is_dir() {
        path.join(".minecraft")
    } else if path.join("minecraft").is_dir() {
        path.join("minecraft")
    } else {
        path.to_path_buf()
    }
}

fn game_dir_from_version_dir(path: &Path) -> Option<PathBuf> {
    let versions = path.parent()?;
    if versions.file_name()? != "versions" {
        return None;
    }
    versions.parent().map(Path::to_path_buf)
}

fn launcher_type_for_instance(path: &Path) -> String {
    path.ancestors()
        .find_map(|ancestor| {
            ancestor
                .file_name()
                .map(|name| name.to_string_lossy().to_lowercase())
        })
        .and_then(|name| {
            if name.contains("prism") {
                Some("prism".to_string())
            } else if name.contains("multimc") {
                Some("multimc".to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "multimc-compatible".into())
}

fn launcher_type_for_game_dir(path: &Path) -> String {
    let normalized = path.to_string_lossy().to_lowercase();
    if normalized.contains("hmcl") {
        "hmcl".into()
    } else if normalized.contains("pcl") || normalized.contains("plain craft") {
        "pcl".into()
    } else {
        "pcl-hmcl".into()
    }
}

fn count_instances(dir: &Path) -> usize {
    scan_instances(dir)
        .map(|instances| instances.len())
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
            candidates.push(("pcl-hmcl".into(), home.join(".minecraft")));
            candidates.push(("hmcl".into(), home.join(".hmcl")));
        }

        #[cfg(target_os = "macos")]
        {
            let support = home.join("Library/Application Support");
            candidates.push(("prism".into(), support.join("PrismLauncher/instances")));
            candidates.push(("multimc".into(), support.join("MultiMC/instances")));
            candidates.push(("pcl-hmcl".into(), support.join("minecraft")));
            candidates.push(("hmcl".into(), support.join("HMCL")));
        }

        #[cfg(target_os = "windows")]
        {
            if let Some(appdata) = dirs::data_dir() {
                candidates.push(("prism".into(), appdata.join("PrismLauncher/instances")));
                candidates.push(("pcl-hmcl".into(), appdata.join(".minecraft")));
                candidates.push(("hmcl".into(), appdata.join("HMCL")));
            }
            if let Some(roaming) = dirs::config_dir() {
                candidates.push(("multimc".into(), roaming.join("MultiMC/instances")));
                candidates.push(("pcl-hmcl".into(), roaming.join(".minecraft")));
            }
        }
    }
    candidates
}

fn copy_minecraft_game_files(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    const DIRS: &[&str] = &[
        "config",
        "journeymap",
        "mods",
        "replay_recordings",
        "resourcepacks",
        "saves",
        "screenshots",
        "server-resource-packs",
        "shaderpacks",
        "schematics",
        "texturepacks",
    ];
    const FILES: &[&str] = &[
        "options.txt",
        "optionsof.txt",
        "optionsshaders.txt",
        "servers.dat",
        "servers.dat_old",
        "icon.png",
    ];

    for dir in DIRS {
        let src_path = src.join(dir);
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst.join(dir))?;
        }
    }

    for file in FILES {
        let src_path = src.join(file);
        if src_path.is_file() {
            fs::copy(&src_path, dst.join(file)).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn copy_selected_version_dir(version_dir: &Path, dest_game_dir: &Path) -> Result<(), String> {
    let Some(version_id) = version_dir.file_name() else {
        return Ok(());
    };

    let dest_version_dir = dest_game_dir.join("versions").join(version_id);
    copy_dir_recursive(version_dir, &dest_version_dir)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("dropout-migration-{name}-{suffix}"));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn scans_multimc_instances() {
        let root = test_dir("multimc");
        let instance = root.join("DemoPack");
        fs::create_dir_all(instance.join(".minecraft/mods")).unwrap();
        fs::write(instance.join("instance.cfg"), "name=Demo Pack\n").unwrap();
        fs::write(
            instance.join("mmc-pack.json"),
            r#"{"components":[{"uid":"net.minecraft","version":"1.20.1"},{"uid":"net.fabricmc.fabric-loader","version":"0.16.9"}]}"#,
        )
        .unwrap();

        let scanned = scan_instances(&root).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].name, "Demo Pack");
        assert_eq!(scanned[0].minecraft_version.as_deref(), Some("1.20.1"));
        assert_eq!(scanned[0].mod_loader.as_deref(), Some("fabric"));
        assert_eq!(scanned[0].mod_loader_version.as_deref(), Some("0.16.9"));
    }

    #[test]
    fn scans_minecraft_version_directories_for_pcl_hmcl_style_imports() {
        let root = test_dir("minecraft");
        let version = root.join("versions/1.20.1-forge-47.4.0");
        fs::create_dir_all(&version).unwrap();
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::write(
            version.join("1.20.1-forge-47.4.0.json"),
            r#"{"id":"1.20.1-forge-47.4.0","inheritsFrom":"1.20.1","libraries":[{"name":"net.minecraftforge:forge:1.20.1-47.4.0"}]}"#,
        )
        .unwrap();

        let scanned = scan_instances(&root).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].source_kind, "version");
        assert_eq!(scanned[0].launcher_type, "pcl-hmcl");
        assert_eq!(
            scanned[0].version_id.as_deref(),
            Some("1.20.1-forge-47.4.0")
        );
        assert_eq!(scanned[0].minecraft_version.as_deref(), Some("1.20.1"));
        assert_eq!(scanned[0].mod_loader.as_deref(), Some("forge"));
        assert_eq!(
            scanned[0].mod_loader_version.as_deref(),
            Some("1.20.1-47.4.0")
        );
    }

    #[test]
    fn classifies_version_imports_from_game_dir_not_version_id() {
        let root = test_dir("generic-minecraft");
        let version = root.join("versions/hmcl-labelled-version");
        fs::create_dir_all(&version).unwrap();
        fs::write(
            version.join("hmcl-labelled-version.json"),
            r#"{"id":"hmcl-labelled-version"}"#,
        )
        .unwrap();

        let scanned = scan_instances(&root).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert_eq!(scanned.len(), 1);
        assert_eq!(scanned[0].launcher_type, "pcl-hmcl");
    }

    #[test]
    fn copies_user_game_files_and_selected_version_from_minecraft_directories() {
        let root = test_dir("copy-source");
        let version = root.join("versions/1.21.1");
        let dest = test_dir("copy-dest");
        fs::create_dir_all(&version).unwrap();
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::create_dir_all(root.join("libraries")).unwrap();
        fs::write(version.join("1.21.1.json"), r#"{"id":"1.21.1"}"#).unwrap();
        fs::write(root.join("mods/demo.jar"), "demo").unwrap();
        fs::write(root.join("libraries/skip.jar"), "skip").unwrap();
        fs::write(root.join("options.txt"), "options").unwrap();

        copy_instance_files(&version, &dest).unwrap();
        fs::remove_dir_all(&root).unwrap();

        assert!(dest.join("mods/demo.jar").exists());
        assert!(dest.join("options.txt").exists());
        assert!(dest.join("versions/1.21.1/1.21.1.json").exists());
        assert!(!dest.join("libraries/skip.jar").exists());
        fs::remove_dir_all(&dest).unwrap();
    }
}

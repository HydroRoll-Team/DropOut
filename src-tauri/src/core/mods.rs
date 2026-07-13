use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "mods.ts")]
pub struct ModInfo {
    pub file_name: String,
    pub file_path: PathBuf,
    pub enabled: bool,
    pub file_size: u64,
    pub mod_name: Option<String>,
    pub mod_id: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub mod_loader: Option<String>,
}

pub fn scan_mods(game_dir: &Path) -> Result<Vec<ModInfo>, String> {
    let mods_dir = game_dir.join("mods");
    if !mods_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&mods_dir).map_err(|e| e.to_string())?;
    let mut mods = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        let is_jar = name.ends_with(".jar");
        let is_disabled = name.ends_with(".jar.disabled");
        if !is_jar && !is_disabled {
            continue;
        }

        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let meta = read_mod_metadata(&path);

        mods.push(ModInfo {
            file_name: name,
            file_path: path,
            enabled: is_jar && !is_disabled,
            file_size: size,
            mod_name: meta.name,
            mod_id: meta.id,
            version: meta.version,
            description: meta.description,
            mod_loader: meta.loader,
        });
    }

    mods.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));
    Ok(mods)
}

pub fn toggle_mod(game_dir: &Path, file_name: &str) -> Result<ModInfo, String> {
    let mods_dir = game_dir.join("mods");
    let path = mods_dir.join(file_name);
    if !path.exists() {
        return Err(format!("Mod file not found: {}", file_name));
    }

    let new_name = if file_name.ends_with(".jar.disabled") {
        file_name.strip_suffix(".disabled").unwrap().to_string()
    } else if file_name.ends_with(".jar") {
        format!("{}.disabled", file_name)
    } else {
        return Err("Not a mod file".to_string());
    };

    let new_path = mods_dir.join(&new_name);
    fs::rename(&path, &new_path).map_err(|e| e.to_string())?;

    let size = fs::metadata(&new_path).map(|m| m.len()).unwrap_or(0);
    let meta = read_mod_metadata(&new_path);

    Ok(ModInfo {
        file_name: new_name,
        file_path: new_path,
        enabled: !file_name.ends_with(".jar.disabled"),
        file_size: size,
        mod_name: meta.name,
        mod_id: meta.id,
        version: meta.version,
        description: meta.description,
        mod_loader: meta.loader,
    })
}

pub fn delete_mod(game_dir: &Path, file_name: &str) -> Result<(), String> {
    let path = game_dir.join("mods").join(file_name);
    if !path.exists() {
        return Err(format!("Mod file not found: {}", file_name));
    }
    fs::remove_file(&path).map_err(|e| e.to_string())
}

// --- Metadata parsing ---

struct ModMeta {
    name: Option<String>,
    id: Option<String>,
    version: Option<String>,
    description: Option<String>,
    loader: Option<String>,
}

fn read_mod_metadata(path: &Path) -> ModMeta {
    let empty = ModMeta {
        name: None,
        id: None,
        version: None,
        description: None,
        loader: None,
    };

    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return empty,
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return empty,
    };

    // Try Fabric first
    if let Some(meta) = try_fabric_meta(&mut archive) {
        return meta;
    }
    // Try Forge/NeoForge
    if let Some(meta) = try_forge_meta(&mut archive) {
        return meta;
    }
    // Try Quilt
    if let Some(meta) = try_quilt_meta(&mut archive) {
        return meta;
    }

    empty
}

fn read_zip_entry(archive: &mut zip::ZipArchive<fs::File>, name: &str) -> Option<String> {
    let mut entry = archive.by_name(name).ok()?;
    let mut buf = String::new();
    entry.read_to_string(&mut buf).ok()?;
    Some(buf)
}

fn try_fabric_meta(archive: &mut zip::ZipArchive<fs::File>) -> Option<ModMeta> {
    let content = read_zip_entry(archive, "fabric.mod.json")?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    Some(ModMeta {
        name: json["name"].as_str().map(String::from),
        id: json["id"].as_str().map(String::from),
        version: json["version"].as_str().map(String::from),
        description: json["description"].as_str().map(String::from),
        loader: Some("fabric".to_string()),
    })
}

fn try_forge_meta(archive: &mut zip::ZipArchive<fs::File>) -> Option<ModMeta> {
    let content = read_zip_entry(archive, "META-INF/mods.toml")?;
    let table: toml::Value = content.parse().ok()?;
    let mods = table.get("mods")?.as_array()?;
    let first = mods.first()?;
    Some(ModMeta {
        name: first.get("displayName").and_then(|v| v.as_str()).map(String::from),
        id: first.get("modId").and_then(|v| v.as_str()).map(String::from),
        version: first.get("version").and_then(|v| v.as_str()).map(String::from),
        description: first.get("description").and_then(|v| v.as_str()).map(String::from),
        loader: Some("forge".to_string()),
    })
}

fn try_quilt_meta(archive: &mut zip::ZipArchive<fs::File>) -> Option<ModMeta> {
    let content = read_zip_entry(archive, "quilt.mod.json")?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    let loader = json.get("quilt_loader")?;
    Some(ModMeta {
        name: loader.get("metadata").and_then(|m| m["name"].as_str()).map(String::from),
        id: loader["id"].as_str().map(String::from),
        version: loader["version"].as_str().map(String::from),
        description: loader.get("metadata").and_then(|m| m["description"].as_str()).map(String::from),
        loader: Some("quilt".to_string()),
    })
}

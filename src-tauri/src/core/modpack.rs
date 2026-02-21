//! Modpack parsing and extraction module.
//!
//! Supported formats:
//! - Modrinth (.mrpack / zip with `modrinth.index.json`)
//! - CurseForge (zip with `manifest.json`, manifestType = "minecraftModpack")
//! - MultiMC / PrismLauncher (zip with `instance.cfg`)
//!
//! ## Usage
//!
//! ```ignore
//! // 1. Parse modpack → get metadata + file list + override prefixes
//! let pack = modpack::import(&path).await?;
//!
//! // 2. These can run in parallel for Modrinth/CurseForge:
//! //    a) Extract override files (configs, resource packs, etc.)
//! modpack::extract_overrides(&path, &game_dir, &pack.override_prefixes, |cur, total, name| {
//!     println!("Extracting ({cur}/{total}) {name}");
//! })?;
//! //    b) Install Minecraft version — use pack.info.minecraft_version (e.g. "1.20.1")
//! //       → Fetch version manifest, download client jar, assets, libraries.
//! //    c) Install mod loader — use pack.info.mod_loader + mod_loader_version
//! //       → Download loader installer/profile, patch version JSON.
//!
//! // 3. Download mod files (use pack.files)
//! //    Each ModpackFile has url, path (relative to game_dir), sha1, size.
//! //    Partial failure is acceptable — missing mods can be retried on next launch.
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;

type Archive = zip::ZipArchive<fs::File>;

// ── Public types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackInfo {
    pub name: String,
    pub minecraft_version: Option<String>,
    pub mod_loader: Option<String>,
    pub mod_loader_version: Option<String>,
    pub modpack_type: String,
    #[serde(default)]
    pub instance_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackFile {
    pub url: String,
    pub path: String,
    pub size: Option<u64>,
    pub sha1: Option<String>,
}

/// Unified parse result from any modpack format.
pub struct ParsedModpack {
    pub info: ModpackInfo,
    pub files: Vec<ModpackFile>,
    pub override_prefixes: Vec<String>,
}

// ── Public API ────────────────────────────────────────────────────────────

/// Parse a modpack zip and return metadata only (no network, no side effects).
pub fn detect(path: &Path) -> Result<ModpackInfo, String> {
    Ok(parse(path)?.info)
}

/// Parse a modpack zip, resolve download URLs, and return everything needed
/// to complete the installation.
pub async fn import(path: &Path) -> Result<ParsedModpack, String> {
    let mut result = parse(path)?;
    if result.info.modpack_type == "curseforge" {
        result.files = resolve_curseforge_files(&result.files).await?;
    }
    Ok(result)
}

/// Extract override files from the modpack zip into the game directory.
pub fn extract_overrides(
    path: &Path,
    game_dir: &Path,
    override_prefixes: &[String],
    on_progress: impl Fn(usize, usize, &str),
) -> Result<(), String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {e}"))?;

    // Collect which prefixes actually exist
    let all_names: Vec<String> = (0..archive.len())
        .filter_map(|i| Some(archive.by_index_raw(i).ok()?.name().to_string()))
        .collect();
    let prefixes: Vec<&str> = override_prefixes
        .iter()
        .filter(|pfx| all_names.iter().any(|n| n.starts_with(pfx.as_str())))
        .map(|s| s.as_str())
        .collect();

    let strip = |name: &str| -> Option<String> {
        prefixes.iter().find_map(|pfx| {
            let rel = name.strip_prefix(*pfx)?;
            (!rel.is_empty()).then(|| rel.to_string())
        })
    };

    let total = all_names.iter().filter(|n| strip(n).is_some()).count();
    let mut current = 0;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        let Some(relative) = strip(&name) else {
            continue;
        };

        let outpath = game_dir.join(&relative);
        if !outpath.starts_with(game_dir) {
            continue;
        } // path traversal guard

        if entry.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut f = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
        }
        current += 1;
        on_progress(current, total, &relative);
    }
    Ok(())
}

// ── Core parse dispatch ───────────────────────────────────────────────────

type ParserFn = fn(&mut Archive) -> Result<ParsedModpack, String>;

const PARSERS: &[ParserFn] = &[parse_modrinth, parse_curseforge, parse_multimc];

fn parse(path: &Path) -> Result<ParsedModpack, String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {e}"))?;

    for parser in PARSERS {
        if let Ok(result) = parser(&mut archive) {
            return Ok(result);
        }
    }
    Ok(ParsedModpack {
        info: ModpackInfo {
            name: path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Imported Modpack")
                .to_string(),
            minecraft_version: None,
            mod_loader: None,
            mod_loader_version: None,
            modpack_type: "unknown".into(),
            instance_id: None,
        },
        files: vec![],
        override_prefixes: vec![],
    })
}

// ── Format parsers ────────────────────────────────────────────────────────

fn parse_modrinth(archive: &mut Archive) -> Result<ParsedModpack, String> {
    let json = read_json(archive, "modrinth.index.json")?;
    let (mod_loader, mod_loader_version) = parse_modrinth_loader(&json["dependencies"]);

    let files = json["files"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|f| {
                    if f["env"]["client"].as_str() == Some("unsupported") {
                        return None;
                    }
                    let path = f["path"].as_str()?;
                    if path.contains("..") {
                        return None;
                    }
                    Some(ModpackFile {
                        path: path.to_string(),
                        url: f["downloads"].as_array()?.first()?.as_str()?.to_string(),
                        size: f["fileSize"].as_u64(),
                        sha1: f["hashes"]["sha1"].as_str().map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(ParsedModpack {
        info: ModpackInfo {
            name: json["name"].as_str().unwrap_or("Modrinth Modpack").into(),
            minecraft_version: json["dependencies"]["minecraft"].as_str().map(Into::into),
            mod_loader,
            mod_loader_version,
            modpack_type: "modrinth".into(),
            instance_id: None,
        },
        files,
        override_prefixes: vec!["client-overrides/".into(), "overrides/".into()],
    })
}

fn parse_curseforge(archive: &mut Archive) -> Result<ParsedModpack, String> {
    let json = read_json(archive, "manifest.json")?;
    if json["manifestType"].as_str() != Some("minecraftModpack") {
        return Err("not curseforge".into());
    }

    let (loader, loader_ver) = json["minecraft"]["modLoaders"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|ml| ml["primary"].as_bool() == Some(true))
                .or_else(|| arr.first())
        })
        .and_then(|ml| {
            let (l, v) = ml["id"].as_str()?.split_once('-')?;
            Some((Some(l.to_string()), Some(v.to_string())))
        })
        .unwrap_or((None, None));

    let files = json["files"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|f| {
                    Some(ModpackFile {
                        url: format!(
                            "curseforge://{}:{}",
                            f["projectID"].as_u64()?,
                            f["fileID"].as_u64()?
                        ),
                        path: String::new(),
                        size: None,
                        sha1: None,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let overrides = json["overrides"].as_str().unwrap_or("overrides");

    Ok(ParsedModpack {
        info: ModpackInfo {
            name: json["name"].as_str().unwrap_or("CurseForge Modpack").into(),
            minecraft_version: json["minecraft"]["version"].as_str().map(Into::into),
            mod_loader: loader,
            mod_loader_version: loader_ver,
            modpack_type: "curseforge".into(),
            instance_id: None,
        },
        files,
        override_prefixes: vec![format!("{overrides}/")],
    })
}

fn parse_multimc(archive: &mut Archive) -> Result<ParsedModpack, String> {
    let root = find_multimc_root(archive).ok_or("not multimc")?;
    let cfg = read_entry(archive, &format!("{root}instance.cfg")).ok_or("not multimc")?;

    let name = cfg_value(&cfg, "name").unwrap_or_else(|| "MultiMC Modpack".into());

    let (mc, loader, loader_ver) = read_json(archive, &format!("{root}mmc-pack.json"))
        .map(|j| parse_mmc_components(&j))
        .unwrap_or_default();
    let mc = mc.or_else(|| cfg_value(&cfg, "IntendedVersion"));

    Ok(ParsedModpack {
        info: ModpackInfo {
            name,
            minecraft_version: mc,
            mod_loader: loader,
            mod_loader_version: loader_ver,
            modpack_type: "multimc".into(),
            instance_id: None,
        },
        files: vec![],
        override_prefixes: vec![format!("{root}.minecraft/"), format!("{root}minecraft/")],
    })
}

// ── CurseForge API resolution ─────────────────────────────────────────────

const CURSEFORGE_API_KEY: &str = env!("CURSEFORGE_API_KEY");

async fn resolve_curseforge_files(files: &[ModpackFile]) -> Result<Vec<ModpackFile>, String> {
    let file_ids: Vec<u64> = files
        .iter()
        .filter_map(|f| {
            f.url
                .strip_prefix("curseforge://")?
                .split(':')
                .nth(1)?
                .parse()
                .ok()
        })
        .collect();
    if file_ids.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();

    // 1. Batch-resolve file metadata
    let body = cf_post(
        &client,
        "/v1/mods/files",
        &serde_json::json!({ "fileIds": file_ids }),
    )
    .await?;
    let file_arr = body["data"].as_array().cloned().unwrap_or_default();

    // 2. Batch-resolve mod classIds for directory placement
    let mod_ids: Vec<u64> = file_arr
        .iter()
        .filter_map(|f| f["modId"].as_u64())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let class_map = cf_class_ids(&client, &mod_ids).await;

    // 3. Build results
    Ok(file_arr
        .iter()
        .filter_map(|f| {
            let name = f["fileName"].as_str()?;
            let id = f["id"].as_u64()?;
            let url = f["downloadUrl"]
                .as_str()
                .map(String::from)
                .unwrap_or_else(|| {
                    format!(
                        "https://edge.forgecdn.net/files/{}/{}/{name}",
                        id / 1000,
                        id % 1000
                    )
                });
            let dir = match f["modId"].as_u64().and_then(|mid| class_map.get(&mid)) {
                Some(12) => "resourcepacks",
                Some(6552) => "shaderpacks",
                _ => "mods",
            };
            Some(ModpackFile {
                url,
                path: format!("{dir}/{name}"),
                size: f["fileLength"].as_u64(),
                sha1: None,
            })
        })
        .collect())
}

async fn cf_post(
    client: &reqwest::Client,
    endpoint: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let resp = client
        .post(format!("https://api.curseforge.com{endpoint}"))
        .header("x-api-key", CURSEFORGE_API_KEY)
        .json(body)
        .send()
        .await
        .map_err(|e| format!("CurseForge API error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("CurseForge API returned {}", resp.status()));
    }
    resp.json().await.map_err(|e| e.to_string())
}

async fn cf_class_ids(client: &reqwest::Client, mod_ids: &[u64]) -> HashMap<u64, u64> {
    if mod_ids.is_empty() {
        return Default::default();
    }
    let Ok(body) = cf_post(
        client,
        "/v1/mods",
        &serde_json::json!({ "modIds": mod_ids }),
    )
    .await
    else {
        return Default::default();
    };
    body["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| Some((m["id"].as_u64()?, m["classId"].as_u64()?)))
                .collect()
        })
        .unwrap_or_default()
}

// ── Helpers ───────────────────────────────────────────────────────────────

fn read_entry(archive: &mut Archive, name: &str) -> Option<String> {
    let mut buf = String::new();
    archive.by_name(name).ok()?.read_to_string(&mut buf).ok()?;
    Some(buf)
}

fn read_json(archive: &mut Archive, name: &str) -> Result<serde_json::Value, String> {
    let content = read_entry(archive, name).ok_or_else(|| format!("{name} not found"))?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn cfg_value(content: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}=");
    content
        .lines()
        .find_map(|l| Some(l.strip_prefix(&prefix)?.trim().to_string()))
}

fn find_multimc_root(archive: &mut Archive) -> Option<String> {
    for i in 0..archive.len() {
        let name = archive.by_index_raw(i).ok()?.name().to_string();
        if name == "instance.cfg" {
            return Some(String::new());
        }
        if name.ends_with("/instance.cfg") && name.matches('/').count() == 1 {
            return Some(name.strip_suffix("instance.cfg")?.to_string());
        }
    }
    None
}

fn parse_modrinth_loader(deps: &serde_json::Value) -> (Option<String>, Option<String>) {
    const LOADERS: &[(&str, &str)] = &[
        ("fabric-loader", "fabric"),
        ("forge", "forge"),
        ("quilt-loader", "quilt"),
        ("neoforge", "neoforge"),
        ("neo-forge", "neoforge"),
    ];
    LOADERS
        .iter()
        .find_map(|(key, name)| {
            let v = deps[*key].as_str()?;
            Some((Some((*name).into()), Some(v.into())))
        })
        .unwrap_or((None, None))
}

fn parse_mmc_components(
    json: &serde_json::Value,
) -> (Option<String>, Option<String>, Option<String>) {
    let (mut mc, mut loader, mut loader_ver) = (None, None, None);
    for c in json["components"].as_array().into_iter().flatten() {
        let ver = c["version"].as_str().map(String::from);
        match c["uid"].as_str().unwrap_or("") {
            "net.minecraft" => mc = ver,
            "net.minecraftforge" => {
                loader = Some("forge".into());
                loader_ver = ver;
            }
            "net.neoforged" => {
                loader = Some("neoforge".into());
                loader_ver = ver;
            }
            "net.fabricmc.fabric-loader" => {
                loader = Some("fabric".into());
                loader_ver = ver;
            }
            "org.quiltmc.quilt-loader" => {
                loader = Some("quilt".into());
                loader_ver = ver;
            }
            "com.mumfrey.liteloader" => {
                loader = Some("liteloader".into());
                loader_ver = ver;
            }
            _ => {}
        }
    }
    (mc, loader, loader_ver)
}

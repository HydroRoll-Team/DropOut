use std::path::Path;

use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedModpack {
    pub info: ModpackInfo,
    pub files: Vec<ModpackFile>,
    pub override_prefixes: Vec<String>,
}

impl ParsedModpack {
    pub(crate) fn unknown(path: &Path) -> Self {
        Self {
            info: ModpackInfo {
                name: path
                    .file_stem()
                    .and_then(|name| name.to_str())
                    .unwrap_or("Imported Modpack")
                    .to_string(),
                minecraft_version: None,
                mod_loader: None,
                mod_loader_version: None,
                modpack_type: "unknown".into(),
                instance_id: None,
            },
            files: Vec::new(),
            override_prefixes: Vec::new(),
        }
    }
}

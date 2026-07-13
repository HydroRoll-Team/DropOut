use super::super::{
    archive::{Archive, read_json},
    types::{ModpackFile, ModpackInfo, ParsedModpack},
};
use serde::Deserialize;

pub(crate) fn parse(archive: &mut Archive) -> Result<ParsedModpack, String> {
    let manifest: CurseForgeManifest = serde_json::from_value(read_json(archive, "manifest.json")?)
        .map_err(|e| format!("invalid curseforge manifest: {e}"))?;
    if manifest.manifest_type.as_deref() != Some("minecraftModpack") {
        return Err("not curseforge".into());
    }

    let (mod_loader, mod_loader_version) = manifest.primary_mod_loader();
    let files = manifest
        .files
        .into_iter()
        .filter_map(CurseForgeManifestFile::into_modpack_file)
        .collect();
    let overrides = manifest
        .overrides
        .unwrap_or_else(|| "overrides".to_string());

    Ok(ParsedModpack {
        info: ModpackInfo {
            name: manifest
                .name
                .unwrap_or_else(|| "CurseForge Modpack".to_string()),
            minecraft_version: manifest.minecraft.version,
            mod_loader,
            mod_loader_version,
            modpack_type: "curseforge".into(),
            instance_id: None,
        },
        files,
        override_prefixes: vec![format!("{overrides}/")],
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeManifest {
    manifest_type: Option<String>,
    name: Option<String>,
    overrides: Option<String>,
    #[serde(default)]
    minecraft: CurseForgeMinecraft,
    #[serde(default)]
    files: Vec<CurseForgeManifestFile>,
}

impl CurseForgeManifest {
    fn primary_mod_loader(&self) -> (Option<String>, Option<String>) {
        self.minecraft
            .mod_loaders
            .iter()
            .find(|item| item.primary)
            .or_else(|| self.minecraft.mod_loaders.first())
            .and_then(|item| item.id.as_deref()?.split_once('-'))
            .map(|(name, version)| (Some(name.to_string()), Some(version.to_string())))
            .unwrap_or((None, None))
    }
}

#[derive(Debug, Default, Deserialize)]
struct CurseForgeMinecraft {
    version: Option<String>,
    #[serde(default, rename = "modLoaders")]
    mod_loaders: Vec<CurseForgeModLoader>,
}

#[derive(Debug, Deserialize)]
struct CurseForgeModLoader {
    id: Option<String>,
    #[serde(default)]
    primary: bool,
}

#[derive(Debug, Deserialize)]
struct CurseForgeManifestFile {
    #[serde(rename = "projectID", alias = "projectId")]
    project_id: Option<u64>,
    #[serde(rename = "fileID", alias = "fileId")]
    file_id: Option<u64>,
}

impl CurseForgeManifestFile {
    fn into_modpack_file(self) -> Option<ModpackFile> {
        Some(ModpackFile {
            url: format!("curseforge://{}:{}", self.project_id?, self.file_id?),
            path: String::new(),
            size: None,
            sha1: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::CurseForgeManifestFile;

    #[test]
    fn curseforge_manifest_file_deserializes_uppercase_id_fields() {
        let file: CurseForgeManifestFile = serde_json::from_value(serde_json::json!({
            "projectID": 253735,
            "fileID": 4683468
        }))
        .expect("failed to deserialize CurseForge manifest file");

        assert_eq!(file.project_id, Some(253735));
        assert_eq!(file.file_id, Some(4683468));
        assert_eq!(
            file.into_modpack_file().map(|file| file.url),
            Some("curseforge://253735:4683468".to_string())
        );
    }

    #[test]
    fn curseforge_manifest_file_deserializes_camel_case_id_fields() {
        let file: CurseForgeManifestFile = serde_json::from_value(serde_json::json!({
            "projectId": 253735,
            "fileId": 4683468
        }))
        .expect("failed to deserialize CurseForge manifest file");

        assert_eq!(file.project_id, Some(253735));
        assert_eq!(file.file_id, Some(4683468));
    }
}

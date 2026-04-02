use std::path::Path;

use super::{
    extractor::{OverrideExtractor, ProgressReporter, ZipOverrideExtractor},
    parser::{ModpackParser, ZipModpackParser},
    resolver::{ModpackFileResolver, ResolverChain},
};

#[allow(unused_imports)]
pub use super::types::{ModpackFile, ModpackInfo, ParsedModpack};

pub struct ModpackApi {
    parser: Box<dyn ModpackParser>,
    resolver: Box<dyn ModpackFileResolver>,
    extractor: Box<dyn OverrideExtractor>,
}

impl ModpackApi {
    pub fn new() -> Self {
        Self::default()
    }

    pub(crate) fn with_components<P, R, E>(parser: P, resolver: R, extractor: E) -> Self
    where
        P: ModpackParser + 'static,
        R: ModpackFileResolver + 'static,
        E: OverrideExtractor + 'static,
    {
        Self {
            parser: Box::new(parser),
            resolver: Box::new(resolver),
            extractor: Box::new(extractor),
        }
    }

    pub fn detect(&self, path: &Path) -> Result<ModpackInfo, String> {
        self.parser.parse(path).map(|modpack| modpack.info)
    }

    pub async fn import(&self, path: &Path) -> Result<ParsedModpack, String> {
        let modpack = self.parser.parse(path)?;
        self.resolver.resolve(modpack).await
    }

    pub fn extract_overrides<F>(
        &self,
        path: &Path,
        game_dir: &Path,
        override_prefixes: &[String],
        on_progress: F,
    ) -> Result<(), String>
    where
        F: FnMut(usize, usize, &str),
    {
        let mut reporter = on_progress;
        self.extract_overrides_with_reporter(path, game_dir, override_prefixes, &mut reporter)
    }

    fn extract_overrides_with_reporter(
        &self,
        path: &Path,
        game_dir: &Path,
        override_prefixes: &[String],
        reporter: &mut dyn ProgressReporter,
    ) -> Result<(), String> {
        self.extractor
            .extract(path, game_dir, override_prefixes, reporter)
    }
}

impl Default for ModpackApi {
    fn default() -> Self {
        Self::with_components(
            ZipModpackParser::default(),
            ResolverChain::default(),
            ZipOverrideExtractor::default(),
        )
    }
}

pub fn detect(path: &Path) -> Result<ModpackInfo, String> {
    ModpackApi::default().detect(path)
}

pub async fn import(path: &Path) -> Result<ParsedModpack, String> {
    ModpackApi::default().import(path).await
}

pub fn extract_overrides<F>(
    path: &Path,
    game_dir: &Path,
    override_prefixes: &[String],
    on_progress: F,
) -> Result<(), String>
where
    F: FnMut(usize, usize, &str),
{
    ModpackApi::default().extract_overrides(path, game_dir, override_prefixes, on_progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        io::Write,
        path::{Path, PathBuf},
    };
    use uuid::Uuid;
    use zip::write::SimpleFileOptions;

    struct TestWorkspace {
        root: PathBuf,
        archive: PathBuf,
        game_dir: PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Result<Self, String> {
            let root = std::env::temp_dir().join(format!("dropout-modpack-api-{}", Uuid::new_v4()));
            let archive = root.join("demo.mrpack");
            let game_dir = root.join("game");

            fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;
            write_modrinth_pack(&archive)?;

            Ok(Self {
                root,
                archive,
                game_dir,
            })
        }

        fn for_archive(archive: impl Into<PathBuf>) -> Result<Self, String> {
            let root =
                std::env::temp_dir().join(format!("dropout-modpack-manual-{}", Uuid::new_v4()));
            let archive = archive.into();
            let game_dir = root.join("game");

            fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

            Ok(Self {
                root,
                archive,
                game_dir,
            })
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn write_modrinth_pack(path: &Path) -> Result<(), String> {
        let file = fs::File::create(path).map_err(|e| e.to_string())?;
        let mut writer = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o644);
        let index = serde_json::json!({
            "name": "Demo Pack",
            "dependencies": {
                "minecraft": "1.20.1",
                "fabric-loader": "0.15.11"
            },
            "files": [
                {
                    "path": "mods/demo.jar",
                    "downloads": ["https://example.com/demo.jar"],
                    "fileSize": 42,
                    "hashes": {
                        "sha1": "abc123"
                    }
                }
            ]
        });

        writer
            .start_file("modrinth.index.json", options)
            .map_err(|e| e.to_string())?;
        writer
            .write_all(index.to_string().as_bytes())
            .map_err(|e| e.to_string())?;
        writer
            .start_file("overrides/config/demo.txt", options)
            .map_err(|e| e.to_string())?;
        writer
            .write_all(b"demo-config")
            .map_err(|e| e.to_string())?;
        writer.finish().map_err(|e| e.to_string())?;

        Ok(())
    }

    #[tokio::test]
    async fn modpack_api_imports_and_extracts_modrinth_pack() {
        let workspace = TestWorkspace::new().unwrap();
        let api = ModpackApi::new();

        let detected = api.detect(&workspace.archive).unwrap();
        assert_eq!(detected.name, "Demo Pack");
        assert_eq!(detected.minecraft_version.as_deref(), Some("1.20.1"));
        assert_eq!(detected.mod_loader.as_deref(), Some("fabric"));
        assert_eq!(detected.mod_loader_version.as_deref(), Some("0.15.11"));
        assert_eq!(detected.modpack_type, "modrinth");

        let imported = api.import(&workspace.archive).await.unwrap();
        assert_eq!(imported.info.name, "Demo Pack");
        assert_eq!(imported.files.len(), 1);
        assert_eq!(imported.files[0].path, "mods/demo.jar");
        assert_eq!(imported.files[0].url, "https://example.com/demo.jar");
        assert_eq!(imported.files[0].size, Some(42));
        assert_eq!(imported.files[0].sha1.as_deref(), Some("abc123"));
        assert_eq!(
            imported.override_prefixes,
            vec!["client-overrides/".to_string(), "overrides/".to_string()]
        );

        let mut progress = Vec::new();
        api.extract_overrides(
            &workspace.archive,
            &workspace.game_dir,
            &imported.override_prefixes,
            |current, total, name| progress.push((current, total, name.to_string())),
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(workspace.game_dir.join("config/demo.txt")).unwrap(),
            "demo-config"
        );
        assert_eq!(progress, vec![(1, 1, "config/demo.txt".to_string())]);
    }

    #[tokio::test]
    #[ignore = "requires DROPOUT_MODPACK_TEST_PATH"]
    async fn modpack_api_imports_external_pack_from_env() {
        let archive =
            std::env::var("DROPOUT_MODPACK_TEST_PATH").expect("missing DROPOUT_MODPACK_TEST_PATH");
        let workspace = TestWorkspace::for_archive(archive).unwrap();
        let api = ModpackApi::new();

        assert!(workspace.archive.is_file(), "archive path is not a file");

        let detected = api.detect(&workspace.archive).unwrap();
        assert_ne!(detected.modpack_type, "unknown");
        assert!(!detected.name.trim().is_empty());

        let imported = match api.import(&workspace.archive).await {
            Ok(imported) => imported,
            Err(error)
                if detected.modpack_type == "curseforge"
                    && error.contains("CURSEFORGE_API_KEY") =>
            {
                return;
            }
            Err(error) => panic!("failed to import modpack: {error}"),
        };

        assert_eq!(imported.info.modpack_type, detected.modpack_type);
        assert!(!imported.info.name.trim().is_empty());

        let mut progress_samples = Vec::new();
        let mut last_progress = None;
        api.extract_overrides(
            &workspace.archive,
            &workspace.game_dir,
            &imported.override_prefixes,
            |current, total, name| {
                last_progress = Some((current, total));
                if progress_samples.len() < 32 {
                    progress_samples.push((current, total, name.to_string()));
                }
            },
        )
        .unwrap();

        if let Some((current, total)) = last_progress {
            assert_eq!(
                current, total,
                "override extraction did not finish, samples: {progress_samples:?}"
            );
        }
    }
}

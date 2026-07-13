use std::{fs, path::Path};

use super::archive;

pub(crate) trait ProgressReporter {
    fn report(&mut self, current: usize, total: usize, name: &str);
}

impl<F> ProgressReporter for F
where
    F: FnMut(usize, usize, &str),
{
    fn report(&mut self, current: usize, total: usize, name: &str) {
        self(current, total, name);
    }
}

pub(crate) trait OverrideExtractor: Send + Sync {
    fn extract(
        &self,
        path: &Path,
        game_dir: &Path,
        override_prefixes: &[String],
        reporter: &mut dyn ProgressReporter,
    ) -> Result<(), String>;
}

#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct ZipOverrideExtractor;

impl ZipOverrideExtractor {
    pub(crate) fn new() -> Self {
        Self
    }
}

impl OverrideExtractor for ZipOverrideExtractor {
    fn extract(
        &self,
        path: &Path,
        game_dir: &Path,
        override_prefixes: &[String],
        reporter: &mut dyn ProgressReporter,
    ) -> Result<(), String> {
        let mut archive = archive::open(path)?;
        let all_names = archive::list_names(&mut archive);
        let prefixes: Vec<&str> = override_prefixes
            .iter()
            .filter(|prefix| {
                all_names
                    .iter()
                    .any(|name| name.starts_with(prefix.as_str()))
            })
            .map(String::as_str)
            .collect();
        let strip = |name: &str| -> Option<String> {
            prefixes.iter().find_map(|prefix| {
                let relative = name.strip_prefix(*prefix)?;
                (!relative.is_empty()).then(|| relative.to_string())
            })
        };
        let total = all_names
            .iter()
            .filter(|name| strip(name).is_some())
            .count();
        let mut current = 0;

        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
            let name = entry.name().to_string();
            let Some(relative) = strip(&name) else {
                continue;
            };

            let outpath = game_dir.join(&relative);
            if !outpath.starts_with(game_dir) {
                continue;
            }

            if entry.is_dir() {
                fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            } else {
                if let Some(parent) = outpath.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                let mut file = fs::File::create(&outpath).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
            }

            current += 1;
            reporter.report(current, total, &relative);
        }

        Ok(())
    }
}

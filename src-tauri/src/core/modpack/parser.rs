use std::path::Path;

use super::{archive, formats, types::ParsedModpack};

pub(crate) trait ModpackParser: Send + Sync {
    fn parse(&self, path: &Path) -> Result<ParsedModpack, String>;
}

#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct ZipModpackParser;

impl ZipModpackParser {
    pub(crate) fn new() -> Self {
        Self
    }
}

impl ModpackParser for ZipModpackParser {
    fn parse(&self, path: &Path) -> Result<ParsedModpack, String> {
        let mut archive = archive::open(path)?;
        Ok(formats::parse(&mut archive).unwrap_or_else(|_| ParsedModpack::unknown(path)))
    }
}

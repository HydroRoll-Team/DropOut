use std::{fs, io::Read, path::Path};

pub(crate) type Archive = zip::ZipArchive<fs::File>;

pub(crate) fn open(path: &Path) -> Result<Archive, String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open: {e}"))?;
    zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {e}"))
}

pub(crate) fn read_entry(archive: &mut Archive, name: &str) -> Option<String> {
    let mut buf = String::new();
    archive.by_name(name).ok()?.read_to_string(&mut buf).ok()?;
    Some(buf)
}

pub(crate) fn read_json(archive: &mut Archive, name: &str) -> Result<serde_json::Value, String> {
    let content = read_entry(archive, name).ok_or_else(|| format!("{name} not found"))?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub(crate) fn list_names(archive: &mut Archive) -> Vec<String> {
    (0..archive.len())
        .filter_map(|index| Some(archive.by_index_raw(index).ok()?.name().to_string()))
        .collect()
}

use std::path::{Path, PathBuf};

fn scan_java_dir<F>(base_dir: &Path, should_skip: F) -> Option<PathBuf>
where
    F: Fn(&std::fs::DirEntry) -> bool,
{
    std::fs::read_dir(base_dir)
        .ok()?
        .flatten()
        .filter(|entry| {
            let path = entry.path();
            path.is_dir() && !path.is_symlink() && !should_skip(entry)
        })
        .find_map(|entry| {
            let java_path = entry.path().join("bin/java");
            if java_path.exists() && java_path.is_file() {
                Some(java_path)
            } else {
                None
            }
        })
}

pub fn find_sdkman_java() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let sdkman_base = PathBuf::from(&home).join(".sdkman/candidates/java/");

    if !sdkman_base.exists() {
        return None;
    }

    scan_java_dir(&sdkman_base, |entry| entry.file_name() == "current")
}

pub fn find_mise_java() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let mise_base = PathBuf::from(&home).join(".local/share/mise/installs/java/");

    if !mise_base.exists() {
        return None;
    }

    scan_java_dir(&mise_base, |_| false)
}

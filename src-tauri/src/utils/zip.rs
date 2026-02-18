use flate2::read::GzDecoder;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tar::Archive;

fn sanitize_relative_path(entry_path: &Path) -> Result<PathBuf, String> {
    let mut safe_path = PathBuf::new();

    for component in entry_path.components() {
        match component {
            Component::Normal(part) => safe_path.push(part),
            Component::CurDir => {}
            Component::ParentDir => {
                return Err(format!(
                    "Unsafe archive entry path detected (parent traversal): {}",
                    entry_path.display()
                ));
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(format!(
                    "Unsafe archive entry path detected (absolute path): {}",
                    entry_path.display()
                ));
            }
        }
    }

    Ok(safe_path)
}

pub fn extract_zip(zip_path: &Path, extract_to: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("Failed to open zip {}: {}", zip_path.display(), e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        let outpath = match file.enclosed_name() {
            Some(path) => extract_to.join(path),
            None => continue,
        };

        // Skip META-INF
        if outpath.to_string_lossy().contains("META-INF") {
            continue;
        }

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| format!("Failed to create dir: {}", e))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| format!("Failed to create dir: {}", e))?;
                }
            }
            let mut outfile =
                fs::File::create(&outpath).map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
        }
    }

    Ok(())
}

/// Extract a tar.gz archive
///
/// Adoptium's tar.gz archives usually contain a top-level directory, such as `jdk-21.0.5+11-jre/`.
/// This function returns the name of that directory to facilitate locating `bin/java` afterwards.
pub fn extract_tar_gz(archive_path: &Path, extract_to: &Path) -> Result<String, String> {
    let file = fs::File::open(archive_path)
        .map_err(|e| format!("Failed to open tar.gz {}: {}", archive_path.display(), e))?;

    let decoder = GzDecoder::new(file);
    let mut archive = Archive::new(decoder);

    // Ensure the target directory exists
    fs::create_dir_all(extract_to)
        .map_err(|e| format!("Failed to create extract directory: {}", e))?;

    // Track the top-level directory name
    let mut top_level_dir: Option<String> = None;

    for entry in archive
        .entries()
        .map_err(|e| format!("Failed to read tar entries: {}", e))?
    {
        let mut entry = entry.map_err(|e| format!("Failed to read tar entry: {}", e))?;
        let entry_path = entry
            .path()
            .map_err(|e| format!("Failed to get entry path: {}", e))?
            .into_owned();

        let safe_entry_path = sanitize_relative_path(&entry_path)?;
        if safe_entry_path.as_os_str().is_empty() {
            continue;
        }

        // Extract the top-level directory name (the first path component)
        if top_level_dir.is_none() {
            if let Some(first_component) = safe_entry_path.components().next() {
                let component_str = first_component.as_os_str().to_string_lossy().to_string();
                if !component_str.is_empty() && component_str != "." {
                    top_level_dir = Some(component_str);
                }
            }
        }

        let outpath = extract_to.join(&safe_entry_path);

        if entry.header().entry_type().is_dir() {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory {}: {}", outpath.display(), e))?;
        } else {
            // Ensure parent directory exists
            if let Some(parent) = outpath.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent dir: {}", e))?;
                }
            }

            let mut outfile = fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create file {}: {}", outpath.display(), e))?;

            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;

            // Set executable permissions on Unix systems
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(mode) = entry.header().mode() {
                    let permissions = fs::Permissions::from_mode(mode);
                    let _ = fs::set_permissions(&outpath, permissions);
                }
            }
        }
    }

    top_level_dir.ok_or_else(|| "Archive appears to be empty".to_string())
}

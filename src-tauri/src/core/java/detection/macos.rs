use std::path::PathBuf;

use super::unix::{find_mise_java, find_sdkman_java};

pub fn macos_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    let mac_paths = [
        "/Library/Java/JavaVirtualMachines",
        "/System/Library/Java/JavaVirtualMachines",
        "/usr/local/opt/openjdk/bin/java",
        "/opt/homebrew/opt/openjdk/bin/java",
    ];

    for path in &mac_paths {
        let p = PathBuf::from(path);
        if p.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&p) {
                for entry in entries.flatten() {
                    let java_path = entry.path().join("Contents/Home/bin/java");
                    if java_path.exists() {
                        candidates.push(java_path);
                    }
                }
            }
        } else if p.exists() {
            candidates.push(p);
        }
    }

    let homebrew_arm = PathBuf::from("/opt/homebrew/Cellar/openjdk");
    if homebrew_arm.exists() {
        if let Ok(entries) = std::fs::read_dir(&homebrew_arm) {
            for entry in entries.flatten() {
                let java_path = entry
                    .path()
                    .join("libexec/openjdk.jdk/Contents/Home/bin/java");
                if java_path.exists() {
                    candidates.push(java_path);
                }
            }
        }
    }

    if let Some(sdkman_java) = find_sdkman_java() {
        candidates.push(sdkman_java);
    }

    if let Some(mise_java) = find_mise_java() {
        candidates.push(mise_java);
    }

    candidates
}

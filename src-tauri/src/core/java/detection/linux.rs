use std::path::PathBuf;

use super::unix::{find_mise_java, find_sdkman_java};

pub fn linux_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    let linux_paths = [
        "/usr/lib/jvm",
        "/usr/java",
        "/opt/java",
        "/opt/jdk",
        "/opt/openjdk",
    ];

    for base in &linux_paths {
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let java_path = entry.path().join("bin/java");
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

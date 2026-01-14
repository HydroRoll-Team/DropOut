use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub is_64bit: bool,
}

/// Detect Java installations on the system
pub fn detect_java_installations() -> Vec<JavaInstallation> {
    let mut installations = Vec::new();
    let candidates = get_java_candidates();

    for candidate in candidates {
        if let Some(java) = check_java_installation(&candidate) {
            // Avoid duplicates
            if !installations
                .iter()
                .any(|j: &JavaInstallation| j.path == java.path)
            {
                installations.push(java);
            }
        }
    }

    // Sort by version (newer first)
    installations.sort_by(|a, b| {
        let v_a = parse_java_version(&a.version);
        let v_b = parse_java_version(&b.version);
        v_b.cmp(&v_a)
    });

    installations
}

/// Get list of candidate Java paths to check
fn get_java_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // Check PATH first
    if let Ok(output) = Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg("java")
        .output()
    {
        if output.status.success() {
            let paths = String::from_utf8_lossy(&output.stdout);
            for line in paths.lines() {
                let path = PathBuf::from(line.trim());
                if path.exists() {
                    candidates.push(path);
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Common Linux Java paths
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

        // Flatpak / Snap locations
        let home = std::env::var("HOME").unwrap_or_default();
        let snap_java = PathBuf::from(&home).join(".sdkman/candidates/java");
        if snap_java.exists() {
            if let Ok(entries) = std::fs::read_dir(&snap_java) {
                for entry in entries.flatten() {
                    let java_path = entry.path().join("bin/java");
                    if java_path.exists() {
                        candidates.push(java_path);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS Java paths
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

        // Homebrew ARM64
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
    }

    #[cfg(target_os = "windows")]
    {
        // Windows Java paths
        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)")
            .unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

        let win_paths = [
            format!("{}\\Java", program_files),
            format!("{}\\Java", program_files_x86),
            format!("{}\\Eclipse Adoptium", program_files),
            format!("{}\\AdoptOpenJDK", program_files),
            format!("{}\\Microsoft\\jdk", program_files),
            format!("{}\\Zulu", program_files),
            format!("{}\\Amazon Corretto", program_files),
            format!("{}\\BellSoft\\LibericaJDK", program_files),
            format!("{}\\Programs\\Eclipse Adoptium", local_app_data),
        ];

        for base in &win_paths {
            let base_path = PathBuf::from(base);
            if base_path.exists() {
                if let Ok(entries) = std::fs::read_dir(&base_path) {
                    for entry in entries.flatten() {
                        let java_path = entry.path().join("bin\\java.exe");
                        if java_path.exists() {
                            candidates.push(java_path);
                        }
                    }
                }
            }
        }

        // Also check JAVA_HOME
        if let Ok(java_home) = std::env::var("JAVA_HOME") {
            let java_path = PathBuf::from(&java_home).join("bin\\java.exe");
            if java_path.exists() {
                candidates.push(java_path);
            }
        }
    }

    // JAVA_HOME environment variable (cross-platform)
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let bin_name = if cfg!(windows) { "java.exe" } else { "java" };
        let java_path = PathBuf::from(&java_home).join("bin").join(bin_name);
        if java_path.exists() {
            candidates.push(java_path);
        }
    }

    candidates
}

/// Check a specific Java installation and get its version info
fn check_java_installation(path: &PathBuf) -> Option<JavaInstallation> {
    let output = Command::new(path).arg("-version").output().ok()?;

    // Java outputs version info to stderr
    let version_output = String::from_utf8_lossy(&output.stderr);

    // Parse version string (e.g., "openjdk version \"17.0.1\"" or "java version \"1.8.0_301\"")
    let version = parse_version_string(&version_output)?;
    let is_64bit = version_output.contains("64-Bit");

    Some(JavaInstallation {
        path: path.to_string_lossy().to_string(),
        version,
        is_64bit,
    })
}

/// Parse version string from java -version output
fn parse_version_string(output: &str) -> Option<String> {
    for line in output.lines() {
        if line.contains("version") {
            // Find the quoted version string
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start + 1..].find('"') {
                    return Some(line[start + 1..start + 1 + end].to_string());
                }
            }
        }
    }
    None
}

/// Parse version for comparison (returns major version number)
fn parse_java_version(version: &str) -> u32 {
    // Handle both old format (1.8.0_xxx) and new format (11.0.x, 17.0.x)
    let parts: Vec<&str> = version.split('.').collect();
    if let Some(first) = parts.first() {
        if *first == "1" {
            // Old format: 1.8.0 -> major is 8
            parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0)
        } else {
            // New format: 17.0.1 -> major is 17
            first.parse().unwrap_or(0)
        }
    } else {
        0
    }
}

/// Get the best Java for a specific Minecraft version
pub fn get_recommended_java(required_major_version: Option<u64>) -> Option<JavaInstallation> {
    let installations = detect_java_installations();

    if let Some(required) = required_major_version {
        // Find exact match or higher
        installations.into_iter().find(|java| {
            let major = parse_java_version(&java.version);
            major >= required as u32
        })
    } else {
        // Return newest
        installations.into_iter().next()
    }
}

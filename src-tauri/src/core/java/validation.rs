use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::JavaInstallation;

pub async fn check_java_installation(path: &PathBuf) -> Option<JavaInstallation> {
	let path = path.clone();
	tokio::task::spawn_blocking(move || {
		check_java_installation_blocking(&path)
	})
	.await
	.ok()?
}

fn check_java_installation_blocking(path: &PathBuf) -> Option<JavaInstallation> {
    let mut cmd = Command::new(path);
    cmd.arg("-version");

    // Hide console window
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

	let output = cmd.output().ok()?;

	let version_output = String::from_utf8_lossy(&output.stderr);

    let version = parse_version_string(&version_output)?;
    let arch = extract_architecture(&version_output);
    let vendor = extract_vendor(&version_output);
    let is_64bit = version_output.to_lowercase().contains("64-bit") || arch == "aarch64";

	Some(JavaInstallation {
		path: path.to_string_lossy().to_string(),
		version,
		arch,
		vendor,
		source: "system".to_string(),
		is_64bit,
	})
}

pub fn parse_version_string(output: &str) -> Option<String> {
    for line in output.lines() {
        if line.contains("version") {
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start + 1..].find('"') {
                    return Some(line[start + 1..start + 1 + end].to_string());
                }
            }
        }
    }
    None
}

pub fn parse_java_version(version: &str) -> u32 {
    let parts: Vec<&str> = version.split('.').collect();
    if let Some(first) = parts.first() {
        // Handle both legacy (1.x) and modern (x) versioning
        if *first == "1" {
            // Legacy versioning
            parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0)
        } else {
            // Modern versioning
            first.parse().unwrap_or(0)
        }
    } else {
        0
    }
}

pub fn extract_architecture(version_output: &str) -> String {
    if version_output.contains("64-Bit") {
        "x64".to_string()
    } else if version_output.contains("32-Bit") {
        "x86".to_string()
    } else if version_output.contains("aarch64") || version_output.contains("ARM64") {
        "aarch64".to_string()
    } else {
        "x64".to_string()
    }
}

pub fn extract_vendor(version_output: &str) -> String {
    let lower = version_output.to_lowercase();

    // TODO: Expand with more vendors as needed
    if lower.contains("temurin") || lower.contains("adoptium") {
        "Eclipse Adoptium".to_string()
    } else if lower.contains("openjdk") {
        "OpenJDK".to_string()
    } else if lower.contains("oracle") {
        "Oracle".to_string()
    } else if lower.contains("microsoft") {
        "Microsoft".to_string()
    } else if lower.contains("zulu") {
        "Azul Zulu".to_string()
    } else if lower.contains("corretto") {
        "Amazon Corretto".to_string()
    } else if lower.contains("liberica") {
        "BellSoft Liberica".to_string()
    } else if lower.contains("graalvm") {
        "GraalVM".to_string()
    } else {
        "Unknown".to_string()
    }
}

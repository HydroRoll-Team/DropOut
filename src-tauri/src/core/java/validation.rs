use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::core::java::JavaInstallation;

pub async fn check_java_installation(path: &PathBuf) -> Option<JavaInstallation> {
    let path = path.clone();
    tokio::task::spawn_blocking(move || check_java_installation_blocking(&path))
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

    let vendor_name: HashMap<&str, &str> = [
        // Eclipse/Adoptium
        ("temurin", "Temurin (Eclipse)"),
        ("adoptium", "Eclipse Adoptium"),
        // Amazon
        ("corretto", "Corretto (Amazon)"),
        ("amzn", "Corretto (Amazon)"),
        // Alibaba
        ("dragonwell", "Dragonwell (Alibaba)"),
        ("albba", "Dragonwell (Alibaba)"),
        // GraalVM
        ("graalvm", "GraalVM"),
        // Oracle
        ("oracle", "Java SE Development Kit (Oracle)"),
        // Tencent
        ("kona", "Kona (Tencent)"),
        // BellSoft
        ("liberica", "Liberica (Bellsoft)"),
        ("mandrel", "Mandrel (Red Hat)"),
        // Microsoft
        ("microsoft", "OpenJDK (Microsoft)"),
        // SAP
        ("sapmachine", "SapMachine (SAP)"),
        // IBM
        ("semeru", "Semeru (IBM)"),
        ("sem", "Semeru (IBM)"),
        // Azul
        ("zulu", "Zulu (Azul Systems)"),
        // Trava
        ("trava", "Trava (Trava)"),
        // Huawei
        ("bisheng", "BiSheng (Huawei)"),
        // Generic OpenJDK
        ("openjdk", "OpenJDK"),
    ]
    .iter()
    .cloned()
    .collect();

    for (key, name) in vendor_name {
        if lower.contains(key) {
            return name.to_string();
        }
    }

    "Unknown".to_string()
}

pub fn is_version_compatible(
    major: u32,
    required_major_version: Option<u64>,
    max_major_version: Option<u32>,
) -> bool {
    let meets_min = required_major_version
        .map(|r| major >= r as u32)
        .unwrap_or(true);
    let meets_max = max_major_version.map(|m| major <= m).unwrap_or(true);
    meets_min && meets_max
}

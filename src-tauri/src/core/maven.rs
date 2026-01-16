//! Maven coordinate parsing and URL construction utilities.
//!
//! Mod loaders like Fabric and Forge specify libraries using Maven coordinates
//! (e.g., `net.fabricmc:fabric-loader:0.14.21`) instead of direct download URLs.
//! This module provides utilities to parse these coordinates and construct
//! download URLs for various Maven repositories.

use std::path::PathBuf;

/// Known Maven repository URLs for mod loaders
#[allow(dead_code)]
pub const MAVEN_CENTRAL: &str = "https://repo1.maven.org/maven2/";
pub const FABRIC_MAVEN: &str = "https://maven.fabricmc.net/";
pub const FORGE_MAVEN: &str = "https://maven.minecraftforge.net/";
pub const MOJANG_LIBRARIES: &str = "https://libraries.minecraft.net/";

/// Represents a parsed Maven coordinate.
///
/// Maven coordinates follow the format: `group:artifact:version[:classifier][@extension]`
/// Examples:
/// - `net.fabricmc:fabric-loader:0.14.21`
/// - `org.lwjgl:lwjgl:3.3.1:natives-linux`
/// - `com.example:artifact:1.0@zip`
#[derive(Debug, Clone, PartialEq)]
pub struct MavenCoordinate {
    pub group: String,
    pub artifact: String,
    pub version: String,
    pub classifier: Option<String>,
    pub extension: String,
}

impl MavenCoordinate {
    /// Parse a Maven coordinate string.
    ///
    /// # Arguments
    /// * `coord` - A string in the format `group:artifact:version[:classifier][@extension]`
    ///
    /// # Returns
    /// * `Some(MavenCoordinate)` if parsing succeeds
    /// * `None` if the format is invalid
    ///
    /// # Examples
    /// ```
    /// let coord = MavenCoordinate::parse("net.fabricmc:fabric-loader:0.14.21").unwrap();
    /// assert_eq!(coord.group, "net.fabricmc");
    /// assert_eq!(coord.artifact, "fabric-loader");
    /// assert_eq!(coord.version, "0.14.21");
    /// ```
    pub fn parse(coord: &str) -> Option<Self> {
        // Handle extension suffix (e.g., @zip)
        let (coord_part, extension) = if let Some(at_idx) = coord.rfind('@') {
            let ext = &coord[at_idx + 1..];
            let base = &coord[..at_idx];
            (base, ext.to_string())
        } else {
            (coord, "jar".to_string())
        };

        let parts: Vec<&str> = coord_part.split(':').collect();

        match parts.len() {
            3 => Some(MavenCoordinate {
                group: parts[0].to_string(),
                artifact: parts[1].to_string(),
                version: parts[2].to_string(),
                classifier: None,
                extension,
            }),
            4 => Some(MavenCoordinate {
                group: parts[0].to_string(),
                artifact: parts[1].to_string(),
                version: parts[2].to_string(),
                classifier: Some(parts[3].to_string()),
                extension,
            }),
            _ => None,
        }
    }

    /// Get the relative path for this artifact in a Maven repository.
    ///
    /// # Returns
    /// The path as `group/artifact/version/artifact-version[-classifier].extension`
    ///
    /// # Examples
    /// ```
    /// let coord = MavenCoordinate::parse("net.fabricmc:fabric-loader:0.14.21").unwrap();
    /// assert_eq!(coord.to_path(), "net/fabricmc/fabric-loader/0.14.21/fabric-loader-0.14.21.jar");
    /// ```
    pub fn to_path(&self) -> String {
        let group_path = self.group.replace('.', "/");
        let filename = match &self.classifier {
            Some(classifier) => {
                format!(
                    "{}-{}-{}.{}",
                    self.artifact, self.version, classifier, self.extension
                )
            }
            None => {
                format!("{}-{}.{}", self.artifact, self.version, self.extension)
            }
        };

        format!(
            "{}/{}/{}/{}",
            group_path, self.artifact, self.version, filename
        )
    }

    /// Get the local file path for storing this artifact.
    ///
    /// # Arguments
    /// * `libraries_dir` - The base libraries directory
    ///
    /// # Returns
    /// The full path where the library should be stored
    pub fn to_local_path(&self, libraries_dir: &std::path::Path) -> PathBuf {
        let rel_path = self.to_path();
        libraries_dir.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR))
    }

    /// Construct the full download URL for this artifact.
    ///
    /// # Arguments
    /// * `base_url` - The Maven repository base URL (e.g., `https://maven.fabricmc.net/`)
    ///
    /// # Returns
    /// The full URL to download the artifact
    pub fn to_url(&self, base_url: &str) -> String {
        let base = base_url.trim_end_matches('/');
        format!("{}/{}", base, self.to_path())
    }
}

/// Resolve the download URL for a library.
///
/// This function handles both:
/// 1. Libraries with explicit download URLs (vanilla Minecraft)
/// 2. Libraries with only Maven coordinates (Fabric/Forge)
///
/// # Arguments
/// * `name` - The Maven coordinate string
/// * `explicit_url` - An explicit download URL if provided in the library JSON
/// * `maven_url` - A custom Maven repository URL from the library JSON
///
/// # Returns
/// The resolved download URL
pub fn resolve_library_url(
    name: &str,
    explicit_url: Option<&str>,
    maven_url: Option<&str>,
) -> Option<String> {
    // If there's an explicit URL, use it
    if let Some(url) = explicit_url {
        return Some(url.to_string());
    }

    // Parse the Maven coordinate
    let coord = MavenCoordinate::parse(name)?;

    // Determine the base Maven URL
    let base_url = maven_url.unwrap_or_else(|| {
        // Guess the repository based on group
        if coord.group.starts_with("net.fabricmc") {
            FABRIC_MAVEN
        } else if coord.group.starts_with("net.minecraftforge")
            || coord.group.starts_with("cpw.mods")
        {
            FORGE_MAVEN
        } else {
            MOJANG_LIBRARIES
        }
    });

    Some(coord.to_url(base_url))
}

/// Get the local storage path for a library.
///
/// # Arguments
/// * `name` - The Maven coordinate string
/// * `libraries_dir` - The base libraries directory
///
/// # Returns
/// The path where the library should be stored
pub fn get_library_path(name: &str, libraries_dir: &std::path::Path) -> Option<PathBuf> {
    let coord = MavenCoordinate::parse(name)?;
    Some(coord.to_local_path(libraries_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_coordinate() {
        let coord = MavenCoordinate::parse("net.fabricmc:fabric-loader:0.14.21").unwrap();
        assert_eq!(coord.group, "net.fabricmc");
        assert_eq!(coord.artifact, "fabric-loader");
        assert_eq!(coord.version, "0.14.21");
        assert_eq!(coord.classifier, None);
        assert_eq!(coord.extension, "jar");
    }

    #[test]
    fn test_parse_with_classifier() {
        let coord = MavenCoordinate::parse("org.lwjgl:lwjgl:3.3.1:natives-linux").unwrap();
        assert_eq!(coord.group, "org.lwjgl");
        assert_eq!(coord.artifact, "lwjgl");
        assert_eq!(coord.version, "3.3.1");
        assert_eq!(coord.classifier, Some("natives-linux".to_string()));
        assert_eq!(coord.extension, "jar");
    }

    #[test]
    fn test_parse_with_extension() {
        let coord = MavenCoordinate::parse("com.example:artifact:1.0@zip").unwrap();
        assert_eq!(coord.extension, "zip");
    }

    #[test]
    fn test_to_path() {
        let coord = MavenCoordinate::parse("net.fabricmc:fabric-loader:0.14.21").unwrap();
        assert_eq!(
            coord.to_path(),
            "net/fabricmc/fabric-loader/0.14.21/fabric-loader-0.14.21.jar"
        );
    }

    #[test]
    fn test_to_path_with_classifier() {
        let coord = MavenCoordinate::parse("org.lwjgl:lwjgl:3.3.1:natives-linux").unwrap();
        assert_eq!(
            coord.to_path(),
            "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux.jar"
        );
    }

    #[test]
    fn test_to_url() {
        let coord = MavenCoordinate::parse("net.fabricmc:fabric-loader:0.14.21").unwrap();
        assert_eq!(
            coord.to_url(FABRIC_MAVEN),
            "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.14.21/fabric-loader-0.14.21.jar"
        );
    }

    #[test]
    fn test_resolve_library_url_explicit() {
        let url = resolve_library_url(
            "net.fabricmc:fabric-loader:0.14.21",
            Some("https://example.com/lib.jar"),
            None,
        );
        assert_eq!(url, Some("https://example.com/lib.jar".to_string()));
    }

    #[test]
    fn test_resolve_library_url_fabric() {
        let url = resolve_library_url("net.fabricmc:fabric-loader:0.14.21", None, None);
        assert!(url.unwrap().starts_with(FABRIC_MAVEN));
    }
}

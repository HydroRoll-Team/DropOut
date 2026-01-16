//! Version merging utilities for mod loaders.
//!
//! Mod loaders like Fabric and Forge create "partial" version JSON files that
//! inherit from vanilla Minecraft versions via the `inheritsFrom` field.
//! This module provides functionality to merge these partial versions with
//! their parent versions to create a complete, launchable version profile.

use crate::core::game_version::{Arguments, GameVersion};
use std::error::Error;

/// Merge a child version (mod loader) with its parent version (vanilla).
///
/// The merging follows these rules:
/// 1. Child's `mainClass` overrides parent's
/// 2. Child's libraries are prepended to parent's (mod loader classes take priority)
/// 3. Arguments are merged (child's additions come after parent's)
/// 4. Parent provides `downloads`, `assetIndex`, `javaVersion` if child doesn't have them
///
/// # Arguments
/// * `child` - The mod loader version (e.g., Fabric)
/// * `parent` - The vanilla Minecraft version
///
/// # Returns
/// A merged `GameVersion` that can be used for launching.
pub fn merge_versions(child: GameVersion, parent: GameVersion) -> GameVersion {
    // Libraries: child libraries first (mod loader takes priority in classpath)
    let mut merged_libraries = child.libraries;
    merged_libraries.extend(parent.libraries);

    // Arguments: merge both game and JVM arguments
    let merged_arguments = merge_arguments(child.arguments, parent.arguments);

    GameVersion {
        id: child.id,
        // Use child's downloads if present, otherwise parent's
        downloads: child.downloads.or(parent.downloads),
        // Use child's asset_index if present, otherwise parent's
        asset_index: child.asset_index.or(parent.asset_index),
        libraries: merged_libraries,
        // Child's main class always takes priority (this is the mod loader entry point)
        main_class: child.main_class,
        // Prefer child's minecraft_arguments, fall back to parent's
        minecraft_arguments: child.minecraft_arguments.or(parent.minecraft_arguments),
        arguments: merged_arguments,
        // Use child's java_version if specified, otherwise parent's
        java_version: child.java_version.or(parent.java_version),
        // Clear inheritsFrom since we've now merged
        inherits_from: None,
        // Use child's assets field if present, otherwise parent's
        assets: child.assets.or(parent.assets),
        // Use parent's version type if child doesn't specify
        version_type: child.version_type.or(parent.version_type),
    }
}

/// Merge argument objects from child and parent versions.
///
/// Both game and JVM arguments are merged, with parent arguments coming first
/// and child arguments appended (child can add additional arguments).
fn merge_arguments(child: Option<Arguments>, parent: Option<Arguments>) -> Option<Arguments> {
    match (child, parent) {
        (None, None) => None,
        (Some(c), None) => Some(c),
        (None, Some(p)) => Some(p),
        (Some(c), Some(p)) => Some(Arguments {
            game: merge_json_arrays(p.game, c.game),
            jvm: merge_json_arrays(p.jvm, c.jvm),
        }),
    }
}

/// Merge two JSON arrays (used for arguments).
///
/// Parent array comes first, child array is appended.
fn merge_json_arrays(
    parent: Option<serde_json::Value>,
    child: Option<serde_json::Value>,
) -> Option<serde_json::Value> {
    match (parent, child) {
        (None, None) => None,
        (Some(p), None) => Some(p),
        (None, Some(c)) => Some(c),
        (Some(p), Some(c)) => {
            if let (serde_json::Value::Array(mut p_arr), serde_json::Value::Array(c_arr)) =
                (p.clone(), c.clone())
            {
                p_arr.extend(c_arr);
                Some(serde_json::Value::Array(p_arr))
            } else {
                // If they're not arrays, prefer child
                Some(c)
            }
        }
    }
}

/// Check if a version requires inheritance resolution.
///
/// # Arguments
/// * `version` - The version to check
///
/// # Returns
/// `true` if the version has an `inheritsFrom` field that needs resolution.
#[allow(dead_code)]
pub fn needs_inheritance_resolution(version: &GameVersion) -> bool {
    version.inherits_from.is_some()
}

/// Recursively resolve version inheritance.
///
/// This function resolves the entire inheritance chain by loading parent versions
/// and merging them until a version without `inheritsFrom` is found.
///
/// # Arguments
/// * `version` - The starting version (e.g., a Fabric version)
/// * `version_loader` - A function that loads a version by ID
///
/// # Returns
/// A fully merged `GameVersion` with all inheritance resolved.
#[allow(dead_code)]
pub async fn resolve_inheritance<F, Fut>(
    version: GameVersion,
    version_loader: F,
) -> Result<GameVersion, Box<dyn Error + Send + Sync>>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<GameVersion, Box<dyn Error + Send + Sync>>>,
{
    let mut current = version;

    // Keep resolving until we have no more inheritance
    while let Some(parent_id) = current.inherits_from.clone() {
        let parent = version_loader(parent_id).await?;
        current = merge_versions(current, parent);
    }

    Ok(current)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::game_version::{DownloadArtifact, Downloads, Library};

    fn create_test_library(name: &str) -> Library {
        Library {
            name: name.to_string(),
            downloads: None,
            rules: None,
            natives: None,
            url: None,
        }
    }

    #[test]
    fn test_merge_libraries_order() {
        let child = GameVersion {
            id: "fabric-1.20.4".to_string(),
            downloads: None,
            asset_index: None,
            libraries: vec![create_test_library("fabric:loader:1.0")],
            main_class: "net.fabricmc.loader.launch.knot.KnotClient".to_string(),
            minecraft_arguments: None,
            arguments: None,
            java_version: None,
            inherits_from: Some("1.20.4".to_string()),
            assets: None,
            version_type: None,
        };

        let parent = GameVersion {
            id: "1.20.4".to_string(),
            downloads: Some(Downloads {
                client: DownloadArtifact {
                    sha1: Some("abc".to_string()),
                    size: Some(1000),
                    url: "https://example.com/client.jar".to_string(),
                    path: None,
                },
                server: None,
            }),
            asset_index: None,
            libraries: vec![create_test_library("net.minecraft:client:1.20.4")],
            main_class: "net.minecraft.client.main.Main".to_string(),
            minecraft_arguments: None,
            arguments: None,
            java_version: None,
            inherits_from: None,
            assets: None,
            version_type: Some("release".to_string()),
        };

        let merged = merge_versions(child, parent);

        // Child libraries should come first
        assert_eq!(merged.libraries.len(), 2);
        assert_eq!(merged.libraries[0].name, "fabric:loader:1.0");
        assert_eq!(merged.libraries[1].name, "net.minecraft:client:1.20.4");

        // Child main class should override
        assert_eq!(
            merged.main_class,
            "net.fabricmc.loader.launch.knot.KnotClient"
        );

        // Parent downloads should be used
        assert!(merged.downloads.is_some());

        // inheritsFrom should be cleared
        assert!(merged.inherits_from.is_none());
    }

    #[test]
    fn test_needs_inheritance_resolution() {
        let with_inheritance = GameVersion {
            id: "test".to_string(),
            downloads: None,
            asset_index: None,
            libraries: vec![],
            main_class: "Main".to_string(),
            minecraft_arguments: None,
            arguments: None,
            java_version: None,
            inherits_from: Some("1.20.4".to_string()),
            assets: None,
            version_type: None,
        };

        let without_inheritance = GameVersion {
            id: "test".to_string(),
            downloads: None,
            asset_index: None,
            libraries: vec![],
            main_class: "Main".to_string(),
            minecraft_arguments: None,
            arguments: None,
            java_version: None,
            inherits_from: None,
            assets: None,
            version_type: None,
        };

        assert!(needs_inheritance_resolution(&with_inheritance));
        assert!(!needs_inheritance_resolution(&without_inheritance));
    }
}

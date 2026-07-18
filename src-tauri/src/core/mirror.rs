//! Download mirror support for China users.
//!
//! Provides URL remapping from official Mojang/Forge/Fabric servers
//! to mirror servers like BMCLAPI for faster downloads in China.

/// Supported mirror sources.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MirrorSource {
    Official,
    Bmclapi,
}

impl MirrorSource {
    pub fn from_str(s: &str) -> Self {
        match s {
            "bmclapi" => Self::Bmclapi,
            _ => Self::Official,
        }
    }
}

/// Base URL mappings for BMCLAPI mirror.
const BMCLAPI_BASE: &str = "https://bmclapi2.bangbang93.com";

/// Remap a download URL based on the selected mirror source.
///
/// Replaces known official endpoints with their mirror equivalents.
/// Returns the original URL unchanged if source is `Official` or the URL
/// doesn't match any known pattern.
pub fn remap_url(url: &str, source: MirrorSource) -> String {
    if source == MirrorSource::Official {
        return url.to_string();
    }

    match source {
        MirrorSource::Bmclapi => remap_bmclapi(url),
        MirrorSource::Official => url.to_string(),
    }
}

fn remap_bmclapi(url: &str) -> String {
    // Version manifest & version JSONs
    if url.starts_with("https://piston-meta.mojang.com/") {
        return url.replacen("https://piston-meta.mojang.com", BMCLAPI_BASE, 1);
    }
    if url.starts_with("https://piston-data.mojang.com/") {
        return url.replacen("https://piston-data.mojang.com", BMCLAPI_BASE, 1);
    }
    // Launcher meta (used in some version JSONs)
    if url.starts_with("https://launchermeta.mojang.com/") {
        return url.replacen("https://launchermeta.mojang.com", BMCLAPI_BASE, 1);
    }
    if url.starts_with("https://launcher.mojang.com/") {
        return url.replacen("https://launcher.mojang.com", BMCLAPI_BASE, 1);
    }
    // Asset resources
    if url.starts_with("https://resources.download.minecraft.net/") {
        return url.replacen(
            "https://resources.download.minecraft.net",
            &format!("{}/assets", BMCLAPI_BASE),
            1,
        );
    }
    // Vanilla libraries
    if url.starts_with("https://libraries.minecraft.net/") {
        return url.replacen(
            "https://libraries.minecraft.net",
            &format!("{}/maven", BMCLAPI_BASE),
            1,
        );
    }
    // Forge Maven
    if url.starts_with("https://maven.minecraftforge.net/") {
        return url.replacen(
            "https://maven.minecraftforge.net",
            &format!("{}/maven", BMCLAPI_BASE),
            1,
        );
    }
    if url.starts_with("https://files.minecraftforge.net/") {
        return url.replacen(
            "https://files.minecraftforge.net",
            &format!("{}/maven", BMCLAPI_BASE),
            1,
        );
    }
    // Fabric Maven
    if url.starts_with("https://maven.fabricmc.net/") {
        return url.replacen(
            "https://maven.fabricmc.net",
            &format!("{}/maven", BMCLAPI_BASE),
            1,
        );
    }
    // Fabric Meta API
    if url.starts_with("https://meta.fabricmc.net/") {
        return url.replacen(
            "https://meta.fabricmc.net",
            &format!("{}/fabric-meta", BMCLAPI_BASE),
            1,
        );
    }

    // No match — return as-is
    url.to_string()
}

/// Get the version manifest URL for the given mirror source.
pub fn version_manifest_url(source: MirrorSource) -> &'static str {
    match source {
        MirrorSource::Bmclapi => {
            concat!(
                "https://bmclapi2.bangbang93.com",
                "/mc/game/version_manifest_v2.json"
            )
        }
        MirrorSource::Official => "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
    }
}

/// Get the Fabric Meta base URL for the given mirror source.
pub fn fabric_meta_url(source: MirrorSource) -> &'static str {
    match source {
        MirrorSource::Bmclapi => "https://bmclapi2.bangbang93.com/fabric-meta/v2",
        MirrorSource::Official => "https://meta.fabricmc.net/v2",
    }
}

/// Get the Forge Maven base URL for the given mirror source.
pub fn forge_maven_url(source: MirrorSource) -> &'static str {
    match source {
        MirrorSource::Bmclapi => "https://bmclapi2.bangbang93.com/maven/",
        MirrorSource::Official => "https://maven.minecraftforge.net/",
    }
}

/// Get the asset download base URL for the given mirror source.
pub fn assets_url(source: MirrorSource) -> &'static str {
    match source {
        MirrorSource::Bmclapi => "https://bmclapi2.bangbang93.com/assets",
        MirrorSource::Official => "https://resources.download.minecraft.net",
    }
}

/// Get the libraries base URL for the given mirror source.
pub fn libraries_url(source: MirrorSource) -> &'static str {
    match source {
        MirrorSource::Bmclapi => "https://bmclapi2.bangbang93.com/maven/",
        MirrorSource::Official => "https://libraries.minecraft.net/",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_official_passthrough() {
        let url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
        assert_eq!(remap_url(url, MirrorSource::Official), url);
    }

    #[test]
    fn test_bmclapi_manifest() {
        let url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
        let expected = "https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json";
        assert_eq!(remap_url(url, MirrorSource::Bmclapi), expected);
    }

    #[test]
    fn test_bmclapi_assets() {
        let url = "https://resources.download.minecraft.net/ab/abc123";
        let expected = "https://bmclapi2.bangbang93.com/assets/ab/abc123";
        assert_eq!(remap_url(url, MirrorSource::Bmclapi), expected);
    }

    #[test]
    fn test_bmclapi_libraries() {
        let url = "https://libraries.minecraft.net/org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar";
        let expected =
            "https://bmclapi2.bangbang93.com/maven/org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar";
        assert_eq!(remap_url(url, MirrorSource::Bmclapi), expected);
    }

    #[test]
    fn test_bmclapi_forge_maven() {
        let url = "https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.1.0/forge-1.20.1-47.1.0-installer.jar";
        let expected = "https://bmclapi2.bangbang93.com/maven/net/minecraftforge/forge/1.20.1-47.1.0/forge-1.20.1-47.1.0-installer.jar";
        assert_eq!(remap_url(url, MirrorSource::Bmclapi), expected);
    }

    #[test]
    fn test_bmclapi_fabric_meta() {
        let url = "https://meta.fabricmc.net/v2/versions/loader";
        let expected = "https://bmclapi2.bangbang93.com/fabric-meta/v2/versions/loader";
        assert_eq!(remap_url(url, MirrorSource::Bmclapi), expected);
    }

    #[test]
    fn test_unknown_url_passthrough() {
        let url = "https://example.com/something.jar";
        assert_eq!(remap_url(url, MirrorSource::Bmclapi), url);
    }
}

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A unified content project returned from search results (Modrinth or CurseForge).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_search.ts")]
pub struct ContentProject {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    /// One of: mod, modpack, shader, resourcepack, datapack, plugin
    pub project_type: String,
    pub downloads: u64,
    pub follows: u32,
    pub categories: Vec<String>,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    /// "modrinth" or "curseforge"
    pub source: String,
    pub page_url: String,
    pub author: String,
    pub date_modified: String,
}

/// A single version/file of a content project.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_search.ts")]
pub struct ContentVersion {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub file_url: String,
    pub file_name: String,
    pub file_size: u64,
    pub date_published: String,
}

/// Search result wrapper with pagination info.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "content_search.ts")]
pub struct ContentSearchResult {
    pub hits: Vec<ContentProject>,
    pub total_hits: u32,
    pub offset: u32,
    pub limit: u32,
}

// ── Modrinth API response types (internal, not exported) ──

#[derive(Debug, Deserialize)]
struct ModrinthSearchResponse {
    hits: Vec<ModrinthHit>,
    total_hits: u32,
    offset: u32,
    limit: u32,
}

#[derive(Debug, Deserialize)]
struct ModrinthHit {
    project_id: String,
    slug: String,
    title: String,
    description: String,
    icon_url: Option<String>,
    project_type: String,
    downloads: u64,
    follows: u32,
    categories: Vec<String>,
    versions: Vec<String>,
    #[serde(default)]
    loaders: Option<Vec<String>>,
    author: String,
    date_modified: String,
}

#[derive(Debug, Deserialize)]
struct ModrinthVersion {
    id: String,
    project_id: String,
    name: String,
    version_number: String,
    game_versions: Vec<String>,
    loaders: Vec<String>,
    files: Vec<ModrinthFile>,
    date_published: String,
}

#[derive(Debug, Deserialize)]
struct ModrinthFile {
    url: String,
    filename: String,
    size: u64,
    primary: bool,
}

// ── Conversion helpers ──

impl ModrinthHit {
    fn into_content_project(self) -> ContentProject {
        let page_url = format!("https://modrinth.com/{}/{}", self.project_type, self.slug);
        ContentProject {
            id: self.project_id,
            slug: self.slug,
            title: self.title,
            description: self.description,
            icon_url: self.icon_url,
            project_type: self.project_type,
            downloads: self.downloads,
            follows: self.follows,
            categories: self.categories,
            game_versions: self.versions,
            loaders: self.loaders.unwrap_or_default(),
            source: "modrinth".to_string(),
            page_url,
            author: self.author,
            date_modified: self.date_modified,
        }
    }
}

impl ModrinthVersion {
    fn into_content_version(self) -> ContentVersion {
        let primary_file = self
            .files
            .iter()
            .find(|f| f.primary)
            .or_else(|| self.files.first());

        let (file_url, file_name, file_size) = match primary_file {
            Some(f) => (f.url.clone(), f.filename.clone(), f.size),
            None => (String::new(), String::new(), 0),
        };

        ContentVersion {
            id: self.id,
            project_id: self.project_id,
            name: self.name,
            version_number: self.version_number,
            game_versions: self.game_versions,
            loaders: self.loaders,
            file_url,
            file_name,
            file_size,
            date_published: self.date_published,
        }
    }
}

// ── Public API functions ──

const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";
const USER_AGENT: &str = concat!(
    "DropOut-Launcher/",
    env!("CARGO_PKG_VERSION"),
    " (github.com/HydroRoll-Team/DropOut)"
);

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

/// Search content on Modrinth.
///
/// `project_type` can be one of: mod, modpack, shader, resourcepack, datapack, plugin (or empty for all).
/// `sort_by` can be: relevance, downloads, follows, newest, updated.
pub async fn search_modrinth(
    query: &str,
    project_type: &str,
    game_versions: &[String],
    loaders: &[String],
    sort_by: &str,
    offset: u32,
    limit: u32,
) -> Result<ContentSearchResult, String> {
    let client = build_client()?;

    // Build facets array
    // Modrinth facets use the format: [["facet1:value1"],["facet2:value2"]]
    let mut facets: Vec<Vec<String>> = Vec::new();

    if !project_type.is_empty() {
        facets.push(vec![format!("project_type:{}", project_type)]);
    }

    if !game_versions.is_empty() {
        let version_facets: Vec<String> = game_versions
            .iter()
            .map(|v| format!("versions:{}", v))
            .collect();
        facets.push(version_facets);
    }

    if !loaders.is_empty() {
        let loader_facets: Vec<String> = loaders
            .iter()
            .map(|l| format!("categories:{}", l))
            .collect();
        facets.push(loader_facets);
    }

    let sort = match sort_by {
        "downloads" => "downloads",
        "follows" => "follows",
        "newest" => "newest",
        "updated" => "updated",
        _ => "relevance",
    };

    let mut params: Vec<(&str, String)> = vec![
        ("query", query.to_string()),
        ("index", sort.to_string()),
        ("offset", offset.to_string()),
        ("limit", limit.to_string()),
    ];

    if !facets.is_empty() {
        let facets_json =
            serde_json::to_string(&facets).map_err(|e| format!("Facets serialize error: {}", e))?;
        params.push(("facets", facets_json));
    }

    let url = format!("{}/search", MODRINTH_API_BASE);

    let resp = client
        .get(&url)
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("Modrinth search request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "unknown error".to_string());
        return Err(format!("Modrinth API error ({}): {}", status, body));
    }

    let search_result: ModrinthSearchResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Modrinth search response: {}", e))?;

    Ok(ContentSearchResult {
        hits: search_result
            .hits
            .into_iter()
            .map(|h| h.into_content_project())
            .collect(),
        total_hits: search_result.total_hits,
        offset: search_result.offset,
        limit: search_result.limit,
    })
}

/// Get versions/files for a specific project on Modrinth.
pub async fn get_modrinth_versions(
    project_id: &str,
    game_versions: &[String],
    loaders: &[String],
) -> Result<Vec<ContentVersion>, String> {
    let client = build_client()?;

    let url = format!("{}/project/{}/version", MODRINTH_API_BASE, project_id);

    let mut params: Vec<(&str, String)> = Vec::new();

    if !game_versions.is_empty() {
        let gv_json =
            serde_json::to_string(game_versions).map_err(|e| format!("Serialize error: {}", e))?;
        params.push(("game_versions", gv_json));
    }

    if !loaders.is_empty() {
        let loaders_json =
            serde_json::to_string(loaders).map_err(|e| format!("Serialize error: {}", e))?;
        params.push(("loaders", loaders_json));
    }

    let resp = client
        .get(&url)
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("Modrinth versions request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "unknown error".to_string());
        return Err(format!("Modrinth API error ({}): {}", status, body));
    }

    let versions: Vec<ModrinthVersion> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Modrinth versions response: {}", e))?;

    Ok(versions
        .into_iter()
        .map(|v| v.into_content_version())
        .collect())
}

/// Download a content file into the appropriate subfolder of an instance.
///
/// `subfolder` should be one of: mods, shaderpacks, resourcepacks, datapacks
pub async fn download_content_to_instance(
    instance_game_dir: &str,
    url: &str,
    file_name: &str,
    subfolder: &str,
) -> Result<String, String> {
    let client = build_client()?;

    let target_dir = std::path::Path::new(instance_game_dir).join(subfolder);
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create directory {}: {}", target_dir.display(), e))?;

    let target_path = target_dir.join(file_name);

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!("Download failed with status: {}", status));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download body: {}", e))?;

    std::fs::write(&target_path, &bytes)
        .map_err(|e| format!("Failed to write file {}: {}", target_path.display(), e))?;

    Ok(target_path.to_string_lossy().to_string())
}

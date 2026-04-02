use serde::{Deserialize, Deserializer, Serialize, Serializer, de, de::DeserializeOwned};

const CURSEFORGE_API_BASE_URL: &str = "https://api.curseforge.com";
const CURSEFORGE_API_KEY: Option<&str> = option_env!("CURSEFORGE_API_KEY");

macro_rules! curseforge_int_enum {
    (
        $vis:vis enum $name:ident : $repr:ty {
            $($variant:ident = $value:expr),+ $(,)?
        }
    ) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        #[repr($repr)]
        $vis enum $name {
            $($variant = $value),+
        }

        impl TryFrom<$repr> for $name {
            type Error = $repr;

            fn try_from(value: $repr) -> Result<Self, Self::Error> {
                match value {
                    $($value => Ok(Self::$variant),)+
                    _ => Err(value),
                }
            }
        }

        impl Serialize for $name {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                (*self as $repr).serialize(serializer)
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: Deserializer<'de>,
            {
                let value = <$repr>::deserialize(deserializer)?;
                Self::try_from(value).map_err(|value| {
                    de::Error::custom(format!("invalid {} value: {value}", stringify!($name)))
                })
            }
        }
    };
}

#[derive(Debug, Clone)]
pub(crate) struct CurseForgeApi {
    client: reqwest::Client,
}

impl CurseForgeApi {
    pub(crate) fn new(client: reqwest::Client) -> Self {
        Self { client }
    }

    pub(crate) async fn get_files(
        &self,
        request: &CurseForgeGetModFilesRequestBody,
    ) -> Result<CurseForgeGetFilesResponse, String> {
        if request.file_ids.is_empty() {
            return Ok(CurseForgeGetFilesResponse::default());
        }

        self.post("/v1/mods/files", request).await
    }

    pub(crate) async fn get_mods(
        &self,
        request: &CurseForgeGetModsByIdsListRequestBody,
    ) -> Result<CurseForgeGetModsResponse, String> {
        if request.mod_ids.is_empty() {
            return Ok(CurseForgeGetModsResponse::default());
        }

        self.post("/v1/mods", request).await
    }

    async fn post<TRequest, TResponse>(
        &self,
        endpoint: &str,
        body: &TRequest,
    ) -> Result<TResponse, String>
    where
        TRequest: Serialize + ?Sized,
        TResponse: DeserializeOwned,
    {
        let api_key = CURSEFORGE_API_KEY
            .ok_or("CurseForge modpack support requires CURSEFORGE_API_KEY set at build time")?;
        let response = self
            .client
            .post(format!("{CURSEFORGE_API_BASE_URL}{endpoint}"))
            .header("x-api-key", api_key)
            .json(body)
            .send()
            .await
            .map_err(|e| format!("CurseForge API error: {e}"))?;

        if !response.status().is_success() {
            return Err(format!("CurseForge API returned {}", response.status()));
        }

        response.json().await.map_err(|e| e.to_string())
    }
}

impl Default for CurseForgeApi {
    fn default() -> Self {
        Self::new(reqwest::Client::new())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeGetModFilesRequestBody {
    pub(crate) file_ids: Vec<u64>,
}

impl CurseForgeGetModFilesRequestBody {
    pub(crate) fn new(file_ids: Vec<u64>) -> Self {
        Self { file_ids }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeGetModsByIdsListRequestBody {
    pub(crate) mod_ids: Vec<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) filter_pc_only: Option<bool>,
}

impl CurseForgeGetModsByIdsListRequestBody {
    pub(crate) fn new(mod_ids: Vec<u64>) -> Self {
        Self {
            mod_ids,
            filter_pc_only: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct CurseForgeGetFilesResponse {
    #[serde(default)]
    pub(crate) data: Vec<CurseForgeFile>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct CurseForgeGetModsResponse {
    #[serde(default)]
    pub(crate) data: Vec<CurseForgeMod>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeCategory {
    pub(crate) id: u64,
    pub(crate) game_id: u64,
    pub(crate) name: String,
    pub(crate) slug: String,
    pub(crate) url: String,
    pub(crate) icon_url: String,
    pub(crate) date_modified: String,
    pub(crate) is_class: Option<bool>,
    pub(crate) class_id: Option<u64>,
    pub(crate) parent_category_id: Option<u64>,
    pub(crate) display_index: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeModLinks {
    pub(crate) website_url: String,
    pub(crate) wiki_url: String,
    pub(crate) issues_url: String,
    pub(crate) source_url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeModAuthor {
    pub(crate) id: u64,
    pub(crate) name: String,
    pub(crate) url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeModAsset {
    pub(crate) id: u64,
    pub(crate) mod_id: u64,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) thumbnail_url: String,
    pub(crate) url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeFileHash {
    pub(crate) value: String,
    pub(crate) algo: CurseForgeHashAlgo,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeSortableGameVersion {
    pub(crate) game_version_name: String,
    pub(crate) game_version_padded: String,
    pub(crate) game_version: String,
    pub(crate) game_version_release_date: String,
    pub(crate) game_version_type_id: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeFileDependency {
    pub(crate) mod_id: u64,
    pub(crate) relation_type: CurseForgeFileRelationType,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeFileModule {
    pub(crate) name: String,
    pub(crate) fingerprint: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeFileIndex {
    pub(crate) game_version: String,
    pub(crate) file_id: u64,
    pub(crate) filename: String,
    pub(crate) release_type: CurseForgeFileReleaseType,
    pub(crate) game_version_type_id: Option<u64>,
    pub(crate) mod_loader: CurseForgeModLoaderType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeFile {
    pub(crate) id: u64,
    pub(crate) game_id: u64,
    pub(crate) mod_id: u64,
    pub(crate) is_available: bool,
    pub(crate) display_name: String,
    pub(crate) file_name: String,
    pub(crate) release_type: CurseForgeFileReleaseType,
    pub(crate) file_status: CurseForgeFileStatus,
    #[serde(default)]
    pub(crate) hashes: Vec<CurseForgeFileHash>,
    pub(crate) file_date: String,
    pub(crate) file_length: u64,
    pub(crate) download_count: u64,
    pub(crate) file_size_on_disk: Option<u64>,
    #[serde(default)]
    pub(crate) download_url: Option<String>,
    #[serde(default)]
    pub(crate) game_versions: Vec<String>,
    #[serde(default)]
    pub(crate) sortable_game_versions: Vec<CurseForgeSortableGameVersion>,
    #[serde(default)]
    pub(crate) dependencies: Vec<CurseForgeFileDependency>,
    pub(crate) expose_as_alternative: Option<bool>,
    pub(crate) parent_project_file_id: Option<u64>,
    pub(crate) alternate_file_id: Option<u64>,
    pub(crate) is_server_pack: Option<bool>,
    pub(crate) server_pack_file_id: Option<u64>,
    pub(crate) is_early_access_content: Option<bool>,
    pub(crate) early_access_end_date: Option<String>,
    pub(crate) file_fingerprint: u64,
    #[serde(default)]
    pub(crate) modules: Vec<CurseForgeFileModule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurseForgeMod {
    pub(crate) id: u64,
    pub(crate) game_id: u64,
    pub(crate) name: String,
    pub(crate) slug: String,
    #[serde(default)]
    pub(crate) links: CurseForgeModLinks,
    pub(crate) summary: String,
    pub(crate) status: CurseForgeModStatus,
    pub(crate) download_count: u64,
    pub(crate) is_featured: bool,
    pub(crate) primary_category_id: u64,
    #[serde(default)]
    pub(crate) categories: Vec<CurseForgeCategory>,
    pub(crate) class_id: Option<u64>,
    #[serde(default)]
    pub(crate) authors: Vec<CurseForgeModAuthor>,
    pub(crate) logo: Option<CurseForgeModAsset>,
    #[serde(default)]
    pub(crate) screenshots: Vec<CurseForgeModAsset>,
    pub(crate) main_file_id: u64,
    #[serde(default)]
    pub(crate) latest_files: Vec<CurseForgeFile>,
    #[serde(default)]
    pub(crate) latest_files_indexes: Vec<CurseForgeFileIndex>,
    #[serde(default)]
    pub(crate) latest_early_access_files_indexes: Vec<CurseForgeFileIndex>,
    pub(crate) date_created: String,
    pub(crate) date_modified: String,
    pub(crate) date_released: String,
    pub(crate) allow_mod_distribution: Option<bool>,
    pub(crate) game_popularity_rank: u64,
    pub(crate) is_available: bool,
    pub(crate) thumbs_up_count: u64,
    pub(crate) rating: Option<f64>,
}

curseforge_int_enum! {
    pub(crate) enum CurseForgeHashAlgo: u8 {
        Sha1 = 1,
        Md5 = 2
    }
}

impl Default for CurseForgeHashAlgo {
    fn default() -> Self {
        Self::Sha1
    }
}

curseforge_int_enum! {
    pub(crate) enum CurseForgeFileRelationType: u8 {
        EmbeddedLibrary = 1,
        OptionalDependency = 2,
        RequiredDependency = 3,
        Tool = 4,
        Incompatible = 5,
        Include = 6
    }
}

impl Default for CurseForgeFileRelationType {
    fn default() -> Self {
        Self::RequiredDependency
    }
}

curseforge_int_enum! {
    pub(crate) enum CurseForgeFileReleaseType: u8 {
        Release = 1,
        Beta = 2,
        Alpha = 3
    }
}

impl Default for CurseForgeFileReleaseType {
    fn default() -> Self {
        Self::Release
    }
}

curseforge_int_enum! {
    pub(crate) enum CurseForgeFileStatus: u8 {
        Processing = 1,
        ChangesRequired = 2,
        UnderReview = 3,
        Approved = 4,
        Rejected = 5,
        MalwareDetected = 6,
        Deleted = 7,
        Archived = 8,
        Testing = 9,
        Released = 10,
        ReadyForReview = 11,
        Deprecated = 12,
        Baking = 13,
        AwaitingPublishing = 14,
        FailedPublishing = 15,
        Cooking = 16,
        Cooked = 17,
        UnderManualReview = 18,
        ScanningForMalware = 19,
        ProcessingFile = 20,
        PendingRelease = 21,
        ReadyForCooking = 22,
        PostProcessing = 23
    }
}

impl Default for CurseForgeFileStatus {
    fn default() -> Self {
        Self::Released
    }
}

curseforge_int_enum! {
    pub(crate) enum CurseForgeModLoaderType: u8 {
        Any = 0,
        Forge = 1,
        Cauldron = 2,
        LiteLoader = 3,
        Fabric = 4,
        Quilt = 5,
        NeoForge = 6
    }
}

impl Default for CurseForgeModLoaderType {
    fn default() -> Self {
        Self::Any
    }
}

curseforge_int_enum! {
    pub(crate) enum CurseForgeModStatus: u8 {
        New = 1,
        ChangesRequired = 2,
        UnderSoftReview = 3,
        Approved = 4,
        Rejected = 5,
        ChangesMade = 6,
        Inactive = 7,
        Abandoned = 8,
        Deleted = 9,
        UnderReview = 10
    }
}

impl Default for CurseForgeModStatus {
    fn default() -> Self {
        Self::Approved
    }
}

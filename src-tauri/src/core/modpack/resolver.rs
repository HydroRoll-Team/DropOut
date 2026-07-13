use std::collections::{HashMap, HashSet};

use futures::future::BoxFuture;

use super::{
    curseforge::{
        CurseForgeApi, CurseForgeFile, CurseForgeGetModFilesRequestBody,
        CurseForgeGetModsByIdsListRequestBody, CurseForgeMod,
    },
    types::{ModpackFile, ParsedModpack},
};

const CURSEFORGE_RESOURCE_PACK_CLASS_ID: u64 = 12;
const CURSEFORGE_SHADER_PACK_CLASS_ID: u64 = 6552;

pub(crate) trait ModpackFileResolver: Send + Sync {
    fn resolve<'a>(
        &'a self,
        modpack: ParsedModpack,
    ) -> BoxFuture<'a, Result<ParsedModpack, String>>;
}

pub(crate) struct ResolverChain {
    resolvers: Vec<Box<dyn ModpackFileResolver>>,
}

impl ResolverChain {
    pub(crate) fn new(resolvers: Vec<Box<dyn ModpackFileResolver>>) -> Self {
        Self { resolvers }
    }

    pub(crate) fn push<R>(&mut self, resolver: R)
    where
        R: ModpackFileResolver + 'static,
    {
        self.resolvers.push(Box::new(resolver));
    }
}

impl Default for ResolverChain {
    fn default() -> Self {
        Self::new(vec![Box::new(CurseForgeFileResolver::default())])
    }
}

impl ModpackFileResolver for ResolverChain {
    fn resolve<'a>(
        &'a self,
        mut modpack: ParsedModpack,
    ) -> BoxFuture<'a, Result<ParsedModpack, String>> {
        Box::pin(async move {
            for resolver in &self.resolvers {
                modpack = resolver.resolve(modpack).await?;
            }
            Ok(modpack)
        })
    }
}

pub(crate) struct CurseForgeFileResolver {
    api: CurseForgeApi,
}

impl CurseForgeFileResolver {
    pub(crate) fn new(api: CurseForgeApi) -> Self {
        Self { api }
    }

    async fn resolve_files(&self, files: &[ModpackFile]) -> Result<Vec<ModpackFile>, String> {
        let file_ids: Vec<u64> = files.iter().filter_map(file_id).collect();
        if file_ids.is_empty() {
            return Ok(Vec::new());
        }

        let file_items = self
            .api
            .get_files(&CurseForgeGetModFilesRequestBody::new(file_ids))
            .await?
            .data;
        let mod_ids: Vec<u64> = file_items
            .iter()
            .map(|item| item.mod_id)
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let class_ids = self.class_ids(&mod_ids).await;

        Ok(file_items
            .into_iter()
            .map(|item| {
                let class_id = class_ids.get(&item.mod_id).copied();
                map_curseforge_file(item, class_id)
            })
            .collect())
    }

    async fn class_ids(&self, mod_ids: &[u64]) -> HashMap<u64, u64> {
        let Ok(mods) = self
            .api
            .get_mods(&CurseForgeGetModsByIdsListRequestBody::new(
                mod_ids.to_vec(),
            ))
            .await
            .map(|response| response.data)
        else {
            return HashMap::new();
        };

        mods.into_iter().filter_map(mod_class_entry).collect()
    }
}

impl Default for CurseForgeFileResolver {
    fn default() -> Self {
        Self::new(CurseForgeApi::default())
    }
}

impl ModpackFileResolver for CurseForgeFileResolver {
    fn resolve<'a>(
        &'a self,
        mut modpack: ParsedModpack,
    ) -> BoxFuture<'a, Result<ParsedModpack, String>> {
        Box::pin(async move {
            if modpack.info.modpack_type != "curseforge" {
                return Ok(modpack);
            }

            let files = self.resolve_files(&modpack.files).await?;
            modpack.files = files;
            Ok(modpack)
        })
    }
}

fn file_id(file: &ModpackFile) -> Option<u64> {
    file.url
        .strip_prefix("curseforge://")?
        .split(':')
        .nth(1)?
        .parse()
        .ok()
}

fn map_curseforge_file(file: CurseForgeFile, class_id: Option<u64>) -> ModpackFile {
    let CurseForgeFile {
        id,
        file_name,
        download_url,
        file_length,
        ..
    } = file;
    let url = download_url.unwrap_or_else(|| {
        format!(
            "https://edge.forgecdn.net/files/{}/{}/{}",
            id / 1000,
            id % 1000,
            file_name
        )
    });
    let path = match class_id {
        Some(CURSEFORGE_RESOURCE_PACK_CLASS_ID) => format!("resourcepacks/{file_name}"),
        Some(CURSEFORGE_SHADER_PACK_CLASS_ID) => format!("shaderpacks/{file_name}"),
        _ => format!("mods/{file_name}"),
    };

    ModpackFile {
        url,
        path,
        size: Some(file_length),
        sha1: None,
    }
}

fn mod_class_entry(item: CurseForgeMod) -> Option<(u64, u64)> {
    Some((item.id, item.class_id?))
}

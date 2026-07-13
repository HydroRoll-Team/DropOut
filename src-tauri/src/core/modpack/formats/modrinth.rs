use super::super::{
    archive::{Archive, read_json},
    types::{ModpackFile, ModpackInfo, ParsedModpack},
};

pub(crate) fn parse(archive: &mut Archive) -> Result<ParsedModpack, String> {
    let json = read_json(archive, "modrinth.index.json")?;
    let (mod_loader, mod_loader_version) = parse_loader(&json["dependencies"]);

    let files = json["files"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|file| {
                    if file["env"]["client"].as_str() == Some("unsupported") {
                        return None;
                    }

                    let path = file["path"].as_str()?;
                    if path.contains("..") {
                        return None;
                    }

                    Some(ModpackFile {
                        path: path.to_string(),
                        url: file["downloads"].as_array()?.first()?.as_str()?.to_string(),
                        size: file["fileSize"].as_u64(),
                        sha1: file["hashes"]["sha1"].as_str().map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(ParsedModpack {
        info: ModpackInfo {
            name: json["name"].as_str().unwrap_or("Modrinth Modpack").into(),
            minecraft_version: json["dependencies"]["minecraft"].as_str().map(Into::into),
            mod_loader,
            mod_loader_version,
            modpack_type: "modrinth".into(),
            instance_id: None,
        },
        files,
        override_prefixes: vec!["client-overrides/".into(), "overrides/".into()],
    })
}

fn parse_loader(deps: &serde_json::Value) -> (Option<String>, Option<String>) {
    const LOADERS: [(&str, &str); 5] = [
        ("fabric-loader", "fabric"),
        ("forge", "forge"),
        ("quilt-loader", "quilt"),
        ("neoforge", "neoforge"),
        ("neo-forge", "neoforge"),
    ];

    LOADERS
        .iter()
        .find_map(|(key, name)| {
            let version = deps[*key].as_str()?;
            Some((Some((*name).to_string()), Some(version.to_string())))
        })
        .unwrap_or((None, None))
}

use super::super::{
    archive::{Archive, read_entry, read_json},
    types::{ModpackInfo, ParsedModpack},
};

pub(crate) fn parse(archive: &mut Archive) -> Result<ParsedModpack, String> {
    let root = find_root(archive).ok_or("not multimc")?;
    let cfg = read_entry(archive, &format!("{root}instance.cfg")).ok_or("not multimc")?;
    let name = cfg_value(&cfg, "name").unwrap_or_else(|| "MultiMC Modpack".into());

    let (minecraft_version, mod_loader, mod_loader_version) =
        read_json(archive, &format!("{root}mmc-pack.json"))
            .map(|json| parse_components(&json))
            .unwrap_or_default();
    let minecraft_version = minecraft_version.or_else(|| cfg_value(&cfg, "IntendedVersion"));

    Ok(ParsedModpack {
        info: ModpackInfo {
            name,
            minecraft_version,
            mod_loader,
            mod_loader_version,
            modpack_type: "multimc".into(),
            instance_id: None,
        },
        files: Vec::new(),
        override_prefixes: vec![format!("{root}.minecraft/"), format!("{root}minecraft/")],
    })
}

fn cfg_value(content: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}=");
    content
        .lines()
        .find_map(|line| Some(line.strip_prefix(&prefix)?.trim().to_string()))
}

fn find_root(archive: &mut Archive) -> Option<String> {
    for index in 0..archive.len() {
        let name = archive.by_index_raw(index).ok()?.name().to_string();
        if name == "instance.cfg" {
            return Some(String::new());
        }
        if name.ends_with("/instance.cfg") && name.matches('/').count() == 1 {
            return Some(name.strip_suffix("instance.cfg")?.to_string());
        }
    }
    None
}

fn parse_components(json: &serde_json::Value) -> (Option<String>, Option<String>, Option<String>) {
    let (mut minecraft_version, mut mod_loader, mut mod_loader_version) = (None, None, None);

    for component in json["components"].as_array().into_iter().flatten() {
        let version = component["version"].as_str().map(String::from);
        match component["uid"].as_str().unwrap_or("") {
            "net.minecraft" => minecraft_version = version,
            "net.minecraftforge" => {
                mod_loader = Some("forge".into());
                mod_loader_version = version;
            }
            "net.neoforged" => {
                mod_loader = Some("neoforge".into());
                mod_loader_version = version;
            }
            "net.fabricmc.fabric-loader" => {
                mod_loader = Some("fabric".into());
                mod_loader_version = version;
            }
            "org.quiltmc.quilt-loader" => {
                mod_loader = Some("quilt".into());
                mod_loader_version = version;
            }
            "com.mumfrey.liteloader" => {
                mod_loader = Some("liteloader".into());
                mod_loader_version = version;
            }
            _ => {}
        }
    }

    (minecraft_version, mod_loader, mod_loader_version)
}

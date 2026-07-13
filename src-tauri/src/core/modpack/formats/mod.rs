mod curseforge;
mod modrinth;
mod multimc;

use super::{archive::Archive, types::ParsedModpack};

type ParserFn = fn(&mut Archive) -> Result<ParsedModpack, String>;

const PARSERS: [ParserFn; 3] = [modrinth::parse, curseforge::parse, multimc::parse];

pub(crate) fn parse(archive: &mut Archive) -> Result<ParsedModpack, String> {
    PARSERS
        .iter()
        .find_map(|parser| parser(archive).ok())
        .ok_or_else(|| "unsupported modpack".to_string())
}

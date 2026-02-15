use darling::FromMeta;

#[derive(Default, FromMeta)]
#[darling(default)]
#[darling(derive_syn_parse)]
pub struct MacroArgs {
    pub export_to: Option<String>,
    pub export_to_path: Option<String>,
    pub import_from: Option<String>,
}

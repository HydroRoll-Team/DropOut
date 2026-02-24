use std::collections::BTreeSet;

#[derive(Debug)]
pub struct ApiInfo {
    pub fn_name: &'static str,
    pub ts_fn_name: &'static str,
    pub param_names: &'static [&'static str],
    pub param_defs: &'static [&'static str],
    pub return_ts_promise: &'static str,
    pub import_types: &'static [&'static str],
    pub import_from: Option<&'static str>,
}

inventory::collect!(ApiInfo);

fn sort_api_infos(api_infos: &mut [&ApiInfo]) {
    api_infos.sort_by(|a, b| a.fn_name.cmp(b.fn_name));
}

pub fn export_api_bindings(import_from: &str, export_to: &str) {
    use std::collections::BTreeMap;

    let mut api_infos = inventory::iter::<ApiInfo>.into_iter().collect::<Vec<_>>();
    if api_infos.is_empty() {
        return;
    }
    sort_api_infos(&mut api_infos);

    let mut ts_lines = Vec::new();
    ts_lines.push(r#"import { invoke } from "@tauri-apps/api/core""#.to_string());

    let mut import_types: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
    let mut ts_funcs = Vec::new();
    for api_info in api_infos {
        let api_types = api_info.import_types.iter().cloned().collect::<Vec<_>>();
        import_types
            .entry(api_info.import_from.unwrap_or(import_from))
            .or_insert_with(BTreeSet::new)
            .extend(api_types.clone());
        if api_types.contains(&"Vec") {
            eprintln!("???? from  {}", api_info.fn_name)
        }

        // Determine return generic for invoke: need the raw type (not Promise<...>)
        let invoke_generic = if api_info.return_ts_promise.starts_with("Promise<")
            && api_info.return_ts_promise.ends_with('>')
        {
            &api_info.return_ts_promise["Promise<".len()..api_info.return_ts_promise.len() - 1]
        } else {
            "unknown"
        };
        let invoke_line = if api_info.param_names.is_empty() {
            format!("invoke<{}>(\"{}\")", invoke_generic, api_info.fn_name)
        } else {
            format!(
                "invoke<{}>(\"{}\", {{\n        {}\n    }})",
                invoke_generic,
                api_info.fn_name,
                api_info.param_names.join(", ")
            )
        };

        ts_funcs.push(format!(
            "export function {}({}): {} {{\n    \
                return {}\n\
            }}\n",
            api_info.ts_fn_name,
            api_info.param_defs.join(", "),
            api_info.return_ts_promise,
            invoke_line
        ))
    }

    for (import_from, import_types) in import_types {
        ts_lines.push(format!(
            "import type {{ {} }} from \"{}\"",
            import_types.iter().cloned().collect::<Vec<_>>().join(", "),
            import_from
        ))
    }
    ts_lines.push("".to_string());
    ts_lines.extend(ts_funcs);

    let ts_content = ts_lines.join("\n");
    let export_to = std::path::Path::new(export_to);
    if let Some(parent) = export_to.parent() {
        std::fs::create_dir_all(parent).expect("Failed to create parent directory");
    }
    std::fs::write(export_to, ts_content).unwrap();
}

#[ctor::dtor]
fn __dropout_export_api_bindings() {
    export_api_bindings("@/types", "../packages/ui-new/src/client.ts");
}

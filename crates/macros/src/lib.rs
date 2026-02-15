use proc_macro::TokenStream;
use quote::quote;
use std::collections::BTreeSet;
use syn::{
    parse::Parse, parse::ParseStream, parse_macro_input, punctuated::Punctuated, token::Comma,
    Expr, FnArg, Ident, ItemFn, Lit, MetaNameValue, Pat, PathArguments, ReturnType, Type,
};

use crate::attr::MacroArgs;

mod attr;

fn get_lit_str_value(nv: &MetaNameValue) -> Option<String> {
    // In syn v2 MetaNameValue.value is an Expr (usually Expr::Lit). Extract string literal if present.
    match &nv.value {
        Expr::Lit(expr_lit) => {
            if let Lit::Str(s) = &expr_lit.lit {
                Some(s.value())
            } else {
                None
            }
        }
        _ => None,
    }
}

fn is_state_or_window(ty: &Type) -> bool {
    // Unwrap reference
    let mut t = ty;
    if let Type::Reference(r) = t {
        t = &*r.elem;
    }

    if let Type::Path(p) = t {
        if let Some(seg) = p.path.segments.last() {
            let ident = seg.ident.to_string();
            if ident == "Window" || ident == "State" {
                return true;
            }
        }
    }
    false
}

fn extract_ident_from_type(ty: &Type) -> Option<String> {
    // Peel references, arrays, etc. Only handle Path types
    let mut t = ty;
    if let Type::Reference(r) = t {
        t = &*r.elem;
    }

    if let Type::Path(p) = t {
        // Handle Option<T>, Result, etc.
        if let Some(seg) = p.path.segments.last() {
            let ident = seg.ident.to_string();
            if ident == "Option" {
                // extract generic arg (use helper)
                if let Some(inner) = first_type_arg_from_pathargs(&seg.arguments) {
                    return extract_ident_from_type(inner);
                }
            } else {
                // For multi-segment like core::java::JavaDownloadInfo we return last segment ident
                return Some(ident);
            }
        }
    }
    None
}

fn first_type_arg_from_pathargs(pa: &PathArguments) -> Option<&Type> {
    // Given PathArguments (e.g. from a PathSegment), return the first GenericArgument::Type if present.
    if let PathArguments::AngleBracketed(ab) = pa {
        for arg in ab.args.iter() {
            if let syn::GenericArgument::Type(ty) = arg {
                return Some(ty);
            }
        }
    }
    None
}

fn rust_type_to_ts(ty: &Type) -> (String, bool) {
    // returns (ts_type, is_struct_like)
    // is_struct_like signals that this type probably needs import from `import_from`
    // Simple mapping: String -> string, primitives -> number, bool -> boolean, others -> ident
    let mut t = ty;
    // Unwrap references
    if let Type::Reference(r) = t {
        t = &*r.elem;
    }

    if let Type::Path(p) = t {
        if let Some(seg) = p.path.segments.last() {
            let ident = seg.ident.to_string();
            // handle Option<T>
            if ident == "Option" {
                if let Some(inner) = first_type_arg_from_pathargs(&seg.arguments) {
                    let (inner_ts, inner_struct) = rust_type_to_ts(inner);
                    // make optional, represent as type | null
                    return (format!("{} | null", inner_ts), inner_struct);
                }
            }
            return match ident.as_str() {
                "String" => ("string".to_string(), false),
                "str" => ("string".to_string(), false),
                "bool" => ("boolean".to_string(), false),
                "u8" | "u16" | "u32" | "u64" | "u128" | "i8" | "i16" | "i32" | "i64" | "i128"
                | "usize" | "isize" | "f32" | "f64" => ("number".to_string(), false),
                "Vec" => {
                    // Vec<T> -> T[]
                    if let Some(inner) = first_type_arg_from_pathargs(&seg.arguments) {
                        let (inner_ts, inner_struct) = rust_type_to_ts(inner);
                        return (format!("{}[]", inner_ts), inner_struct);
                    }
                    ("any[]".to_string(), false)
                }
                other => {
                    // treat as struct/complex type
                    (other.to_string(), true)
                }
            };
        }
    }
    ("any".to_string(), false)
}

fn get_return_ts(ty: &ReturnType) -> (String, BTreeSet<String>) {
    // returns (promise_ts_type, set_of_structs_to_import)
    let mut imports = BTreeSet::new();
    match ty {
        ReturnType::Default => ("Promise<void>".to_string(), imports),
        ReturnType::Type(_, boxed) => {
            // look for Result<T, E> commonly
            let t = &**boxed;
            if let Type::Path(p) = t {
                if let Some(seg) = p.path.segments.last() {
                    let ident = seg.ident.to_string();
                    if ident == "Result" {
                        if let Some(ok_ty) = first_type_arg_from_pathargs(&seg.arguments) {
                            let (ts, is_struct) = rust_type_to_ts(ok_ty);
                            if is_struct {
                                if let Some(name) = extract_ident_from_type(ok_ty) {
                                    imports.insert(name);
                                }
                            }
                            return (format!("Promise<{}>", ts), imports);
                        }
                    } else {
                        // not Result - map directly
                        let (ts, is_struct) = rust_type_to_ts(t);
                        if is_struct {
                            if let Some(name) = extract_ident_from_type(t) {
                                imports.insert(name);
                            }
                        }
                        return (format!("Promise<{}>", ts), imports);
                    }
                }
            }
            // fallback
            ("Promise<any>".to_string(), imports)
        }
    }
}

fn snake_to_camel(s: &str) -> String {
    let mut parts = s.split('_');
    let mut out = String::new();
    if let Some(first) = parts.next() {
        out.push_str(&first.to_ascii_lowercase());
    }
    for p in parts {
        if p.is_empty() {
            continue;
        }
        let mut chs = p.chars();
        if let Some(c) = chs.next() {
            out.push_str(&c.to_ascii_uppercase().to_string());
            out.push_str(&chs.as_str().to_ascii_lowercase());
        }
    }
    out
}

#[proc_macro_attribute]
pub fn api(attr: TokenStream, item: TokenStream) -> TokenStream {
    // Parse attribute args via `darling` crate
    let meta: MacroArgs = match syn::parse(attr) {
        Ok(meta) => meta,
        Err(err) => return err.into_compile_error().into(),
    };
    let input_fn = parse_macro_input!(item as ItemFn);

    // Extract attribute args: export_to, import_from
    let export_to = match (meta.export_to, meta.export_to_path) {
        (Some(to), None) => Some(to),
        (_, Some(path)) => Some(path),
        (None, None) => None,
    };
    let import_from = meta.import_from;

    // Analyze function
    let fn_name_ident: Ident = input_fn.sig.ident.clone();
    let fn_name = fn_name_ident.to_string();
    let ts_fn_name = snake_to_camel(&fn_name);

    // Collect parameters (ignore State/Window)
    let mut param_names: Vec<String> = Vec::new();
    let mut param_defs: Vec<String> = Vec::new();
    let mut import_types: BTreeSet<String> = BTreeSet::new();

    for input in input_fn.sig.inputs.iter() {
        match input {
            FnArg::Receiver(_) => {
                // skip self
            }
            FnArg::Typed(pt) => {
                // Get parameter identifier
                let pat = &*pt.pat;
                let param_ident = if let Pat::Ident(pi) = pat {
                    Some(pi.ident.to_string())
                } else {
                    // ignore complex patterns
                    continue;
                };

                // Check if type should be ignored (State, Window)
                if is_state_or_window(&*pt.ty) {
                    continue;
                }

                // Map type
                let (ts_type, is_struct) = rust_type_to_ts(&*pt.ty);
                if is_struct {
                    if let Some(name) = extract_ident_from_type(&*pt.ty) {
                        import_types.insert(name);
                    }
                }

                if let Some(pn) = param_ident {
                    // Convert param name to camelCase - keep existing but ensure camelCase for TS
                    // We'll convert snake_case param names to camelCase
                    let ts_param_name = snake_to_camel(&pn);
                    param_names.push(ts_param_name.clone());
                    param_defs.push(format!("{}: {}", ts_param_name, ts_type));
                }
            }
        }
    }

    // Return type
    let (return_ts_promise, return_imports) = get_return_ts(&input_fn.sig.output);
    for r in return_imports {
        import_types.insert(r);
    }

    // Build TypeScript code string
    let mut ts_lines: Vec<String> = Vec::new();

    ts_lines.push(r#"import { invoke } from "@tauri-apps/api/core""#.to_string());

    if !import_types.is_empty() {
        if let Some(import_from_str) = import_from.clone() {
            let types_joined = import_types.iter().cloned().collect::<Vec<_>>().join(", ");
            ts_lines.push(format!(
                "import {{ {} }} from \"{}\"",
                types_joined, import_from_str
            ));
        } else {
            // If no import_from provided, still import types from local path? We'll skip if not provided.
        }
    }

    // function signature
    let params_sig = param_defs.join(", ");
    let params_pass = if param_names.is_empty() {
        "".to_string()
    } else {
        // Build object like { majorVersion, imageType }
        format!("{}", param_names.join(", "))
    };

    // Determine return generic for invoke: need the raw type (not Promise<...>)
    let invoke_generic =
        if return_ts_promise.starts_with("Promise<") && return_ts_promise.ends_with('>') {
            &return_ts_promise["Promise<".len()..return_ts_promise.len() - 1]
        } else {
            "any"
        };

    let invoke_line = if param_names.is_empty() {
        format!("    return invoke<{}>(\"{}\")", invoke_generic, fn_name)
    } else {
        format!(
            "    return invoke<{}>(\"{}\", {{ {} }})",
            invoke_generic, fn_name, params_pass
        )
    };

    ts_lines.push(format!(
        "export async function {}({}): {} {{",
        ts_fn_name, params_sig, return_ts_promise
    ));
    ts_lines.push(invoke_line);
    ts_lines.push("}".to_string());

    let ts_contents = ts_lines.join("\n") + "\n";

    // Prepare test function name
    let test_fn_name = Ident::new(
        &format!("tauri_export_bindings_{}", fn_name),
        fn_name_ident.span(),
    );

    // Generate code for test function that writes the TS string to file
    let export_to_literal = match export_to {
        Some(ref s) => s.clone(),
        None => String::new(),
    };

    // Build tokens
    let original_fn = &input_fn;
    let ts_string_literal = ts_contents.clone();

    let write_stmt = if export_to_literal.is_empty() {
        // No-op: don't write
        // quote! {
        //     // No export_to provided; skipping file write.
        // }
        panic!("No export_to provided")
    } else {
        // We'll append to the file to avoid overwriting existing bindings from other macros.
        // Use create(true).append(true)
        let path = export_to_literal.clone();
        let ts_lit = syn::LitStr::new(&ts_string_literal, proc_macro2::Span::call_site());
        quote! {
            {
                // Ensure parent directories exist if possible (best-effort)
                let path = std::path::Path::new(#path);
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                // Append generated bindings to file
                match OpenOptions::new().create(true).append(true).open(path) {
                    Ok(mut f) => {
                        let _ = f.write_all(#ts_lit.as_bytes());
                        println!("Successfully wrote to {}", path.display());
                    }
                    Err(e) => {
                        eprintln!("dropout::api binding write failed: {}", e);
                    }
                }
            }
        }
    };

    let gen = quote! {
        #original_fn

        #[cfg(test)]
        mod __dropout_export_tests {
            use super::*;
            use std::fs::OpenOptions;
            use std::io::Write;

            #[test]
            fn #test_fn_name() {
                // Generated TypeScript bindings for function: #fn_name
                #write_stmt
            }
        }
    };

    gen.into()
}

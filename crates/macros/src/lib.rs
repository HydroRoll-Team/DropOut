use heck::ToLowerCamelCase;
use proc_macro::TokenStream;
use quote::quote;
use std::collections::BTreeSet;
use syn::{parse_macro_input, FnArg, Ident, ItemFn, Pat, PathArguments, ReturnType, Type};

use crate::attr::MacroArgs;

mod attr;

const TAURI_NATIVE_TYPES: &[&str] = &["Window", "State", "AppHandle"];
fn is_tauri_native(ty: &Type) -> bool {
    // Unwrap reference
    let mut t = ty;
    if let Type::Reference(r) = t {
        t = &*r.elem;
    }

    if let Type::Path(p) = t {
        if let Some(seg) = p.path.segments.last() {
            let ident = seg.ident.to_string();
            if TAURI_NATIVE_TYPES.contains(&ident.as_ref()) {
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
            match ident.as_str() {
                "Option" | "Vec" => {
                    // extract generic arg (use helper)
                    if let Some(inner) = first_type_arg_from_pathargs(&seg.arguments) {
                        return extract_ident_from_type(inner);
                    }
                }
                // For multi-segment like core::java::JavaDownloadInfo we return last segment ident
                _ => return Some(ident),
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

    if let Type::Tuple(tuple) = t {
        if tuple.elems.is_empty() {
            return ("void".to_string(), false);
        }
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
                    ("unknown[]".to_string(), false)
                }
                other => {
                    // treat as struct/complex type
                    (other.to_string(), true)
                }
            };
        }
    }
    ("unknown".to_string(), false)
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
            ("Promise<unknown>".to_string(), imports)
        }
    }
}

#[proc_macro_attribute]
pub fn api(attr: TokenStream, item: TokenStream) -> TokenStream {
    // Parse attribute args via `darling` crate
    let meta: MacroArgs = match syn::parse(attr) {
        Ok(meta) => meta,
        Err(err) => return err.into_compile_error().into(),
    };
    let input_fn = parse_macro_input!(item as ItemFn);
    let import_from = meta.import_from;

    // Analyze function
    let fn_name_ident: Ident = input_fn.sig.ident.clone();
    let fn_name = fn_name_ident.to_string();
    let ts_fn_name = fn_name.to_lower_camel_case();

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
                if is_tauri_native(&*pt.ty) {
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
                    let ts_param_name = pn.to_lower_camel_case();
                    param_names.push(ts_param_name.clone());
                    param_defs.push(format!("{}: {}", ts_param_name, ts_type));
                }
            }
        }
    }

    // Return type
    let (return_ts_promise, return_imports) = get_return_ts(&input_fn.sig.output);
    import_types.extend(return_imports);

    // Prepare test mod name
    let test_mod_name = Ident::new(
        &format!("__dropout_export_tests_{}", fn_name),
        fn_name_ident.span(),
    );
    // Prepare test function name
    let test_fn_name = Ident::new(
        &format!("tauri_export_bindings_{}", fn_name),
        fn_name_ident.span(),
    );

    // Build tokens
    let original_fn = &input_fn;
    let return_ts_promise_lit =
        syn::LitStr::new(&return_ts_promise, proc_macro2::Span::call_site());
    let import_from_lit = match &import_from {
        Some(s) => syn::Ident::new(&format!("Some({})", s), proc_macro2::Span::call_site()),
        None => syn::Ident::new("None", proc_macro2::Span::call_site()),
    };

    let register_stmt = quote! {
      ::inventory::submit! {
        crate::utils::api::ApiInfo {
          fn_name: #fn_name,
          ts_fn_name: #ts_fn_name,
          param_names: &[#(#param_names),*],
          param_defs: &[#(#param_defs),*],
          return_ts_promise: #return_ts_promise_lit,
          import_types: &[#(#import_types),*],
          import_from: #import_from_lit,
        }
      }
    };

    let gen = quote! {
        #original_fn

        #[cfg(test)]
        mod #test_mod_name {
            use crate::utils::api::*;

            #[test]
            fn #test_fn_name() {
                #register_stmt
            }
        }
    };

    gen.into()
}

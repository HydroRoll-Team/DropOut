fn main() {
    // Load .env file if present so optional build-time vars (e.g. CURSEFORGE_API_KEY)
    // are available to option_env!() without requiring CI to have a real .env file.
    if let Ok(path) = dotenvy::dotenv() {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    println!("cargo:rerun-if-env-changed=CURSEFORGE_API_KEY");

    // For MinGW targets, use embed-resource to generate proper COFF format
    #[cfg(all(windows, target_env = "gnu"))]
    {
        embed_resource::compile("icon.rc", embed_resource::NONE);
    }

    tauri_build::build()
}

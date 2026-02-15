fn main() {
    // For MinGW targets, use embed-resource to generate proper COFF format
    #[cfg(all(windows, target_env = "gnu"))]
    {
        embed_resource::compile("icon.rc", embed_resource::NONE);
    }
    
    tauri_build::build()
}

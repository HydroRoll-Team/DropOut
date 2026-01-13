// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, State, Window}; // Added Manager

mod core;
mod launcher;
mod utils;

#[tauri::command]
async fn start_game(
    window: Window,
    state: State<'_, core::auth::AccountState>,
    version_id: String
) -> Result<String, String> {
    println!("Backend received StartGame for {}", version_id);
    
    // Check for active account
    let account = state.active_account.lock().unwrap().clone()
        .ok_or("No active account found. Please login first.")?;

    // Get App Data Directory (e.g., ~/.local/share/com.dropout.launcher or similar)
    // The identifier is set in tauri.conf.json.
    // If not accessible, use a specific logic.
    let app_handle = window.app_handle();
    let game_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // Ensure game directory exists
    tokio::fs::create_dir_all(&game_dir).await.map_err(|e| e.to_string())?;

    println!("Game Directory: {:?}", game_dir);

    // 1. Fetch manifest to find the version URL
    let manifest = core::manifest::fetch_version_manifest().await.map_err(|e| e.to_string())?;
    
    // Find the version info
    let version_info = manifest.versions.iter().find(|v| v.id == version_id)
        .ok_or_else(|| format!("Version {} not found in manifest", version_id))?;
    
    // 2. Fetch specific version JSON (client.jar info)
    let version_url = &version_info.url;
    let version_details: core::game_version::GameVersion = reqwest::get(version_url)
        .await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    // 3. Prepare download tasks
    let mut download_tasks = Vec::new();

    // --- Client Jar ---
    let client_jar = version_details.downloads.client;
    let mut client_path = game_dir.join("versions");
    client_path.push(&version_id);
    client_path.push(format!("{}.jar", version_id));

    download_tasks.push(core::downloader::DownloadTask {
        url: client_jar.url,
        path: client_path.clone(),
        sha1: Some(client_jar.sha1),
    });

    // --- Libraries ---
    println!("Processing libraries...");
    let libraries_dir = game_dir.join("libraries");
    let mut native_libs_paths = Vec::new(); // Store paths to native jars for extraction
    
    for lib in &version_details.libraries {
        if core::rules::is_library_allowed(&lib.rules) {
             // 1. Standard Library
             if let Some(downloads) = &lib.downloads {
                 if let Some(artifact) = &downloads.artifact {
                     let path_str = artifact.path.clone().unwrap_or_else(|| {
                         format!("{}.jar", lib.name) 
                     });
                     
                     let mut lib_path = libraries_dir.clone();
                     lib_path.push(path_str);
                     
                     download_tasks.push(core::downloader::DownloadTask {
                         url: artifact.url.clone(),
                         path: lib_path,
                         sha1: Some(artifact.sha1.clone()),
                     });
                 }
                 
                 // 2. Native Library (classifiers)
                 // e.g. "natives-linux": { ... }
                 if let Some(classifiers) = &downloads.classifiers {
                     // Determine the key based on OS
                     // Linux usually "natives-linux", Windows "natives-windows", Mac "natives-osx" (or macos)
                     let os_key = if cfg!(target_os = "linux") {
                         "natives-linux"
                     } else if cfg!(target_os = "windows") {
                         "natives-windows"
                     } else if cfg!(target_os = "macos") {
                         "natives-osx" // or natives-macos? check json
                     } else {
                         ""
                     };

                     if let Some(native_artifact_value) = classifiers.get(os_key) {
                         // Parse it as DownloadArtifact
                         if let Ok(native_artifact) = serde_json::from_value::<core::game_version::DownloadArtifact>(native_artifact_value.clone()) {
                             let path_str = native_artifact.path.clone().unwrap(); // Natives usually have path
                             let mut native_path = libraries_dir.clone();
                             native_path.push(&path_str);
                             
                             download_tasks.push(core::downloader::DownloadTask {
                                 url: native_artifact.url,
                                 path: native_path.clone(),
                                 sha1: Some(native_artifact.sha1),
                             });
                             
                             native_libs_paths.push(native_path);
                         }
                     }
                 }
             }
        }
    }

    // --- Assets ---
    println!("Fetching asset index...");
    let assets_dir = game_dir.join("assets");
    let objects_dir = assets_dir.join("objects");
    let indexes_dir = assets_dir.join("indexes");

    // Download Asset Index JSON
    let asset_index_path = indexes_dir.join(format!("{}.json", version_details.asset_index.id));
    
    // Check if index exists or download it
    // Note: We need the content of this file to parse it. 
    // If we just add it to download_tasks, we can't parse it *now*. 
    // So we must download it immediately (await) before processing objects.

    let asset_index_content: String = if asset_index_path.exists() {
         tokio::fs::read_to_string(&asset_index_path).await.map_err(|e| e.to_string())?
    } else {
        println!("Downloading asset index from {}", version_details.asset_index.url);
        let content = reqwest::get(&version_details.asset_index.url)
             .await.map_err(|e| e.to_string())?
             .text().await.map_err(|e| e.to_string())?;
        
        // Save it for next time
        tokio::fs::create_dir_all(&indexes_dir).await.map_err(|e| e.to_string())?;
        tokio::fs::write(&asset_index_path, &content).await.map_err(|e| e.to_string())?;
        content
    };

    #[derive(serde::Deserialize, Debug)]
    struct AssetObject {
        hash: String,
        size: u64,
    }
    
    #[derive(serde::Deserialize, Debug)]
    struct AssetIndexJson {
        objects: std::collections::HashMap<String, AssetObject>,
    }

    let asset_index_parsed: AssetIndexJson = serde_json::from_str(&asset_index_content).map_err(|e| e.to_string())?;
    
    println!("Processing {} assets...", asset_index_parsed.objects.len());
    
    for (_name, object) in asset_index_parsed.objects {
        let hash = object.hash;
        let prefix = &hash[0..2];
        let path = objects_dir.join(prefix).join(&hash);
        let url = format!("https://resources.download.minecraft.net/{}/{}", prefix, hash);
        
        download_tasks.push(core::downloader::DownloadTask {
            url,
            path,
            sha1: Some(hash),
        });
    }


    println!("Total download tasks (Client + Libs + Assets): {}", download_tasks.len());
    
    // 4. Start Download
    core::downloader::download_files(window, download_tasks).await.map_err(|e| e.to_string())?;

    // 5. Extract Natives
    println!("Extracting natives...");
    let natives_dir = game_dir.join("versions").join(&version_id).join("natives");
    
    // Clean old natives if they exist to prevent conflicts
    if natives_dir.exists() {
        tokio::fs::remove_dir_all(&natives_dir).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::create_dir_all(&natives_dir).await.map_err(|e| e.to_string())?;

    for path in native_libs_paths {
        if path.exists() {
             println!("Extracting native: {:?}", path);
             utils::zip::extract_zip(&path, &natives_dir)?;
        }
    }

    // 6. Construct Classpath
    let cp_separator = if cfg!(target_os = "windows") { ";" } else { ":" };
    let mut classpath_entries = Vec::new();
    
    // Add libraries
    for lib in &version_details.libraries {
        if core::rules::is_library_allowed(&lib.rules) {
             if let Some(downloads) = &lib.downloads {
                 if let Some(artifact) = &downloads.artifact {
                     let path_str = artifact.path.clone().unwrap_or_else(|| {
                         format!("{}.jar", lib.name) 
                     });
                     let lib_path = libraries_dir.join(path_str);
                     classpath_entries.push(lib_path.to_string_lossy().to_string());
                 }
             }
        }
    }
    // Add client jar
    classpath_entries.push(client_path.to_string_lossy().to_string());
    
    let classpath = classpath_entries.join(cp_separator);

    // 7. Prepare Arguments
    let mut args = Vec::new();
    let natives_path = natives_dir.to_string_lossy().to_string();
    
    // 7a. JVM Arguments (Simplified for now)
    // We inject standard convenient defaults.
    // TODO: Parse 'arguments.jvm' from version.json for full compatibility (Mac M1 support etc)
    args.push(format!("-Djava.library.path={}", natives_path));
    args.push("-Xmx2G".to_string()); // Default memory
    args.push("-Xms1G".to_string());
    args.push("-cp".to_string());
    args.push(classpath);

    // 7b. Main Class
    args.push(version_details.main_class.clone());

    // 7c. Game Arguments
    // Replacements map
    let mut replacements = std::collections::HashMap::new();
    replacements.insert("${auth_player_name}", account.username.clone());
    replacements.insert("${version_name}", version_id.clone());
    replacements.insert("${game_directory}", game_dir.to_string_lossy().to_string());
    replacements.insert("${assets_root}", assets_dir.to_string_lossy().to_string());
    replacements.insert("${assets_index_name}", version_details.asset_index.id.clone());
    replacements.insert("${auth_uuid}", account.uuid.clone());
    replacements.insert("${auth_access_token}", "null".to_string()); // Offline
    replacements.insert("${user_type}", "mojang".to_string());
    replacements.insert("${version_type}", "release".to_string());

    if let Some(minecraft_arguments) = &version_details.minecraft_arguments {
        // Legacy string
        for part in minecraft_arguments.split_whitespace() {
            let mut arg = part.to_string();
            for (key, val) in &replacements {
                arg = arg.replace(key, val);
            }
            args.push(arg);
        }
    } else if let Some(args_obj) = &version_details.arguments {
        if let Some(game_args) = &args_obj.game {
            // Can be array of strings or objects
             if let Some(list) = game_args.as_array() {
                 for item in list {
                     if let Some(s) = item.as_str() {
                         let mut arg = s.to_string();
                         for (key, val) in &replacements {
                             arg = arg.replace(key, val);
                         }
                         args.push(arg);
                     } else if let Some(obj) = item.as_object() {
                         // Check rules
                         // Simplified: if it has "value", and rules pass.
                         // For now, assuming rules pass if no "rules" field or simplistic check
                         // Ideally we should implement a helper to check rules for args just like libs
                         
                         let allow = if let Some(rules_val) = obj.get("rules") {
                             if let Ok(rules) = serde_json::from_value::<Vec<core::game_version::Rule>>(rules_val.clone()) {
                                 core::rules::is_library_allowed(&Some(rules))
                             } else {
                                 true // Parse error, assume allow? or disallow.
                             }
                         } else {
                             true
                         };

                         if allow {
                            if let Some(val) = obj.get("value") {
                                if let Some(s) = val.as_str() {
                                    let mut arg = s.to_string();
                                    for (key, replacement) in &replacements {
                                        arg = arg.replace(key, replacement);
                                    }
                                    args.push(arg);
                                } else if let Some(arr) = val.as_array() {
                                    for sub in arr {
                                        if let Some(s) = sub.as_str() {
                                            let mut arg = s.to_string();
                                            for (key, replacement) in &replacements {
                                                arg = arg.replace(key, replacement);
                                            }
                                            args.push(arg);
                                        }
                                    }
                                }
                            }
                         }
                     }
                 }
             }
        }
    }

    println!("Launching game with {} args...", args.len());
    
    // Spawn the process
    let mut command = std::process::Command::new("java");
    command.args(&args);
    command.current_dir(&game_dir); // Run in game directory

    // We can just spawn it and let it detach, or keep track of it.
    // For now, let's spawn and verify it started.
    match command.spawn() {
        Ok(_) => Ok(format!("Launched Minecraft {} successfully!", version_id)),
        Err(e) => Err(format!("Failed to launch java: {}", e)),
    }
}

#[tauri::command]
async fn get_versions() -> Result<Vec<core::manifest::Version>, String> {
    match core::manifest::fetch_version_manifest().await {
        Ok(manifest) => Ok(manifest.versions),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn login_offline(
    state: State<'_, core::auth::AccountState>,
    username: String,
) -> Result<core::auth::OfflineAccount, String> {
    let uuid = core::auth::generate_offline_uuid(&username);
    let account = core::auth::OfflineAccount {
        username,
        uuid,
    };
    
    *state.active_account.lock().unwrap() = Some(account.clone());
    Ok(account)
}

#[tauri::command]
async fn get_active_account(
    state: State<'_, core::auth::AccountState>,
) -> Result<Option<core::auth::OfflineAccount>, String> {
    Ok(state.active_account.lock().unwrap().clone())
}

#[tauri::command]
async fn logout(state: State<'_, core::auth::AccountState>) -> Result<(), String> {
    *state.active_account.lock().unwrap() = None;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(core::auth::AccountState::new())
        .invoke_handler(tauri::generate_handler![start_game, get_versions, login_offline, get_active_account, logout])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

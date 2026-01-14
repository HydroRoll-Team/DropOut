// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Stdio;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, Window}; // Added Emitter
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Helper macro to emit launcher log events
macro_rules! emit_log {
    ($window:expr, $msg:expr) => {
        let _ = $window.emit("launcher-log", $msg);
        println!("[Launcher] {}", $msg);
    };
}

mod core;
mod utils;

// Global storage for MS refresh token (not in Account struct to keep it separate)
pub struct MsRefreshTokenState {
    pub token: Mutex<Option<String>>,
}

impl MsRefreshTokenState {
    pub fn new() -> Self {
        Self {
            token: Mutex::new(None),
        }
    }
}

#[tauri::command]
async fn start_game(
    window: Window,
    auth_state: State<'_, core::auth::AccountState>,
    config_state: State<'_, core::config::ConfigState>,
    version_id: String,
) -> Result<String, String> {
    emit_log!(window, format!("Starting game launch for version: {}", version_id));

    // Check for active account
    emit_log!(window, "Checking for active account...".to_string());
    let account = auth_state
        .active_account
        .lock()
        .unwrap()
        .clone()
        .ok_or("No active account found. Please login first.")?;
    
    let account_type = match &account {
        core::auth::Account::Offline(_) => "Offline",
        core::auth::Account::Microsoft(_) => "Microsoft",
    };
    emit_log!(window, format!("Account found: {} ({})", account.username(), account_type));

    let config = config_state.config.lock().unwrap().clone();
    emit_log!(window, format!("Java path: {}", config.java_path));
    emit_log!(window, format!("Memory: {}MB - {}MB", config.min_memory, config.max_memory));

    // Get App Data Directory (e.g., ~/.local/share/com.dropout.launcher or similar)
    // The identifier is set in tauri.conf.json.
    // If not accessible, use a specific logic.
    let app_handle = window.app_handle();
    let game_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Ensure game directory exists
    tokio::fs::create_dir_all(&game_dir)
        .await
        .map_err(|e| e.to_string())?;

    emit_log!(window, format!("Game directory: {:?}", game_dir));

    // 1. Fetch manifest to find the version URL
    emit_log!(window, "Fetching version manifest...".to_string());
    let manifest = core::manifest::fetch_version_manifest()
        .await
        .map_err(|e| e.to_string())?;
    emit_log!(window, format!("Found {} versions in manifest", manifest.versions.len()));

    // Find the version info
    let version_info = manifest
        .versions
        .iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| format!("Version {} not found in manifest", version_id))?;

    // 2. Fetch specific version JSON (client.jar info)
    emit_log!(window, format!("Fetching version details for {}...", version_id));
    let version_url = &version_info.url;
    let version_details: core::game_version::GameVersion = reqwest::get(version_url)
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    emit_log!(window, format!("Version details loaded: main class = {}", version_details.main_class));

    // 3. Prepare download tasks
    emit_log!(window, "Preparing download tasks...".to_string());
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
                    let path_str = artifact
                        .path
                        .clone()
                        .unwrap_or_else(|| format!("{}.jar", lib.name));

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
                        if let Ok(native_artifact) =
                            serde_json::from_value::<core::game_version::DownloadArtifact>(
                                native_artifact_value.clone(),
                            )
                        {
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
        tokio::fs::read_to_string(&asset_index_path)
            .await
            .map_err(|e| e.to_string())?
    } else {
        println!(
            "Downloading asset index from {}",
            version_details.asset_index.url
        );
        let content = reqwest::get(&version_details.asset_index.url)
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;

        // Save it for next time
        tokio::fs::create_dir_all(&indexes_dir)
            .await
            .map_err(|e| e.to_string())?;
        tokio::fs::write(&asset_index_path, &content)
            .await
            .map_err(|e| e.to_string())?;
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

    let asset_index_parsed: AssetIndexJson =
        serde_json::from_str(&asset_index_content).map_err(|e| e.to_string())?;

    println!("Processing {} assets...", asset_index_parsed.objects.len());

    for (_name, object) in asset_index_parsed.objects {
        let hash = object.hash;
        let prefix = &hash[0..2];
        let path = objects_dir.join(prefix).join(&hash);
        let url = format!(
            "https://resources.download.minecraft.net/{}/{}",
            prefix, hash
        );

        download_tasks.push(core::downloader::DownloadTask {
            url,
            path,
            sha1: Some(hash),
        });
    }

    emit_log!(window, format!(
        "Total download tasks: {} (Client + Libraries + Assets)",
        download_tasks.len()
    ));

    // 4. Start Download
    emit_log!(window, format!("Starting downloads with {} concurrent threads...", config.download_threads));
    core::downloader::download_files(window.clone(), download_tasks, config.download_threads as usize)
        .await
        .map_err(|e| e.to_string())?;
    emit_log!(window, "All downloads completed successfully".to_string());

    // 5. Extract Natives
    emit_log!(window, "Extracting native libraries...".to_string());
    let natives_dir = game_dir.join("versions").join(&version_id).join("natives");

    // Clean old natives if they exist to prevent conflicts
    if natives_dir.exists() {
        tokio::fs::remove_dir_all(&natives_dir)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::fs::create_dir_all(&natives_dir)
        .await
        .map_err(|e| e.to_string())?;

    for path in native_libs_paths {
        if path.exists() {
            println!("Extracting native: {:?}", path);
            utils::zip::extract_zip(&path, &natives_dir)?;
        }
    }

    // 6. Construct Classpath
    let cp_separator = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
    let mut classpath_entries = Vec::new();

    // Add libraries
    for lib in &version_details.libraries {
        if core::rules::is_library_allowed(&lib.rules) {
            if let Some(downloads) = &lib.downloads {
                if let Some(artifact) = &downloads.artifact {
                    let path_str = artifact
                        .path
                        .clone()
                        .unwrap_or_else(|| format!("{}.jar", lib.name));
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

    // 7a. JVM Arguments - Parse from version.json for full compatibility
    // First add arguments from version.json if available
    if let Some(args_obj) = &version_details.arguments {
        if let Some(jvm_args) = &args_obj.jvm {
            parse_jvm_arguments(jvm_args, &mut args, &natives_path, &classpath);
        }
    }
    
    // Add memory settings (these override any defaults)
    args.push(format!("-Xmx{}M", config.max_memory));
    args.push(format!("-Xms{}M", config.min_memory));
    
    // Ensure natives path is set if not already in jvm args
    if !args.iter().any(|a| a.contains("-Djava.library.path")) {
        args.push(format!("-Djava.library.path={}", natives_path));
    }
    
    // Ensure classpath is set if not already
    if !args.iter().any(|a| a == "-cp" || a == "-classpath") {
        args.push("-cp".to_string());
        args.push(classpath.clone());
    }

    // 7b. Main Class
    args.push(version_details.main_class.clone());

    // 7c. Game Arguments
    // Replacements map
    let mut replacements = std::collections::HashMap::new();
    replacements.insert("${auth_player_name}", account.username());
    replacements.insert("${version_name}", version_id.clone());
    replacements.insert("${game_directory}", game_dir.to_string_lossy().to_string());
    replacements.insert("${assets_root}", assets_dir.to_string_lossy().to_string());
    replacements.insert(
        "${assets_index_name}",
        version_details.asset_index.id.clone(),
    );
    replacements.insert("${auth_uuid}", account.uuid());
    replacements.insert("${auth_access_token}", account.access_token());
    replacements.insert("${user_type}", "mojang".to_string());
    replacements.insert("${version_type}", "release".to_string());
    replacements.insert("${user_properties}", "{}".to_string()); // Correctly pass empty JSON object for user properties

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
                            if let Ok(rules) = serde_json::from_value::<Vec<core::game_version::Rule>>(
                                rules_val.clone(),
                            ) {
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

    emit_log!(window, format!("Preparing to launch game with {} arguments...", args.len()));
    // Debug: Log arguments (only first few to avoid spam)
    if args.len() > 10 {
        emit_log!(window, format!("First 10 args: {:?}", &args[..10]));
    }

    // Spawn the process
    emit_log!(window, format!("Starting Java process: {}", config.java_path));
    let mut command = Command::new(&config.java_path);
    command.args(&args);
    command.current_dir(&game_dir); // Run in game directory
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    // On Windows, use CREATE_NO_WINDOW flag to hide the console window
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
        emit_log!(window, "Applied CREATE_NO_WINDOW flag for Windows".to_string());
    }

    // Spawn and handle output
    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to launch java: {}", e))?;

    emit_log!(window, "Java process started successfully".to_string());

    let stdout = child
        .stdout
        .take()
        .expect("child did not have a handle to stdout");
    let stderr = child
        .stderr
        .take()
        .expect("child did not have a handle to stderr");

    // Emit launcher log that game is running
    emit_log!(window, "Game is now running, capturing output...".to_string());

    let window_rx = window.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = window_rx.emit("game-stdout", line);
        }
        // Emit log when stdout stream ends (game closing)
        let _ = window_rx.emit("launcher-log", "Game stdout stream ended");
    });

    let window_rx_err = window.clone();
    let window_exit = window.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = window_rx_err.emit("game-stderr", line);
        }
        // Emit log when stderr stream ends
        let _ = window_rx_err.emit("launcher-log", "Game stderr stream ended");
    });

    // Monitor game process exit
    tokio::spawn(async move {
        match child.wait().await {
            Ok(status) => {
                let msg = format!("Game process exited with status: {}", status);
                let _ = window_exit.emit("launcher-log", &msg);
                let _ = window_exit.emit("game-exited", status.code().unwrap_or(-1));
            }
            Err(e) => {
                let msg = format!("Error waiting for game process: {}", e);
                let _ = window_exit.emit("launcher-log", &msg);
            }
        }
    });

    Ok(format!("Launched Minecraft {} successfully!", version_id))
}

/// Parse JVM arguments from version.json
fn parse_jvm_arguments(
    jvm_args: &serde_json::Value,
    args: &mut Vec<String>,
    natives_path: &str,
    classpath: &str,
) {
    let mut replacements = std::collections::HashMap::new();
    replacements.insert("${natives_directory}", natives_path.to_string());
    replacements.insert("${classpath}", classpath.to_string());
    replacements.insert("${launcher_name}", "DropOut".to_string());
    replacements.insert("${launcher_version}", env!("CARGO_PKG_VERSION").to_string());

    if let Some(list) = jvm_args.as_array() {
        for item in list {
            if let Some(s) = item.as_str() {
                // Simple string argument
                let mut arg = s.to_string();
                for (key, val) in &replacements {
                    arg = arg.replace(key, val);
                }
                // Skip memory args as we set them explicitly
                if !arg.starts_with("-Xmx") && !arg.starts_with("-Xms") {
                    args.push(arg);
                }
            } else if let Some(obj) = item.as_object() {
                // Conditional argument with rules
                let allow = if let Some(rules_val) = obj.get("rules") {
                    if let Ok(rules) = serde_json::from_value::<Vec<core::game_version::Rule>>(
                        rules_val.clone(),
                    ) {
                        core::rules::is_library_allowed(&Some(rules))
                    } else {
                        false
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
                            if !arg.starts_with("-Xmx") && !arg.starts_with("-Xms") {
                                args.push(arg);
                            }
                        } else if let Some(arr) = val.as_array() {
                            for sub in arr {
                                if let Some(s) = sub.as_str() {
                                    let mut arg = s.to_string();
                                    for (key, replacement) in &replacements {
                                        arg = arg.replace(key, replacement);
                                    }
                                    if !arg.starts_with("-Xmx") && !arg.starts_with("-Xms") {
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

#[tauri::command]
async fn get_versions() -> Result<Vec<core::manifest::Version>, String> {
    match core::manifest::fetch_version_manifest().await {
        Ok(manifest) => Ok(manifest.versions),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn login_offline(
    window: Window,
    state: State<'_, core::auth::AccountState>,
    username: String,
) -> Result<core::auth::Account, String> {
    let uuid = core::auth::generate_offline_uuid(&username);
    let account = core::auth::Account::Offline(core::auth::OfflineAccount { username, uuid });

    *state.active_account.lock().unwrap() = Some(account.clone());
    
    // Save to storage
    let app_handle = window.app_handle();
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = core::account_storage::AccountStorage::new(app_dir);
    storage.add_or_update_account(&account, None)?;
    
    Ok(account)
}

#[tauri::command]
async fn get_active_account(
    state: State<'_, core::auth::AccountState>,
) -> Result<Option<core::auth::Account>, String> {
    Ok(state.active_account.lock().unwrap().clone())
}

#[tauri::command]
async fn logout(
    window: Window,
    state: State<'_, core::auth::AccountState>,
) -> Result<(), String> {
    // Get current account UUID before clearing
    let uuid = state.active_account.lock().unwrap().as_ref().map(|a| a.uuid());
    
    *state.active_account.lock().unwrap() = None;
    
    // Remove from storage
    if let Some(uuid) = uuid {
        let app_handle = window.app_handle();
        let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
        let storage = core::account_storage::AccountStorage::new(app_dir);
        storage.remove_account(&uuid)?;
    }
    
    Ok(())
}

#[tauri::command]
async fn get_settings(
    state: State<'_, core::config::ConfigState>,
) -> Result<core::config::LauncherConfig, String> {
    Ok(state.config.lock().unwrap().clone())
}

#[tauri::command]
async fn save_settings(
    state: State<'_, core::config::ConfigState>,
    config: core::config::LauncherConfig,
) -> Result<(), String> {
    *state.config.lock().unwrap() = config;
    state.save()?;
    Ok(())
}

#[tauri::command]
async fn start_microsoft_login() -> Result<core::auth::DeviceCodeResponse, String> {
    core::auth::start_device_flow().await
}

#[tauri::command]
async fn complete_microsoft_login(
    window: Window,
    state: State<'_, core::auth::AccountState>,
    ms_refresh_state: State<'_, MsRefreshTokenState>,
    device_code: String,
) -> Result<core::auth::Account, String> {
    // 1. Poll (once) for token
    let token_resp = core::auth::exchange_code_for_token(&device_code).await?;
    
    // Store MS refresh token
    let ms_refresh_token = token_resp.refresh_token.clone();
    *ms_refresh_state.token.lock().unwrap() = ms_refresh_token.clone();
    
    // 2. Xbox Live Auth
    let (xbl_token, uhs) = core::auth::method_xbox_live(&token_resp.access_token).await?;
    
    // 3. XSTS Auth
    let xsts_token = core::auth::method_xsts(&xbl_token).await?;
    
    // 4. Minecraft Auth
    let mc_token = core::auth::login_minecraft(&xsts_token, &uhs).await?;
    
    // 5. Get Profile
    let profile = core::auth::fetch_profile(&mc_token).await?;
    
    // 6. Create Account
    let account = core::auth::Account::Microsoft(core::auth::MicrosoftAccount {
        username: profile.name,
        uuid: profile.id,
        access_token: mc_token, // This is the MC Access Token
        refresh_token: token_resp.refresh_token.clone(),
        expires_at: (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() + token_resp.expires_in) as i64,
    });
    
    // 7. Save to state
    *state.active_account.lock().unwrap() = Some(account.clone());
    
    // 8. Save to storage
    let app_handle = window.app_handle();
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = core::account_storage::AccountStorage::new(app_dir);
    storage.add_or_update_account(&account, ms_refresh_token)?;
    
    Ok(account)
}

/// Refresh token for current Microsoft account
#[tauri::command]
async fn refresh_account(
    window: Window,
    state: State<'_, core::auth::AccountState>,
    ms_refresh_state: State<'_, MsRefreshTokenState>,
) -> Result<core::auth::Account, String> {
    // Get stored MS refresh token
    let app_handle = window.app_handle();
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = core::account_storage::AccountStorage::new(app_dir.clone());
    
    let (stored_account, ms_refresh) = storage
        .get_active_account()
        .ok_or("No active account found")?;
    
    let ms_refresh_token = ms_refresh.ok_or("No refresh token available")?;
    
    // Perform full refresh
    let (new_account, new_ms_refresh) = core::auth::refresh_full_auth(&ms_refresh_token).await?;
    let account = core::auth::Account::Microsoft(new_account);
    
    // Update state
    *state.active_account.lock().unwrap() = Some(account.clone());
    *ms_refresh_state.token.lock().unwrap() = Some(new_ms_refresh.clone());
    
    // Update storage
    storage.add_or_update_account(&account, Some(new_ms_refresh))?;
    
    Ok(account)
}

/// Detect Java installations on the system
#[tauri::command]
async fn detect_java() -> Result<Vec<core::java::JavaInstallation>, String> {
    Ok(core::java::detect_java_installations())
}

/// Get recommended Java for a specific Minecraft version
#[tauri::command]
async fn get_recommended_java(
    required_major_version: Option<u64>,
) -> Result<Option<core::java::JavaInstallation>, String> {
    Ok(core::java::get_recommended_java(required_major_version))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(core::auth::AccountState::new())
        .manage(MsRefreshTokenState::new())
        .setup(|app| {
            let config_state = core::config::ConfigState::new(app.handle());
            app.manage(config_state);
            
            // Load saved account on startup
            let app_dir = app.path().app_data_dir().unwrap();
            let storage = core::account_storage::AccountStorage::new(app_dir);
            
            if let Some((stored_account, ms_refresh)) = storage.get_active_account() {
                let account = stored_account.to_account();
                let auth_state: State<core::auth::AccountState> = app.state();
                *auth_state.active_account.lock().unwrap() = Some(account);
                
                // Store MS refresh token
                if let Some(token) = ms_refresh {
                    let ms_state: State<MsRefreshTokenState> = app.state();
                    *ms_state.token.lock().unwrap() = Some(token);
                }
                
                println!("[Startup] Loaded saved account");
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_game,
            get_versions,
            login_offline,
            get_active_account,
            logout,
            get_settings,
            save_settings,
            start_microsoft_login,
            complete_microsoft_login,
            refresh_account,
            detect_java,
            get_recommended_java
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

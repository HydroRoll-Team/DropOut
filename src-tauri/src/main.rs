// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Stdio;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, Window}; // Added Emitter
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use serde::Serialize; // Added Serialize

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

impl Default for MsRefreshTokenState {
    fn default() -> Self {
        Self::new()
    }
}

impl MsRefreshTokenState {
    pub fn new() -> Self {
        Self {
            token: Mutex::new(None),
        }
    }
}

/// Check if a string contains unresolved placeholders in the form ${...}
///
/// After the replacement phase, if a string still contains ${...}, it means
/// that placeholder variable was not found in the replacements map and is
/// therefore unresolved. We should skip adding such arguments to avoid
/// passing malformed arguments to the game launcher.
fn has_unresolved_placeholder(s: &str) -> bool {
    // Look for the opening sequence
    if let Some(start_pos) = s.find("${") {
        // Check if there's a closing brace after the opening sequence
        if s[start_pos + 2..].find('}').is_some() {
            // Found a complete ${...} pattern - this is an unresolved placeholder
            return true;
        }
        // Found ${ but no closing } - also treat as unresolved/malformed
        return true;
    }
    // No ${ found - the string is fully resolved
    false
}

#[tauri::command]
async fn start_game(
    window: Window,
    auth_state: State<'_, core::auth::AccountState>,
    config_state: State<'_, core::config::ConfigState>,
    version_id: String,
) -> Result<String, String> {
    emit_log!(
        window,
        format!("Starting game launch for version: {}", version_id)
    );

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
    emit_log!(
        window,
        format!("Account found: {} ({})", account.username(), account_type)
    );

    let config = config_state.config.lock().unwrap().clone();
    emit_log!(window, format!("Java path: {}", config.java_path));
    emit_log!(
        window,
        format!("Memory: {}MB - {}MB", config.min_memory, config.max_memory)
    );

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

    // 1. Load version (supports both vanilla and modded versions with inheritance)
    emit_log!(
        window,
        format!("Loading version details for {}...", version_id)
    );

    let version_details = core::manifest::load_version(&game_dir, &version_id)
        .await
        .map_err(|e| e.to_string())?;

    emit_log!(
        window,
        format!(
            "Version details loaded: main class = {}",
            version_details.main_class
        )
    );

    // Determine the actual minecraft version for client.jar
    // (for modded versions, this is the parent vanilla version)
    let minecraft_version = version_details
        .inherits_from
        .clone()
        .unwrap_or_else(|| version_id.clone());

    // 2. Prepare download tasks
    emit_log!(window, "Preparing download tasks...".to_string());
    let mut download_tasks = Vec::new();

    // --- Client Jar ---
    // Get downloads from version_details (may be inherited)
    let downloads = version_details
        .downloads
        .as_ref()
        .ok_or("Version has no downloads information")?;
    let client_jar = &downloads.client;
    let mut client_path = game_dir.join("versions");
    client_path.push(&minecraft_version);
    client_path.push(format!("{}.jar", minecraft_version));

    download_tasks.push(core::downloader::DownloadTask {
        url: client_jar.url.clone(),
        path: client_path.clone(),
        sha1: client_jar.sha1.clone(),
        sha256: None,
    });

    // --- Libraries ---
    println!("Processing libraries...");
    let libraries_dir = game_dir.join("libraries");
    let mut native_libs_paths = Vec::new(); // Store paths to native jars for extraction

    for lib in &version_details.libraries {
        if core::rules::is_library_allowed(&lib.rules) {
            // 1. Standard Library - check for explicit downloads first
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
                        sha1: artifact.sha1.clone(),
                        sha256: None,
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
                                sha1: native_artifact.sha1,
                                sha256: None,
                            });

                            native_libs_paths.push(native_path);
                        }
                    }
                }
            } else {
                // 3. Library without explicit downloads (mod loader libraries)
                // Use Maven coordinate resolution
                if let Some(url) =
                    core::maven::resolve_library_url(&lib.name, None, lib.url.as_deref())
                {
                    if let Some(lib_path) = core::maven::get_library_path(&lib.name, &libraries_dir)
                    {
                        download_tasks.push(core::downloader::DownloadTask {
                            url,
                            path: lib_path,
                            sha1: None, // Maven libraries often don't have SHA1 in the JSON
                            sha256: None,
                        });
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

    // Get asset index (may be inherited from parent)
    let asset_index = version_details
        .asset_index
        .as_ref()
        .ok_or("Version has no asset index information")?;

    // Download Asset Index JSON
    let asset_index_path = indexes_dir.join(format!("{}.json", asset_index.id));

    // Check if index exists or download it
    // Note: We need the content of this file to parse it.
    // If we just add it to download_tasks, we can't parse it *now*.
    // So we must download it immediately (await) before processing objects.

    let asset_index_content: String = if asset_index_path.exists() {
        tokio::fs::read_to_string(&asset_index_path)
            .await
            .map_err(|e| e.to_string())?
    } else {
        println!("Downloading asset index from {}", asset_index.url);
        let content = reqwest::get(&asset_index.url)
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
        #[allow(dead_code)]
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
            sha256: None,
        });
    }

    emit_log!(
        window,
        format!(
            "Total download tasks: {} (Client + Libraries + Assets)",
            download_tasks.len()
        )
    );

    // 4. Start Download
    emit_log!(
        window,
        format!(
            "Starting downloads with {} concurrent threads...",
            config.download_threads
        )
    );
    core::downloader::download_files(
        window.clone(),
        download_tasks,
        config.download_threads as usize,
    )
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
    replacements.insert("${assets_index_name}", asset_index.id.clone());
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
                                    // Skip arguments with unresolved placeholders
                                    if !has_unresolved_placeholder(&arg) {
                                        args.push(arg);
                                    }
                                } else if let Some(arr) = val.as_array() {
                                    for sub in arr {
                                        if let Some(s) = sub.as_str() {
                                            let mut arg = s.to_string();
                                            for (key, replacement) in &replacements {
                                                arg = arg.replace(key, replacement);
                                            }
                                            // Skip arguments with unresolved placeholders
                                            if !has_unresolved_placeholder(&arg) {
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
    }

    emit_log!(
        window,
        format!("Preparing to launch game with {} arguments...", args.len())
    );
    // Debug: Log arguments (only first few to avoid spam)
    if args.len() > 10 {
        emit_log!(window, format!("First 10 args: {:?}", &args[..10]));
    }

    // Spawn the process
    emit_log!(
        window,
        format!("Starting Java process: {}", config.java_path)
    );
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
        emit_log!(
            window,
            "Applied CREATE_NO_WINDOW flag for Windows".to_string()
        );
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
    emit_log!(
        window,
        "Game is now running, capturing output...".to_string()
    );

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
                    if let Ok(rules) =
                        serde_json::from_value::<Vec<core::game_version::Rule>>(rules_val.clone())
                    {
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
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
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
async fn logout(window: Window, state: State<'_, core::auth::AccountState>) -> Result<(), String> {
    // Get current account UUID before clearing
    let uuid = state
        .active_account
        .lock()
        .unwrap()
        .as_ref()
        .map(|a| a.uuid());

    *state.active_account.lock().unwrap() = None;

    // Remove from storage
    if let Some(uuid) = uuid {
        let app_handle = window.app_handle();
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
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
            .as_secs()
            + token_resp.expires_in) as i64,
    });

    // 7. Save to state
    *state.active_account.lock().unwrap() = Some(account.clone());

    // 8. Save to storage
    let app_handle = window.app_handle();
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
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
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let storage = core::account_storage::AccountStorage::new(app_dir.clone());

    let (_stored_account, ms_refresh) = storage
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
async fn detect_java(app_handle: tauri::AppHandle) -> Result<Vec<core::java::JavaInstallation>, String> {
    Ok(core::java::detect_all_java_installations(&app_handle))
}

/// Get recommended Java for a specific Minecraft version
#[tauri::command]
async fn get_recommended_java(
    required_major_version: Option<u64>,
) -> Result<Option<core::java::JavaInstallation>, String> {
    Ok(core::java::get_recommended_java(required_major_version))
}

/// Get Adoptium Java download info
#[tauri::command]
async fn fetch_adoptium_java(
    major_version: u32,
    image_type: String,
) -> Result<core::java::JavaDownloadInfo, String> {
    let img_type = match image_type.to_lowercase().as_str() {
        "jdk" => core::java::ImageType::Jdk,
        _ => core::java::ImageType::Jre,
    };
    core::java::fetch_java_release(major_version, img_type).await
}

/// Download and install Adoptium Java
#[tauri::command]
async fn download_adoptium_java(
    app_handle: tauri::AppHandle,
    major_version: u32,
    image_type: String,
    custom_path: Option<String>,
) -> Result<core::java::JavaInstallation, String> {
    let img_type = match image_type.to_lowercase().as_str() {
        "jdk" => core::java::ImageType::Jdk,
        _ => core::java::ImageType::Jre,
    };
    let path = custom_path.map(std::path::PathBuf::from);
    core::java::download_and_install_java(&app_handle, major_version, img_type, path).await
}

/// Get available Adoptium Java versions
#[tauri::command]
async fn fetch_available_java_versions() -> Result<Vec<u32>, String> {
    core::java::fetch_available_versions().await
}

/// Fetch Java catalog with platform availability (uses cache)
#[tauri::command]
async fn fetch_java_catalog(
    app_handle: tauri::AppHandle,
) -> Result<core::java::JavaCatalog, String> {
    core::java::fetch_java_catalog(&app_handle, false).await
}

/// Refresh Java catalog (bypass cache)
#[tauri::command]
async fn refresh_java_catalog(
    app_handle: tauri::AppHandle,
) -> Result<core::java::JavaCatalog, String> {
    core::java::fetch_java_catalog(&app_handle, true).await
}

/// Cancel current Java download
#[tauri::command]
async fn cancel_java_download() -> Result<(), String> {
    core::java::cancel_current_download();
    Ok(())
}

/// Get pending Java downloads
#[tauri::command]
async fn get_pending_java_downloads(
    app_handle: tauri::AppHandle,
) -> Result<Vec<core::downloader::PendingJavaDownload>, String> {
    Ok(core::java::get_pending_downloads(&app_handle))
}

/// Resume pending Java downloads
#[tauri::command]
async fn resume_java_downloads(
    app_handle: tauri::AppHandle,
) -> Result<Vec<core::java::JavaInstallation>, String> {
    core::java::resume_pending_downloads(&app_handle).await
}

/// Get Minecraft versions supported by Fabric
#[tauri::command]
async fn get_fabric_game_versions() -> Result<Vec<core::fabric::FabricGameVersion>, String> {
    core::fabric::fetch_supported_game_versions()
        .await
        .map_err(|e| e.to_string())
}

/// Get available Fabric loader versions
#[tauri::command]
async fn get_fabric_loader_versions() -> Result<Vec<core::fabric::FabricLoaderVersion>, String> {
    core::fabric::fetch_loader_versions()
        .await
        .map_err(|e| e.to_string())
}

/// Get Fabric loaders available for a specific Minecraft version
#[tauri::command]
async fn get_fabric_loaders_for_version(
    game_version: String,
) -> Result<Vec<core::fabric::FabricLoaderEntry>, String> {
    core::fabric::fetch_loaders_for_game_version(&game_version)
        .await
        .map_err(|e| e.to_string())
}

/// Install Fabric loader for a specific Minecraft version
#[tauri::command]
async fn install_fabric(
    window: Window,
    game_version: String,
    loader_version: String,
) -> Result<core::fabric::InstalledFabricVersion, String> {
    emit_log!(
        window,
        format!(
            "Installing Fabric {} for Minecraft {}...",
            loader_version, game_version
        )
    );

    let app_handle = window.app_handle();
    let game_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let result = core::fabric::install_fabric(&game_dir, &game_version, &loader_version)
        .await
        .map_err(|e| e.to_string())?;

    emit_log!(
        window,
        format!("Fabric installed successfully: {}", result.id)
    );

    Ok(result)
}

/// List installed Fabric versions
#[tauri::command]
async fn list_installed_fabric_versions(window: Window) -> Result<Vec<String>, String> {
    let app_handle = window.app_handle();
    let game_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    core::fabric::list_installed_fabric_versions(&game_dir)
        .await
        .map_err(|e| e.to_string())
}

/// Check if Fabric is installed for a specific version
#[tauri::command]
async fn is_fabric_installed(
    window: Window,
    game_version: String,
    loader_version: String,
) -> Result<bool, String> {
    let app_handle = window.app_handle();
    let game_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    Ok(core::fabric::is_fabric_installed(
        &game_dir,
        &game_version,
        &loader_version,
    ))
}

/// Get Minecraft versions supported by Forge
#[tauri::command]
async fn get_forge_game_versions() -> Result<Vec<String>, String> {
    core::forge::fetch_supported_game_versions()
        .await
        .map_err(|e| e.to_string())
}

/// Get available Forge versions for a specific Minecraft version
#[tauri::command]
async fn get_forge_versions_for_game(
    game_version: String,
) -> Result<Vec<core::forge::ForgeVersion>, String> {
    core::forge::fetch_forge_versions(&game_version)
        .await
        .map_err(|e| e.to_string())
}

/// Install Forge for a specific Minecraft version
#[tauri::command]
async fn install_forge(
    window: Window,
    game_version: String,
    forge_version: String,
) -> Result<core::forge::InstalledForgeVersion, String> {
    emit_log!(
        window,
        format!(
            "Installing Forge {} for Minecraft {}...",
            forge_version, game_version
        )
    );

    let app_handle = window.app_handle();
    let game_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let result = core::forge::install_forge(&game_dir, &game_version, &forge_version)
        .await
        .map_err(|e| e.to_string())?;

    emit_log!(
        window,
        format!("Forge installed successfully: {}", result.id)
    );

    Ok(result)
}

#[derive(serde::Serialize)]
struct GithubRelease {
    tag_name: String,
    name: String,
    published_at: String,
    body: String,
    html_url: String,
}

#[tauri::command]
async fn get_github_releases() -> Result<Vec<GithubRelease>, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.github.com/repos/HsiangNianian/DropOut/releases")
        .header("User-Agent", "DropOut-Launcher")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("GitHub API returned status: {}", res.status()));
    }

    let releases: Vec<serde_json::Value> = res.json().await.map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in releases {
        if let (Some(tag), Some(name), Some(date), Some(body), Some(url)) = (
            r["tag_name"].as_str(),
            r["name"].as_str(),
            r["published_at"].as_str(),
            r["body"].as_str(),
            r["html_url"].as_str()
        ) {
            result.push(GithubRelease {
                tag_name: tag.to_string(),
                name: name.to_string(),
                published_at: date.to_string(),
                body: body.to_string(),
                html_url: url.to_string(),
            });
        }
    }
    Ok(result)
}

#[derive(Serialize)]
struct PastebinResponse {
    url: String,
}

#[tauri::command]
async fn upload_to_pastebin(
    state: State<'_, core::config::ConfigState>,
    content: String,
) -> Result<PastebinResponse, String> {
    // Check content length limit
    if content.len() > 500 * 1024 {
        return Err("Log file too large (max 500KB)".to_string());
    }

    // Extract config values before any async calls to avoid holding MutexGuard across await
    let (service, api_key) = {
        let config = state.config.lock().unwrap();
        (
            config.log_upload_service.clone(),
            config.pastebin_api_key.clone(),
        )
    };

    let client = reqwest::Client::new();

    match service.as_str() {
        "pastebin.com" => {
            let api_key = api_key
                .ok_or("Pastebin API Key not configured in settings")?;

            let res = client
                .post("https://pastebin.com/api/api_post.php")
                .form(&[
                    ("api_dev_key", api_key.as_str()),
                    ("api_option", "paste"),
                    ("api_paste_code", content.as_str()),
                    ("api_paste_private", "1"), // Unlisted
                    ("api_paste_name", "DropOut Launcher Log"),
                    ("api_paste_expire_date", "1W"),
                ])
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if !res.status().is_success() {
                return Err(format!("Pastebin upload failed: {}", res.status()));
            }

            let url = res.text().await.map_err(|e| e.to_string())?;
            if url.starts_with("Bad API Request") {
                return Err(format!("Pastebin API error: {}", url));
            }
            Ok(PastebinResponse { url })
        }
        // Default to paste.rs
        _ => {
            let res = client
                .post("https://paste.rs/")
                .body(content)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if !res.status().is_success() {
                return Err(format!("paste.rs upload failed: {}", res.status()));
            }

            let url = res.text().await.map_err(|e| e.to_string())?;
            let url = url.trim().to_string();
            Ok(PastebinResponse { url })
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
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

            // Check for pending Java downloads and notify frontend
            let pending = core::java::get_pending_downloads(&app.app_handle());
            if !pending.is_empty() {
                println!("[Startup] Found {} pending Java download(s)", pending.len());
                let _ = app.emit("pending-java-downloads", pending.len());
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
            // Java commands
            detect_java,
            get_recommended_java,
            fetch_adoptium_java,
            download_adoptium_java,
            fetch_available_java_versions,
            fetch_java_catalog,
            refresh_java_catalog,
            cancel_java_download,
            get_pending_java_downloads,
            resume_java_downloads,
            // Fabric commands
            get_fabric_game_versions,
            get_fabric_loader_versions,
            get_fabric_loaders_for_version,
            install_fabric,
            list_installed_fabric_versions,
            is_fabric_installed,
            // Forge commands
            get_forge_game_versions,
            get_forge_versions_for_game,
            install_forge,
            get_github_releases,
            upload_to_pastebin
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

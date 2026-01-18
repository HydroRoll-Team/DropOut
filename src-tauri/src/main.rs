// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, Window}; // Added Emitter
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command; // Added Serialize

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
    assistant_state: State<'_, core::assistant::AssistantState>,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    version_id: String,
) -> Result<String, String> {
    emit_log!(
        window,
        format!(
            "Starting game launch for version: {} in instance: {}",
            version_id, instance_id
        )
    );

    // Check for active account
    emit_log!(window, "Checking for active account...".to_string());
    let mut account = auth_state
        .active_account
        .lock()
        .unwrap()
        .clone()
        .ok_or("No active account found. Please login first.")?;

    // Check if Microsoft account token is expired and refresh if needed
    if let core::auth::Account::Microsoft(ms_account) = &account {
        if core::auth::is_token_expired(ms_account.expires_at) {
            emit_log!(window, "Token expired, refreshing...".to_string());
            match core::auth::refresh_full_auth(
                &ms_account
                    .refresh_token
                    .clone()
                    .ok_or("No refresh token available")?,
            )
            .await
            {
                Ok((refreshed_account, _new_ms_refresh)) => {
                    let refreshed_account = core::auth::Account::Microsoft(refreshed_account);
                    *auth_state.active_account.lock().unwrap() = Some(refreshed_account.clone());
                    account = refreshed_account;
                    emit_log!(window, "Token refreshed successfully".to_string());
                }
                Err(e) => {
                    emit_log!(window, format!("Token refresh failed: {}", e));
                    return Err(format!(
                        "Your login session has expired. Please login again: {}",
                        e
                    ));
                }
            }
        }
    }

    emit_log!(window, format!("Account found: {}", account.username()));

    let config = config_state.config.lock().unwrap().clone();
    emit_log!(window, format!("Java path: {}", config.java_path));
    emit_log!(
        window,
        format!("Memory: {}MB - {}MB", config.min_memory, config.max_memory)
    );

    // Get game directory from instance
    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

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

    // First, load the local version to get the original inheritsFrom value
    // (before merge clears it)
    let original_inherits_from =
        match core::manifest::load_local_version(&game_dir, &version_id).await {
            Ok(local_version) => local_version.inherits_from.clone(),
            Err(_) => None,
        };

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
    let minecraft_version = original_inherits_from.unwrap_or_else(|| version_id.clone());

    // Get required Java version from version file's javaVersion field
    // The version file (after merging with parent) should contain the correct javaVersion
    let required_java_major = version_details
        .java_version
        .as_ref()
        .map(|jv| jv.major_version);

    // For older Minecraft versions (1.13.x and below), if javaVersion specifies Java 8,
    // we should only allow Java 8 (not higher) due to compatibility issues with old Forge
    // For newer versions, javaVersion.majorVersion is the minimum required version
    let max_java_major = if let Some(required) = required_java_major {
        // If version file specifies Java 8, enforce it as maximum (old versions need exactly Java 8)
        // For Java 9+, allow that version or higher
        if required <= 8 {
            Some(8)
        } else {
            None // No upper bound for Java 9+
        }
    } else {
        // If version file doesn't specify javaVersion, this shouldn't happen for modern versions
        // But if it does, we can't determine compatibility - log a warning
        emit_log!(
            window,
            "Warning: Version file does not specify javaVersion. Using system default Java."
                .to_string()
        );
        None
    };

    // Check if configured Java is compatible
    let app_handle = window.app_handle();
    let mut java_path_to_use = config.java_path.clone();
    if !java_path_to_use.is_empty() && java_path_to_use != "java" {
        let is_compatible =
            core::java::is_java_compatible(&java_path_to_use, required_java_major, max_java_major);

        if !is_compatible {
            emit_log!(
                window,
                format!(
                    "Configured Java version may not be compatible. Looking for compatible Java..."
                )
            );

            // Try to find a compatible Java version
            if let Some(compatible_java) =
                core::java::get_compatible_java(app_handle, required_java_major, max_java_major)
            {
                emit_log!(
                    window,
                    format!(
                        "Found compatible Java {} at: {}",
                        compatible_java.version, compatible_java.path
                    )
                );
                java_path_to_use = compatible_java.path;
            } else {
                let version_constraint = if let Some(max) = max_java_major {
                    if let Some(min) = required_java_major {
                        if min == max as u64 {
                            format!("Java {}", min)
                        } else {
                            format!("Java {} to {}", min, max)
                        }
                    } else {
                        format!("Java {} (or lower)", max)
                    }
                } else if let Some(min) = required_java_major {
                    format!("Java {} or higher", min)
                } else {
                    "any Java version".to_string()
                };

                return Err(format!(
                    "No compatible Java installation found. This version requires {}. Please install a compatible Java version in settings.",
                    version_constraint
                ));
            }
        }
    } else {
        // No Java configured, try to find a compatible one
        if let Some(compatible_java) =
            core::java::get_compatible_java(app_handle, required_java_major, max_java_major)
        {
            emit_log!(
                window,
                format!(
                    "Using Java {} at: {}",
                    compatible_java.version, compatible_java.path
                )
            );
            java_path_to_use = compatible_java.path;
        } else {
            let version_constraint = if let Some(max) = max_java_major {
                if let Some(min) = required_java_major {
                    if min == max as u64 {
                        format!("Java {}", min)
                    } else {
                        format!("Java {} to {}", min, max)
                    }
                } else {
                    format!("Java {} (or lower)", max)
                }
            } else if let Some(min) = required_java_major {
                format!("Java {} or higher", min)
            } else {
                "any Java version".to_string()
            };

            return Err(format!(
                "No compatible Java installation found. This version requires {}. Please install a compatible Java version in settings.",
                version_constraint
            ));
        }
    }

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
                // Standard library with explicit downloads
                if let Some(artifact) = &downloads.artifact {
                    let path_str = artifact
                        .path
                        .clone()
                        .unwrap_or_else(|| format!("{}.jar", lib.name));
                    let lib_path = libraries_dir.join(path_str);
                    classpath_entries.push(lib_path.to_string_lossy().to_string());
                }
            } else {
                // Library without explicit downloads (mod loader libraries)
                // Use Maven coordinate resolution
                if let Some(lib_path) = core::maven::get_library_path(&lib.name, &libraries_dir) {
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

    // Format Java command with sensitive information masked
    let masked_args: Vec<String> = args
        .iter()
        .enumerate()
        .map(|(i, arg)| {
            // Check if previous argument was a sensitive flag
            if i > 0 {
                let prev_arg = &args[i - 1];
                if prev_arg == "--accessToken" || prev_arg == "--uuid" {
                    return "***".to_string();
                }
            }

            // Mask sensitive argument values
            if arg == "--accessToken" || arg == "--uuid" {
                arg.clone()
            } else if arg.starts_with("token:") {
                // Mask token: prefix tokens (Session ID format)
                "token:***".to_string()
            } else if arg.len() > 100
                && arg.contains('.')
                && !arg.contains('/')
                && !arg.contains('\\')
                && !arg.contains(':')
            {
                // Likely a JWT token (very long string with dots, no paths)
                "***".to_string()
            } else if arg.len() == 36
                && arg.contains('-')
                && arg.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
            {
                // Likely a UUID (36 chars with dashes)
                "***".to_string()
            } else {
                arg.clone()
            }
        })
        .collect();

    // Format as actual Java command (properly quote arguments with spaces)
    let masked_args_str: Vec<String> = masked_args
        .iter()
        .map(|arg| {
            if arg.contains(' ') {
                format!("\"{}\"", arg)
            } else {
                arg.clone()
            }
        })
        .collect();

    let java_command = format!("{} {}", java_path_to_use, masked_args_str.join(" "));
    emit_log!(window, format!("Java Command: {}", java_command));

    // Spawn the process
    emit_log!(
        window,
        format!("Starting Java process: {}", java_path_to_use)
    );
    let mut command = Command::new(&java_path_to_use);
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
        .map_err(|e| format!("Failed to launch Java at '{}': {}\nPlease check your Java installation and path configuration in Settings.", java_path_to_use, e))?;

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
    let assistant_arc = assistant_state.assistant.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            assistant_arc.lock().unwrap().add_log(line.clone());
            let _ = window_rx.emit("game-stdout", line);
        }
        // Emit log when stdout stream ends (game closing)
        let _ = window_rx.emit("launcher-log", "Game stdout stream ended");
    });

    let window_rx_err = window.clone();
    let assistant_arc_err = assistant_state.assistant.clone();
    let window_exit = window.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            assistant_arc_err.lock().unwrap().add_log(line.clone());
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
async fn get_versions(window: Window) -> Result<Vec<core::manifest::Version>, String> {
    let app_handle = window.app_handle();
    let game_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    match core::manifest::fetch_version_manifest().await {
        Ok(manifest) => {
            let mut versions = manifest.versions;

            // For each version, try to load Java version info and check installation status
            for version in &mut versions {
                // Check if version is installed
                let version_dir = game_dir.join("versions").join(&version.id);
                let json_path = version_dir.join(format!("{}.json", version.id));
                let client_jar_path = version_dir.join(format!("{}.jar", version.id));

                // Version is installed if both JSON and client jar exist
                let is_installed = json_path.exists() && client_jar_path.exists();
                version.is_installed = Some(is_installed);

                // If installed, try to load the version JSON to get javaVersion
                if is_installed {
                    if let Ok(game_version) =
                        core::manifest::load_local_version(&game_dir, &version.id).await
                    {
                        if let Some(java_ver) = game_version.java_version {
                            version.java_version = Some(java_ver.major_version);
                        }
                    }
                }
            }

            Ok(versions)
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Check if a version is installed (has client.jar)
#[tauri::command]
async fn check_version_installed(
    _window: Window,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    version_id: String,
) -> Result<bool, String> {
    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

    // For modded versions, check the parent vanilla version
    let minecraft_version = if version_id.starts_with("fabric-loader-") {
        // Format: fabric-loader-X.X.X-1.20.4
        version_id
            .split('-')
            .next_back()
            .unwrap_or(&version_id)
            .to_string()
    } else if version_id.contains("-forge-") {
        // Format: 1.20.4-forge-49.0.38
        version_id
            .split("-forge-")
            .next()
            .unwrap_or(&version_id)
            .to_string()
    } else {
        version_id.clone()
    };

    let client_jar = game_dir
        .join("versions")
        .join(&minecraft_version)
        .join(format!("{}.jar", minecraft_version));

    Ok(client_jar.exists())
}

/// Install a version (download client, libraries, assets) without launching
#[tauri::command]
async fn install_version(
    window: Window,
    config_state: State<'_, core::config::ConfigState>,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    version_id: String,
) -> Result<(), String> {
    emit_log!(
        window,
        format!(
            "Starting installation for version: {} in instance: {}",
            version_id, instance_id
        )
    );

    let config = config_state.config.lock().unwrap().clone();

    // Get game directory from instance
    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

    // Ensure game directory exists
    tokio::fs::create_dir_all(&game_dir)
        .await
        .map_err(|e| e.to_string())?;

    emit_log!(window, format!("Game directory: {:?}", game_dir));

    // Load version (supports both vanilla and modded versions with inheritance)
    emit_log!(
        window,
        format!("Loading version details for {}...", version_id)
    );

    // First, try to fetch the vanilla version from Mojang and save it locally
    let _version_details = match core::manifest::load_local_version(&game_dir, &version_id).await {
        Ok(v) => v,
        Err(_) => {
            // Not found locally, fetch from Mojang
            emit_log!(
                window,
                format!("Fetching version {} from Mojang...", version_id)
            );
            let fetched = core::manifest::fetch_vanilla_version(&version_id)
                .await
                .map_err(|e| e.to_string())?;

            // Save the version JSON locally
            emit_log!(window, format!("Saving version JSON..."));
            core::manifest::save_local_version(&game_dir, &fetched)
                .await
                .map_err(|e| e.to_string())?;

            fetched
        }
    };

    // Now load the full version with inheritance resolved
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
    let minecraft_version = version_details
        .inherits_from
        .clone()
        .unwrap_or_else(|| version_id.clone());

    // Prepare download tasks
    emit_log!(window, "Preparing download tasks...".to_string());
    let mut download_tasks = Vec::new();

    // --- Client Jar ---
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
    let libraries_dir = game_dir.join("libraries");

    for lib in &version_details.libraries {
        if core::rules::is_library_allowed(&lib.rules) {
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

                // Native Library (classifiers)
                if let Some(classifiers) = &downloads.classifiers {
                    let os_key = if cfg!(target_os = "linux") {
                        "natives-linux"
                    } else if cfg!(target_os = "windows") {
                        "natives-windows"
                    } else if cfg!(target_os = "macos") {
                        "natives-osx"
                    } else {
                        ""
                    };

                    if let Some(native_artifact_value) = classifiers.get(os_key) {
                        if let Ok(native_artifact) =
                            serde_json::from_value::<core::game_version::DownloadArtifact>(
                                native_artifact_value.clone(),
                            )
                        {
                            let path_str = native_artifact.path.clone().unwrap();
                            let mut native_path = libraries_dir.clone();
                            native_path.push(&path_str);

                            download_tasks.push(core::downloader::DownloadTask {
                                url: native_artifact.url,
                                path: native_path.clone(),
                                sha1: native_artifact.sha1,
                                sha256: None,
                            });
                        }
                    }
                }
            } else {
                // Library without explicit downloads (mod loader libraries)
                if let Some(url) =
                    core::maven::resolve_library_url(&lib.name, None, lib.url.as_deref())
                {
                    if let Some(lib_path) = core::maven::get_library_path(&lib.name, &libraries_dir)
                    {
                        download_tasks.push(core::downloader::DownloadTask {
                            url,
                            path: lib_path,
                            sha1: None,
                            sha256: None,
                        });
                    }
                }
            }
        }
    }

    // --- Assets ---
    let assets_dir = game_dir.join("assets");
    let objects_dir = assets_dir.join("objects");
    let indexes_dir = assets_dir.join("indexes");

    let asset_index = version_details
        .asset_index
        .as_ref()
        .ok_or("Version has no asset index information")?;

    let asset_index_path = indexes_dir.join(format!("{}.json", asset_index.id));

    let asset_index_content: String = if asset_index_path.exists() {
        tokio::fs::read_to_string(&asset_index_path)
            .await
            .map_err(|e| e.to_string())?
    } else {
        emit_log!(window, format!("Downloading asset index..."));
        let content = reqwest::get(&asset_index.url)
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;

        tokio::fs::create_dir_all(&indexes_dir)
            .await
            .map_err(|e| e.to_string())?;
        tokio::fs::write(&asset_index_path, &content)
            .await
            .map_err(|e| e.to_string())?;
        content
    };

    #[derive(serde::Deserialize)]
    struct AssetObject {
        hash: String,
    }

    #[derive(serde::Deserialize)]
    struct AssetIndexJson {
        objects: std::collections::HashMap<String, AssetObject>,
    }

    let asset_index_parsed: AssetIndexJson =
        serde_json::from_str(&asset_index_content).map_err(|e| e.to_string())?;

    emit_log!(
        window,
        format!("Processing {} assets...", asset_index_parsed.objects.len())
    );

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

    // Start Download
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

    emit_log!(
        window,
        format!("Installation of {} completed successfully!", version_id)
    );

    // Emit event to notify frontend that version installation is complete
    let _ = window.emit("version-installed", &version_id);

    Ok(())
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
async fn get_config_path(state: State<'_, core::config::ConfigState>) -> Result<String, String> {
    Ok(state.file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn read_raw_config(state: State<'_, core::config::ConfigState>) -> Result<String, String> {
    tokio::fs::read_to_string(&state.file_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_raw_config(
    state: State<'_, core::config::ConfigState>,
    content: String,
) -> Result<(), String> {
    // Validate JSON
    let new_config: core::config::LauncherConfig =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {}", e))?;

    // Save to file
    tokio::fs::write(&state.file_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    // Update in-memory state
    *state.config.lock().unwrap() = new_config;

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
    // Helper to emit auth progress
    let emit_progress = |step: &str| {
        let _ = window.emit("auth-progress", step);
    };

    // 1. Poll (once) for token
    emit_progress("Receiving token from Microsoft...");
    let token_resp = core::auth::exchange_code_for_token(&device_code).await?;
    emit_progress("Token received successfully!");

    // Store MS refresh token
    let ms_refresh_token = token_resp.refresh_token.clone();
    *ms_refresh_state.token.lock().unwrap() = ms_refresh_token.clone();

    // 2. Xbox Live Auth
    emit_progress("Authenticating with Xbox Live...");
    let (xbl_token, uhs) = core::auth::method_xbox_live(&token_resp.access_token).await?;
    emit_progress("Xbox Live authentication successful!");

    // 3. XSTS Auth
    emit_progress("Authenticating with XSTS...");
    let xsts_token = core::auth::method_xsts(&xbl_token).await?;
    emit_progress("XSTS authentication successful!");

    // 4. Minecraft Auth
    emit_progress("Authenticating with Minecraft...");
    let mc_token = core::auth::login_minecraft(&xsts_token, &uhs).await?;
    emit_progress("Minecraft authentication successful!");

    // 5. Get Profile
    emit_progress("Fetching Minecraft profile...");
    let profile = core::auth::fetch_profile(&mc_token).await?;
    emit_progress(&format!("Welcome, {}!", profile.name));

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
async fn detect_java(
    app_handle: tauri::AppHandle,
) -> Result<Vec<core::java::JavaInstallation>, String> {
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
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    game_version: String,
    loader_version: String,
) -> Result<core::fabric::InstalledFabricVersion, String> {
    emit_log!(
        window,
        format!(
            "Installing Fabric {} for Minecraft {} in instance {}...",
            loader_version, game_version, instance_id
        )
    );

    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

    let result = core::fabric::install_fabric(&game_dir, &game_version, &loader_version)
        .await
        .map_err(|e| e.to_string())?;

    emit_log!(
        window,
        format!("Fabric installed successfully: {}", result.id)
    );

    // Emit event to notify frontend
    let _ = window.emit("fabric-installed", &result.id);

    Ok(result)
}

/// List installed Fabric versions
#[tauri::command]
async fn list_installed_fabric_versions(
    _window: Window,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
) -> Result<Vec<String>, String> {
    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

    core::fabric::list_installed_fabric_versions(&game_dir)
        .await
        .map_err(|e| e.to_string())
}

/// Get Java version requirement for a specific version
#[tauri::command]
async fn get_version_java_version(
    _window: Window,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    version_id: String,
) -> Result<Option<u64>, String> {
    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

    // Try to load the version JSON to get javaVersion
    match core::manifest::load_version(&game_dir, &version_id).await {
        Ok(game_version) => Ok(game_version.java_version.map(|jv| jv.major_version)),
        Err(_) => Ok(None), // Version not found or can't be loaded
    }
}

/// Version metadata for display in the UI
#[derive(serde::Serialize)]
struct VersionMetadata {
    id: String,
    #[serde(rename = "javaVersion")]
    java_version: Option<u64>,
    #[serde(rename = "isInstalled")]
    is_installed: bool,
}

/// Delete a version (remove version directory)
#[tauri::command]
async fn delete_version(
    window: Window,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    version_id: String,
) -> Result<(), String> {
    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

    let version_dir = game_dir.join("versions").join(&version_id);

    if !version_dir.exists() {
        return Err(format!("Version {} not found", version_id));
    }

    // Remove the entire version directory
    tokio::fs::remove_dir_all(&version_dir)
        .await
        .map_err(|e| format!("Failed to delete version: {}", e))?;

    // Emit event to notify frontend
    let _ = window.emit("version-deleted", &version_id);

    Ok(())
}

/// Get detailed metadata for a specific version
#[tauri::command]
async fn get_version_metadata(
    _window: Window,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    version_id: String,
) -> Result<VersionMetadata, String> {
    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

    // Initialize metadata
    let mut metadata = VersionMetadata {
        id: version_id.clone(),
        java_version: None,
        is_installed: false,
    };

    // Check if version is in manifest and get Java version if available
    if let Ok(manifest) = core::manifest::fetch_version_manifest().await {
        if let Some(version_entry) = manifest.versions.iter().find(|v| v.id == version_id) {
            // Note: version_entry.java_version is only set if version is installed locally
            // For uninstalled versions, we'll fetch from remote below
            if let Some(java_ver) = version_entry.java_version {
                metadata.java_version = Some(java_ver);
            }
        }
    }

    // Check if version is installed (both JSON and client jar must exist)
    let version_dir = game_dir.join("versions").join(&version_id);
    let json_path = version_dir.join(format!("{}.json", version_id));

    // For modded versions, check the parent vanilla version's client jar
    let client_jar_path = if version_id.starts_with("fabric-loader-") {
        // Format: fabric-loader-X.X.X-1.20.4
        let minecraft_version = version_id
            .split('-')
            .next_back()
            .unwrap_or(&version_id)
            .to_string();
        game_dir
            .join("versions")
            .join(&minecraft_version)
            .join(format!("{}.jar", minecraft_version))
    } else if version_id.contains("-forge-") {
        // Format: 1.20.4-forge-49.0.38
        let minecraft_version = version_id
            .split("-forge-")
            .next()
            .unwrap_or(&version_id)
            .to_string();
        game_dir
            .join("versions")
            .join(&minecraft_version)
            .join(format!("{}.jar", minecraft_version))
    } else {
        version_dir.join(format!("{}.jar", version_id))
    };

    metadata.is_installed = json_path.exists() && client_jar_path.exists();

    // Try to get Java version - from local if installed, or from remote if not
    if metadata.is_installed {
        // If installed, load from local version JSON
        if let Ok(game_version) = core::manifest::load_version(&game_dir, &version_id).await {
            if let Some(java_ver) = game_version.java_version {
                metadata.java_version = Some(java_ver.major_version);
            }
        }
    } else if metadata.java_version.is_none() {
        // If not installed and we don't have Java version yet, try to fetch from remote
        // This is for vanilla versions that are not installed
        if !version_id.starts_with("fabric-loader-") && !version_id.contains("-forge-") {
            if let Ok(game_version) = core::manifest::fetch_vanilla_version(&version_id).await {
                if let Some(java_ver) = game_version.java_version {
                    metadata.java_version = Some(java_ver.major_version);
                }
            }
        }
    }

    Ok(metadata)
}

/// Installed version info
#[derive(serde::Serialize)]
struct InstalledVersion {
    id: String,
    #[serde(rename = "type")]
    version_type: String, // "release", "snapshot", "fabric", "forge", "modpack"
}

/// List all installed versions from the data directory
/// Simply lists all folders in the versions directory without validation
#[tauri::command]
async fn list_installed_versions(
    _window: Window,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
) -> Result<Vec<InstalledVersion>, String> {
    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

    let versions_dir = game_dir.join("versions");
    let mut installed = Vec::new();

    if !versions_dir.exists() {
        return Ok(installed);
    }

    let mut entries = tokio::fs::read_dir(&versions_dir)
        .await
        .map_err(|e| e.to_string())?;

    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        // Only include directories
        if !entry.file_type().await.map_err(|e| e.to_string())?.is_dir() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        let version_dir = entry.path();

        // Determine version type based on folder name or JSON content
        let version_type = if name.starts_with("fabric-loader-") {
            "fabric".to_string()
        } else if name.contains("-forge") || name.contains("forge-") {
            "forge".to_string()
        } else {
            // Try to read JSON to get type, otherwise guess from name
            let json_path = version_dir.join(format!("{}.json", name));
            if json_path.exists() {
                if let Ok(content) = tokio::fs::read_to_string(&json_path).await {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        json.get("type")
                            .and_then(|t| t.as_str())
                            .unwrap_or("modpack")
                            .to_string()
                    } else {
                        "modpack".to_string()
                    }
                } else {
                    "modpack".to_string()
                }
            } else {
                // No JSON file - treat as modpack/custom
                "modpack".to_string()
            }
        };

        installed.push(InstalledVersion {
            id: name,
            version_type,
        });
    }

    // Sort: modded/modpack first, then by version id descending
    installed.sort_by(|a, b| {
        let a_priority = match a.version_type.as_str() {
            "fabric" | "forge" => 0,
            "modpack" => 1,
            _ => 2,
        };
        let b_priority = match b.version_type.as_str() {
            "fabric" | "forge" => 0,
            "modpack" => 1,
            _ => 2,
        };

        match a_priority.cmp(&b_priority) {
            std::cmp::Ordering::Equal => b.id.cmp(&a.id), // Descending order
            other => other,
        }
    });

    Ok(installed)
}

/// Check if Fabric is installed for a specific version
#[tauri::command]
async fn is_fabric_installed(
    _window: Window,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    game_version: String,
    loader_version: String,
) -> Result<bool, String> {
    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

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
    config_state: State<'_, core::config::ConfigState>,
    instance_state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    game_version: String,
    forge_version: String,
) -> Result<core::forge::InstalledForgeVersion, String> {
    emit_log!(
        window,
        format!(
            "Installing Forge {} for Minecraft {} in instance {}...",
            forge_version, game_version, instance_id
        )
    );

    let game_dir = instance_state
        .get_instance_game_dir(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))?;

    // Get Java path from config or detect
    let config = config_state.config.lock().unwrap().clone();
    let app_handle = window.app_handle();
    let java_path_str = if !config.java_path.is_empty() && config.java_path != "java" {
        config.java_path.clone()
    } else {
        // Try to find a suitable Java installation
        let javas = core::java::detect_all_java_installations(app_handle);
        if let Some(java) = javas.first() {
            java.path.clone()
        } else {
            return Err(
                "No Java installation found. Please configure Java in settings.".to_string(),
            );
        }
    };
    let java_path = utils::path::normalize_java_path(&java_path_str)?;

    emit_log!(window, "Running Forge installer...".to_string());

    // Run the Forge installer to properly patch the client
    core::forge::run_forge_installer(&game_dir, &game_version, &forge_version, &java_path)
        .await
        .map_err(|e| format!("Forge installer failed: {}", e))?;

    emit_log!(
        window,
        "Forge installer completed, creating version profile...".to_string()
    );

    // Check if the version JSON already exists
    let version_id = core::forge::generate_version_id(&game_version, &forge_version);
    let json_path = game_dir.join("versions").join(&version_id).join(format!("{}.json", version_id));

    let result = if json_path.exists() {
        // Version JSON was created by the installer, load it
        emit_log!(
            window,
            "Using version profile created by Forge installer".to_string()
        );
        core::forge::InstalledForgeVersion {
            id: version_id,
            minecraft_version: game_version.clone(),
            forge_version: forge_version.clone(),
            path: json_path,
        }
    } else {
        // Installer didn't create JSON, create it manually
        core::forge::install_forge(&game_dir, &game_version, &forge_version)
            .await
            .map_err(|e| e.to_string())?
    };

    emit_log!(
        window,
        format!("Forge installed successfully: {}", result.id)
    );

    // Emit event to notify frontend
    let _ = window.emit("forge-installed", &result.id);

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
            r["html_url"].as_str(),
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
            let api_key = api_key.ok_or("Pastebin API Key not configured in settings")?;

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

#[tauri::command]
async fn assistant_check_health(
    assistant_state: State<'_, core::assistant::AssistantState>,
    config_state: State<'_, core::config::ConfigState>,
) -> Result<bool, String> {
    let assistant = assistant_state.assistant.lock().unwrap().clone();
    let config = config_state.config.lock().unwrap().clone();
    Ok(assistant.check_health(&config.assistant).await)
}

#[tauri::command]
async fn assistant_chat(
    assistant_state: State<'_, core::assistant::AssistantState>,
    config_state: State<'_, core::config::ConfigState>,
    messages: Vec<core::assistant::Message>,
) -> Result<core::assistant::Message, String> {
    let assistant = assistant_state.assistant.lock().unwrap().clone();
    let config = config_state.config.lock().unwrap().clone();
    assistant.chat(messages, &config.assistant).await
}

#[tauri::command]
async fn list_ollama_models(
    assistant_state: State<'_, core::assistant::AssistantState>,
    endpoint: String,
) -> Result<Vec<core::assistant::ModelInfo>, String> {
    let assistant = assistant_state.assistant.lock().unwrap().clone();
    assistant.list_ollama_models(&endpoint).await
}

#[tauri::command]
async fn list_openai_models(
    assistant_state: State<'_, core::assistant::AssistantState>,
    config_state: State<'_, core::config::ConfigState>,
) -> Result<Vec<core::assistant::ModelInfo>, String> {
    let assistant = assistant_state.assistant.lock().unwrap().clone();
    let config = config_state.config.lock().unwrap().clone();
    assistant.list_openai_models(&config.assistant).await
}

// ==================== Instance Management Commands ====================

/// Create a new instance
#[tauri::command]
async fn create_instance(
    window: Window,
    state: State<'_, core::instance::InstanceState>,
    name: String,
) -> Result<core::instance::Instance, String> {
    let app_handle = window.app_handle();
    state.create_instance(name, app_handle)
}

/// Delete an instance
#[tauri::command]
async fn delete_instance(
    state: State<'_, core::instance::InstanceState>,
    instance_id: String,
) -> Result<(), String> {
    state.delete_instance(&instance_id)
}

/// Update an instance
#[tauri::command]
async fn update_instance(
    state: State<'_, core::instance::InstanceState>,
    instance: core::instance::Instance,
) -> Result<(), String> {
    state.update_instance(instance)
}

/// Get all instances
#[tauri::command]
async fn list_instances(
    state: State<'_, core::instance::InstanceState>,
) -> Result<Vec<core::instance::Instance>, String> {
    Ok(state.list_instances())
}

/// Get a single instance by ID
#[tauri::command]
async fn get_instance(
    state: State<'_, core::instance::InstanceState>,
    instance_id: String,
) -> Result<core::instance::Instance, String> {
    state
        .get_instance(&instance_id)
        .ok_or_else(|| format!("Instance {} not found", instance_id))
}

/// Set the active instance
#[tauri::command]
async fn set_active_instance(
    state: State<'_, core::instance::InstanceState>,
    instance_id: String,
) -> Result<(), String> {
    state.set_active_instance(&instance_id)
}

/// Get the active instance
#[tauri::command]
async fn get_active_instance(
    state: State<'_, core::instance::InstanceState>,
) -> Result<Option<core::instance::Instance>, String> {
    Ok(state.get_active_instance())
}

/// Duplicate an instance
#[tauri::command]
async fn duplicate_instance(
    window: Window,
    state: State<'_, core::instance::InstanceState>,
    instance_id: String,
    new_name: String,
) -> Result<core::instance::Instance, String> {
    let app_handle = window.app_handle();
    state.duplicate_instance(&instance_id, new_name, app_handle)
}

#[tauri::command]
async fn assistant_chat_stream(
    window: tauri::Window,
    assistant_state: State<'_, core::assistant::AssistantState>,
    config_state: State<'_, core::config::ConfigState>,
    messages: Vec<core::assistant::Message>,
) -> Result<String, String> {
    let assistant = assistant_state.assistant.lock().unwrap().clone();
    let config = config_state.config.lock().unwrap().clone();
    assistant
        .chat_stream(messages, &config.assistant, &window)
        .await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(core::auth::AccountState::new())
        .manage(MsRefreshTokenState::new())
        .manage(core::assistant::AssistantState::new())
        .setup(|app| {
            let config_state = core::config::ConfigState::new(app.handle());
            app.manage(config_state);

            // Initialize instance state
            let instance_state = core::instance::InstanceState::new(app.handle());

            // Migrate legacy data if needed
            if let Err(e) = core::instance::migrate_legacy_data(app.handle(), &instance_state) {
                eprintln!("[Startup] Warning: Failed to migrate legacy data: {}", e);
            }

            app.manage(instance_state);

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
            let pending = core::java::get_pending_downloads(app.app_handle());
            if !pending.is_empty() {
                println!("[Startup] Found {} pending Java download(s)", pending.len());
                let _ = app.emit("pending-java-downloads", pending.len());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_game,
            get_versions,
            check_version_installed,
            install_version,
            list_installed_versions,
            get_version_java_version,
            get_version_metadata,
            delete_version,
            login_offline,
            get_active_account,
            logout,
            get_settings,
            save_settings,
            get_config_path,
            read_raw_config,
            save_raw_config,
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
            upload_to_pastebin,
            assistant_check_health,
            assistant_chat,
            assistant_chat_stream,
            list_ollama_models,
            list_openai_models,
            // Instance management commands
            create_instance,
            delete_instance,
            update_instance,
            list_instances,
            get_instance,
            set_active_instance,
            get_active_instance,
            duplicate_instance
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

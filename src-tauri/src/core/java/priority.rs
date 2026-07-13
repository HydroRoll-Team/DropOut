use tauri::AppHandle;

use crate::core::java::JavaInstallation;
use crate::core::java::persistence;
use crate::core::java::validation;

pub async fn resolve_java_for_launch(
    app_handle: &AppHandle,
    instance_java_override: Option<&str>,
    global_java_path: Option<&str>,
    required_major_version: Option<u64>,
    max_major_version: Option<u32>,
) -> Option<JavaInstallation> {
    if let Some(override_path) = instance_java_override {
        if !override_path.is_empty() {
            let path_buf = std::path::PathBuf::from(override_path);
            if let Some(java) = validation::check_java_installation(&path_buf).await {
                if is_version_compatible(&java, required_major_version, max_major_version) {
                    return Some(java);
                }
            }
        }
    }

    if let Some(global_path) = global_java_path {
        if !global_path.is_empty() {
            let path_buf = std::path::PathBuf::from(global_path);
            if let Some(java) = validation::check_java_installation(&path_buf).await {
                if is_version_compatible(&java, required_major_version, max_major_version) {
                    return Some(java);
                }
            }
        }
    }

    let preferred = persistence::get_preferred_java_path(app_handle);
    if let Some(pref_path) = preferred {
        let path_buf = std::path::PathBuf::from(&pref_path);
        if let Some(java) = validation::check_java_installation(&path_buf).await {
            if is_version_compatible(&java, required_major_version, max_major_version) {
                return Some(java);
            }
        }
    }

    let installations = super::detect_all_java_installations(app_handle).await;
    installations
        .into_iter()
        .find(|java| is_version_compatible(java, required_major_version, max_major_version))
}

fn is_version_compatible(
    java: &JavaInstallation,
    required_major_version: Option<u64>,
    max_major_version: Option<u32>,
) -> bool {
    let major = validation::parse_java_version(&java.version);
    validation::is_version_compatible(major, required_major_version, max_major_version)
}

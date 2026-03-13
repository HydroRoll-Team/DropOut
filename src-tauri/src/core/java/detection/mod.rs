use std::path::PathBuf;

mod common;
mod linux;
mod macos;
mod unix;
mod windows;

pub fn get_java_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    candidates.extend(common::path_candidates());

    #[cfg(target_os = "linux")]
    {
        candidates.extend(linux::linux_candidates());
    }

    #[cfg(target_os = "macos")]
    {
        candidates.extend(macos::macos_candidates());
    }

    #[cfg(target_os = "windows")]
    {
        candidates.extend(windows::windows_candidates());
    }

    if let Some(java_home) = common::java_home_candidate() {
        candidates.push(java_home);
    }

    candidates
}

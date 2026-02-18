use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::core::java::strip_unc_prefix;

// We set a timeout for the which/where command to prevent hanging if it encounters issues.
const WHICH_TIMEOUT: Duration = Duration::from_secs(2);

fn run_which_command_with_timeout() -> Option<String> {
    let mut cmd = Command::new(if cfg!(windows) { "where" } else { "which" });
    cmd.arg("java");
    #[cfg(target_os = "windows")]
    // hide the console window on Windows to avoid flashing a command prompt.
    cmd.creation_flags(0x08000000);
    cmd.stdout(Stdio::piped());

    let mut child = cmd.spawn().ok()?;
    let start = std::time::Instant::now();

    loop {
        if start.elapsed() > WHICH_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    let mut output = String::new();
                    if let Some(mut stdout) = child.stdout.take() {
                        let _ = stdout.read_to_string(&mut output);
                    }
                    return Some(output);
                }
                let _ = child.wait();
                return None;
            }
            Ok(None) => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

pub fn path_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(paths_str) = run_which_command_with_timeout() {
        for line in paths_str.lines() {
            let path = PathBuf::from(line.trim());
            if path.exists() {
                let resolved = std::fs::canonicalize(&path).unwrap_or(path);
                let final_path = strip_unc_prefix(resolved);
                candidates.push(final_path);
            }
        }
    }

    candidates
}

pub fn java_home_candidate() -> Option<PathBuf> {
    let java_home = std::env::var("JAVA_HOME").ok()?;
    let bin_name = if cfg!(windows) { "java.exe" } else { "java" };
    let java_path = PathBuf::from(&java_home).join("bin").join(bin_name);
    if java_path.exists() {
        Some(java_path)
    } else {
        None
    }
}

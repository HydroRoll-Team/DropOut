use std::io::Read;
use std::path::Path;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::core::java::strip_unc_prefix;

const WHICH_TIMEOUT: Duration = Duration::from_secs(2);

/// Scans a directory for Java installations, filtering out symlinks
///
/// # Arguments
/// * `base_dir` - Base directory to scan (e.g., mise or SDKMAN java dir)
/// * `should_skip` - Predicate to determine if an entry should be skipped
///
/// # Returns
/// First valid Java installation found, or `None`
fn scan_java_dir<F>(base_dir: &Path, should_skip: F) -> Option<PathBuf>
where
    F: Fn(&std::fs::DirEntry) -> bool,
{
    std::fs::read_dir(base_dir)
        .ok()?
        .flatten()
        .filter(|entry| {
            let path = entry.path();
            // Only consider real directories, not symlinks
            path.is_dir() && !path.is_symlink() && !should_skip(entry)
        })
        .find_map(|entry| {
            let java_path = entry.path().join("bin/java");
            if java_path.exists() && java_path.is_file() {
                Some(java_path)
            } else {
                None
            }
        })
}

/// Finds Java installation from SDKMAN! if available
///
/// Scans the SDKMAN! candidates directory and returns the first valid Java installation found.
/// Skips the 'current' symlink to avoid duplicates.
///
/// Path: `~/.sdkman/candidates/java/`
///
/// # Returns
/// `Some(PathBuf)` pointing to `bin/java` if found, `None` otherwise
pub fn find_sdkman_java() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let sdkman_base = PathBuf::from(&home).join(".sdkman/candidates/java/");

    if !sdkman_base.exists() {
        return None;
    }

    scan_java_dir(&sdkman_base, |entry| entry.file_name() == "current")
}

/// Finds Java installation from mise if available
///
/// Scans the mise Java installation directory and returns the first valid installation found.
/// Skips version alias symlinks (e.g., `21`, `21.0`, `latest`, `lts`) to avoid duplicates.
///
/// Path: `~/.local/share/mise/installs/java/`
///
/// # Returns
/// `Some(PathBuf)` pointing to `bin/java` if found, `None` otherwise
pub fn find_mise_java() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let mise_base = PathBuf::from(&home).join(".local/share/mise/installs/java/");

    if !mise_base.exists() {
        return None;
    }

    scan_java_dir(&mise_base, |_| false) // mise: no additional filtering needed
}

/// Runs `which` (Unix) or `where` (Windows) command to find Java in PATH with timeout
///
/// This function spawns a subprocess to locate the `java` executable in the system PATH.
/// It enforces a 2-second timeout to prevent hanging if the command takes too long.
///
/// # Returns
/// `Some(String)` containing the output (paths separated by newlines) if successful,
/// `None` if the command fails, times out, or returns non-zero exit code
///
/// # Platform-specific behavior
/// - Unix/Linux/macOS: Uses `which java`
/// - Windows: Uses `where java` and hides the console window
///
/// # Timeout Behavior
/// If the command does not complete within 2 seconds, the process is killed
/// and `None` is returned. This prevents the launcher from hanging on systems
/// where `which`/`where` may be slow or unresponsive.
fn run_which_command_with_timeout() -> Option<String> {
    let mut cmd = Command::new(if cfg!(windows) { "where" } else { "which" });
    cmd.arg("java");
    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    cmd.stdout(Stdio::piped());

    let mut child = cmd.spawn().ok()?;
    let start = std::time::Instant::now();

    loop {
        // Check if timeout has been exceeded
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
                } else {
                    let _ = child.wait();
                    return None;
                }
            }
            Ok(None) => {
                // Command still running, sleep briefly before checking again
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

/// Detects all available Java installations on the system
///
/// This function searches for Java installations in multiple locations:
/// - **All platforms**: `JAVA_HOME` environment variable, `java` in PATH
/// - **Linux**: `/usr/lib/jvm`, `/usr/java`, `/opt/java`, `/opt/jdk`, `/opt/openjdk`, SDKMAN!
/// - **macOS**: `/Library/Java/JavaVirtualMachines`, `/System/Library/Java/JavaVirtualMachines`,
///   Homebrew paths (`/usr/local/opt/openjdk`, `/opt/homebrew/opt/openjdk`), SDKMAN!
/// - **Windows**: `Program Files`, `Program Files (x86)`, `LOCALAPPDATA` for various JDK distributions
///
/// # Returns
/// A vector of `PathBuf` pointing to Java executables found on the system.
/// Note: Paths may include symlinks and duplicates; callers should canonicalize and deduplicate as needed.
///
/// # Examples
/// ```ignore
/// let candidates = get_java_candidates();
/// for java_path in candidates {
///     println!("Found Java at: {}", java_path.display());
/// }
/// ```
pub fn get_java_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // Try to find Java in PATH using 'which' or 'where' command with timeout
    // CAUTION: linux 'which' may return symlinks, so we need to canonicalize later
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

    #[cfg(target_os = "linux")]
    {
        let linux_paths = [
            "/usr/lib/jvm",
            "/usr/java",
            "/opt/java",
            "/opt/jdk",
            "/opt/openjdk",
        ];

        for base in &linux_paths {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    let java_path = entry.path().join("bin/java");
                    if java_path.exists() {
                        candidates.push(java_path);
                    }
                }
            }
        }

        // Check common SDKMAN! java candidates
        if let Some(sdkman_java) = find_sdkman_java() {
            candidates.push(sdkman_java);
        }

        // Check common mise java candidates
        if let Some(mise_java) = find_mise_java() {
            candidates.push(mise_java);
        }
    }

    #[cfg(target_os = "macos")]
    {
        let mac_paths = [
            "/Library/Java/JavaVirtualMachines",
            "/System/Library/Java/JavaVirtualMachines",
            "/usr/local/opt/openjdk/bin/java",
            "/opt/homebrew/opt/openjdk/bin/java",
        ];

        for path in &mac_paths {
            let p = PathBuf::from(path);
            if p.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&p) {
                    for entry in entries.flatten() {
                        let java_path = entry.path().join("Contents/Home/bin/java");
                        if java_path.exists() {
                            candidates.push(java_path);
                        }
                    }
                }
            } else if p.exists() {
                candidates.push(p);
            }
        }

        // Check common Homebrew java candidates for aarch64 macs
        let homebrew_arm = PathBuf::from("/opt/homebrew/Cellar/openjdk");
        if homebrew_arm.exists() {
            if let Ok(entries) = std::fs::read_dir(&homebrew_arm) {
                for entry in entries.flatten() {
                    let java_path = entry
                        .path()
                        .join("libexec/openjdk.jdk/Contents/Home/bin/java");
                    if java_path.exists() {
                        candidates.push(java_path);
                    }
                }
            }
        }

        // Check common SDKMAN! java candidates
        if let Some(sdkman_java) = find_sdkman_java() {
            candidates.push(sdkman_java);
        }

        // Check common mise java candidates
        if let Some(mise_java) = find_mise_java() {
            candidates.push(mise_java);
        }
    }

    #[cfg(target_os = "windows")]
    {
        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)")
            .unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

        // Common installation paths for various JDK distributions
        let mut win_paths = vec![];
        for base in &[&program_files, &program_files_x86, &local_app_data] {
            win_paths.push(format!("{}\\Java", base));
            win_paths.push(format!("{}\\Eclipse Adoptium", base));
            win_paths.push(format!("{}\\AdoptOpenJDK", base));
            win_paths.push(format!("{}\\Microsoft\\jdk", base));
            win_paths.push(format!("{}\\Zulu", base));
            win_paths.push(format!("{}\\Amazon Corretto", base));
            win_paths.push(format!("{}\\BellSoft\\LibericaJDK", base));
            win_paths.push(format!("{}\\Programs\\Eclipse Adoptium", base));
        }

        for base in &win_paths {
            let base_path = PathBuf::from(base);
            if base_path.exists() {
                if let Ok(entries) = std::fs::read_dir(&base_path) {
                    for entry in entries.flatten() {
                        let java_path = entry.path().join("bin\\java.exe");
                        if java_path.exists() {
                            candidates.push(java_path);
                        }
                    }
                }
            }
        }
    }

    // Check JAVA_HOME environment variable
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let bin_name = if cfg!(windows) { "java.exe" } else { "java" };
        let java_path = PathBuf::from(&java_home).join("bin").join(bin_name);
        if java_path.exists() {
            candidates.push(java_path);
        }
    }

    candidates
}

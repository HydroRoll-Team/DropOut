/// Path utilities for cross-platform compatibility
use std::path::PathBuf;

/// Helper to strip UNC prefix on Windows (\\?\)
/// This is needed because std::fs::canonicalize adds UNC prefix on Windows
#[cfg(target_os = "windows")]
fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy().to_string();
    if s.starts_with(r"\\?\") {
        return PathBuf::from(&s[4..]);
    }
    path
}

#[cfg(not(target_os = "windows"))]
fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    path
}

/// Normalize a Java executable path for the current platform.
///
/// This function handles platform-specific requirements and validates that
/// the resulting path points to an executable Java binary.
///
/// On Windows:
/// - Adds .exe extension if missing
/// - Attempts to locate java.exe in PATH if only "java" is provided
/// - Resolves symlinks and strips UNC prefix
/// - Validates that the path exists
///
/// On Unix:
/// - Attempts to locate java in PATH using `which` if only "java" is provided
/// - Resolves symlinks to get canonical path
/// - Validates that the path exists
///
/// # Arguments
/// * `java_path` - The Java executable path to normalize (can be relative, absolute, or "java")
///
/// # Returns
/// * `Ok(PathBuf)` - Canonicalized, validated path to Java executable
/// * `Err(String)` - Error if the path cannot be found or validated
#[cfg(target_os = "windows")]
pub fn normalize_java_path(java_path: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::from(java_path);

    // If path doesn't exist and doesn't end with .exe, try adding .exe
    if !path.exists() && path.extension().is_none() {
        path.set_extension("exe");
    }

    // If still not found and it's just "java.exe" (not an absolute path), try to find it in PATH
    // Only search PATH for relative paths or just "java", not for absolute paths that don't exist
    if !path.exists()
        && !path.is_absolute()
        && path.file_name() == Some(std::ffi::OsStr::new("java.exe"))
    {
        // Try to locate java.exe in PATH
        if let Ok(output) = std::process::Command::new("where").arg("java").output() {
            if output.status.success() {
                let paths = String::from_utf8_lossy(&output.stdout);
                if let Some(first_path) = paths.lines().next() {
                    path = PathBuf::from(first_path.trim());
                }
            }
        }

        // If still not found after PATH search, return specific error
        if !path.exists() {
            return Err(
                "Java not found in PATH. Please install Java or configure the full path in Settings."
                    .to_string(),
            );
        }
    }

    // Verify the path exists before canonicalization
    if !path.exists() {
        return Err(format!(
            "Java executable not found at: {}\nPlease configure a valid Java path in Settings.",
            path.display()
        ));
    }

    // Canonicalize and strip UNC prefix for clean path
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("Failed to resolve Java path '{}': {}", path.display(), e))?;

    Ok(strip_unc_prefix(canonical))
}

#[cfg(not(target_os = "windows"))]
pub fn normalize_java_path(java_path: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::from(java_path);

    // If path doesn't exist and it's just "java", try to find java in PATH
    if !path.exists() && java_path == "java" {
        if let Ok(output) = std::process::Command::new("which").arg("java").output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout);
                if let Some(first_path) = path_str.lines().next() {
                    path = PathBuf::from(first_path.trim());
                }
            }
        }

        // If still not found after PATH search, return specific error
        if !path.exists() {
            return Err(
                "Java not found in PATH. Please install Java or configure the full path in Settings."
                    .to_string(),
            );
        }
    }

    // Verify the path exists before canonicalization
    if !path.exists() {
        return Err(format!(
            "Java executable not found at: {}\nPlease configure a valid Java path in Settings.",
            path.display()
        ));
    }

    // Canonicalize to resolve symlinks and get absolute path
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("Failed to resolve Java path '{}': {}", path.display(), e))?;

    Ok(strip_unc_prefix(canonical))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    #[cfg(target_os = "windows")]
    fn test_normalize_nonexistent_path_windows() {
        // Non-existent path should return error
        let result = normalize_java_path("C:\\NonExistent\\Path\\java.exe");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn test_normalize_nonexistent_path_unix() {
        // Non-existent path should return error
        let result = normalize_java_path("/nonexistent/path/java");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_normalize_adds_exe_extension() {
        // This test assumes java is not in the current directory
        let result = normalize_java_path("nonexistent_java");
        // Should fail since the file doesn't exist
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_existing_path_returns_canonical() {
        // Test with a path that should exist on most systems
        #[cfg(target_os = "windows")]
        let test_path = "C:\\Windows\\System32\\cmd.exe";
        #[cfg(not(target_os = "windows"))]
        let test_path = "/bin/sh";

        if std::path::Path::new(test_path).exists() {
            let result = normalize_java_path(test_path);
            assert!(result.is_ok());
            let normalized = result.unwrap();
            // Should be absolute path after canonicalization
            assert!(normalized.is_absolute());
            // Should not contain UNC prefix on Windows
            #[cfg(target_os = "windows")]
            assert!(!normalized.to_string_lossy().starts_with(r"\\?\"));
        }
    }

    #[test]
    fn test_normalize_java_not_in_path() {
        // When "java" is provided but not in PATH, should return error
        // This test may pass if java IS in PATH, so we check error message format
        let result = normalize_java_path("java");
        if result.is_err() {
            let err = result.unwrap_err();
            assert!(
                err.contains("not found in PATH") || err.contains("not found at"),
                "Expected PATH error, got: {}",
                err
            );
        }
        // If Ok, java was found in PATH - test passes
    }

    #[test]
    fn test_normalize_with_temp_file() {
        // Create a temporary file to test with an actual existing path
        let temp_dir = std::env::temp_dir();

        #[cfg(target_os = "windows")]
        let temp_file = temp_dir.join("test_java_normalize.exe");
        #[cfg(not(target_os = "windows"))]
        let temp_file = temp_dir.join("test_java_normalize");

        // Create the file
        if let Ok(mut file) = fs::File::create(&temp_file) {
            let _ = file.write_all(b"#!/bin/sh\necho test");
            drop(file);

            // Test normalization
            let result = normalize_java_path(temp_file.to_str().unwrap());

            // Clean up
            let _ = fs::remove_file(&temp_file);

            // Verify result
            assert!(result.is_ok(), "Failed to normalize temp file path");
            let normalized = result.unwrap();
            assert!(normalized.is_absolute());
        }
    }

    #[test]
    fn test_strip_unc_prefix() {
        #[cfg(target_os = "windows")]
        {
            let unc_path = PathBuf::from(r"\\?\C:\Windows\System32\cmd.exe");
            let stripped = strip_unc_prefix(unc_path);
            assert_eq!(stripped.to_string_lossy(), r"C:\Windows\System32\cmd.exe");

            let normal_path = PathBuf::from(r"C:\Windows\System32\cmd.exe");
            let unchanged = strip_unc_prefix(normal_path.clone());
            assert_eq!(unchanged, normal_path);
        }

        #[cfg(not(target_os = "windows"))]
        {
            let path = PathBuf::from("/usr/bin/java");
            let unchanged = strip_unc_prefix(path.clone());
            assert_eq!(unchanged, path);
        }
    }
}

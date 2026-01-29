use std::fmt;

/// Unified error type for Java component operations
///
/// This enum represents all possible errors that can occur in the Java component,
/// providing a consistent error handling interface across all modules.
#[derive(Debug, Clone)]
pub enum JavaError {
    // Java installation not found at the specified path
    NotFound,
    // Invalid Java version format or unable to parse version
    InvalidVersion(String),
    // Java installation verification failed (e.g., -version command failed)
    VerificationFailed(String),
    // Network error during API calls or downloads
    NetworkError(String),
    // File I/O error (reading, writing, or accessing files)
    IoError(String),
    // Timeout occurred during operation
    Timeout(String),
    // Serialization/deserialization error
    SerializationError(String),
    // Invalid configuration or parameters
    InvalidConfig(String),
    // Download or installation failed
    DownloadFailed(String),
    // Extraction or decompression failed
    ExtractionFailed(String),
    // Checksum verification failed
    ChecksumMismatch(String),
    // Other unspecified errors
    Other(String),
}

impl fmt::Display for JavaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            JavaError::NotFound => write!(f, "Java installation not found"),
            JavaError::InvalidVersion(msg) => write!(f, "Invalid Java version: {}", msg),
            JavaError::VerificationFailed(msg) => write!(f, "Java verification failed: {}", msg),
            JavaError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            JavaError::IoError(msg) => write!(f, "I/O error: {}", msg),
            JavaError::Timeout(msg) => write!(f, "Operation timeout: {}", msg),
            JavaError::SerializationError(msg) => write!(f, "Serialization error: {}", msg),
            JavaError::InvalidConfig(msg) => write!(f, "Invalid configuration: {}", msg),
            JavaError::DownloadFailed(msg) => write!(f, "Download failed: {}", msg),
            JavaError::ExtractionFailed(msg) => write!(f, "Extraction failed: {}", msg),
            JavaError::ChecksumMismatch(msg) => write!(f, "Checksum mismatch: {}", msg),
            JavaError::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for JavaError {}

/// Convert JavaError to String for Tauri command results
impl From<JavaError> for String {
    fn from(err: JavaError) -> Self {
        err.to_string()
    }
}

/// Convert std::io::Error to JavaError
impl From<std::io::Error> for JavaError {
    fn from(err: std::io::Error) -> Self {
        JavaError::IoError(err.to_string())
    }
}

/// Convert serde_json::Error to JavaError
impl From<serde_json::Error> for JavaError {
    fn from(err: serde_json::Error) -> Self {
        JavaError::SerializationError(err.to_string())
    }
}

/// Convert reqwest::Error to JavaError
impl From<reqwest::Error> for JavaError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            JavaError::Timeout(err.to_string())
        } else if err.is_connect() || err.is_request() {
            JavaError::NetworkError(err.to_string())
        } else {
            JavaError::NetworkError(err.to_string())
        }
    }
}

/// Convert String to JavaError
impl From<String> for JavaError {
    fn from(err: String) -> Self {
        JavaError::Other(err)
    }
}

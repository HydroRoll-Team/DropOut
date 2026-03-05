use serde::{Deserialize, Serialize};
use std::fmt;
use ts_rs::TS;

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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(
    export,
    export_to = "../../packages/ui-new/src/types/bindings/java/index.ts"
)]
pub enum ResumeJavaDownloadFailureReason {
    Network,
    Cancelled,
    ChecksumMismatch,
    ExtractionFailed,
    VerificationFailed,
    Filesystem,
    InvalidArchive,
    Unknown,
}

impl ResumeJavaDownloadFailureReason {
    /// Classify a raw error message into a stable reason enum for metrics/alert aggregation.
    pub fn from_error_message(error: &str) -> Self {
        let lower = error.to_ascii_lowercase();

        if lower.contains("cancel") {
            return Self::Cancelled;
        }
        if lower.contains("checksum") {
            return Self::ChecksumMismatch;
        }
        if lower.contains("extract") || lower.contains("unsupported archive") {
            return Self::ExtractionFailed;
        }
        if lower.contains("verify") || lower.contains("java executable not found") {
            return Self::VerificationFailed;
        }
        if lower.contains("request")
            || lower.contains("network")
            || lower.contains("timed out")
            || lower.contains("http status")
        {
            return Self::Network;
        }
        if lower.contains("archive") || lower.contains("top-level directory") {
            return Self::InvalidArchive;
        }
        if lower.contains("create")
            || lower.contains("write")
            || lower.contains("read")
            || lower.contains("rename")
            || lower.contains("permission")
            || lower.contains("directory")
            || lower.contains("path")
        {
            return Self::Filesystem;
        }

        Self::Unknown
    }
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

#[cfg(test)]
mod tests {
    use super::ResumeJavaDownloadFailureReason;

    #[test]
    fn classify_resume_failure_reason_table_driven() {
        let cases = [
            (
                "Download cancelled by user",
                ResumeJavaDownloadFailureReason::Cancelled,
            ),
            (
                "Checksum verification failed",
                ResumeJavaDownloadFailureReason::ChecksumMismatch,
            ),
            (
                "Failed to extract file: invalid archive",
                ResumeJavaDownloadFailureReason::ExtractionFailed,
            ),
            (
                "Failed to verify Java installation",
                ResumeJavaDownloadFailureReason::VerificationFailed,
            ),
            (
                "Request failed: timed out",
                ResumeJavaDownloadFailureReason::Network,
            ),
            ("HTTP status 503", ResumeJavaDownloadFailureReason::Network),
            (
                "Failed to create directory",
                ResumeJavaDownloadFailureReason::Filesystem,
            ),
            (
                "Top-level directory not found in archive",
                ResumeJavaDownloadFailureReason::InvalidArchive,
            ),
            (
                "completely unknown issue",
                ResumeJavaDownloadFailureReason::Unknown,
            ),
        ];

        for (message, expected) in cases {
            let actual = ResumeJavaDownloadFailureReason::from_error_message(message);
            assert_eq!(
                std::mem::discriminant(&actual),
                std::mem::discriminant(&expected),
                "message '{}' expected {:?} but got {:?}",
                message,
                expected,
                actual
            );
        }
    }

    #[test]
    fn classify_resume_failure_reason_priority_rules() {
        let cancelled_over_network =
            ResumeJavaDownloadFailureReason::from_error_message("request cancelled due to timeout");
        assert_eq!(
            std::mem::discriminant(&cancelled_over_network),
            std::mem::discriminant(&ResumeJavaDownloadFailureReason::Cancelled)
        );

        let checksum_over_filesystem = ResumeJavaDownloadFailureReason::from_error_message(
            "failed to read file: checksum mismatch",
        );
        assert_eq!(
            std::mem::discriminant(&checksum_over_filesystem),
            std::mem::discriminant(&ResumeJavaDownloadFailureReason::ChecksumMismatch)
        );
    }
}

use crate::core::java::{ImageType, JavaCatalog, JavaDownloadInfo, JavaError};
use tauri::AppHandle;

/// Trait for Java distribution providers (e.g., Adoptium, Corretto)
///
/// Implementations handle fetching Java catalogs and release information
/// from different distribution providers.
pub trait JavaProvider: Send + Sync {
    /// Fetch the Java catalog (all available versions for this provider)
    ///
    /// # Arguments
    /// * `app_handle` - The Tauri app handle for cache access
    /// * `force_refresh` - If true, bypass cache and fetch fresh data
    ///
    /// # Returns
    /// * `Ok(JavaCatalog)` with available versions
    /// * `Err(JavaError)` if fetch or parsing fails
    async fn fetch_catalog(
        &self,
        app_handle: &AppHandle,
        force_refresh: bool,
    ) -> Result<JavaCatalog, JavaError>;

    /// Fetch a specific Java release
    ///
    /// # Arguments
    /// * `major_version` - The major version number (e.g., 17, 21)
    /// * `image_type` - Whether to fetch JRE or JDK
    ///
    /// # Returns
    /// * `Ok(JavaDownloadInfo)` with download details
    /// * `Err(JavaError)` if fetch or parsing fails
    async fn fetch_release(
        &self,
        major_version: u32,
        image_type: ImageType,
    ) -> Result<JavaDownloadInfo, JavaError>;

    /// Get list of available major versions
    ///
    /// # Returns
    /// * `Ok(Vec<u32>)` with available major versions
    /// * `Err(JavaError)` if fetch fails
    async fn available_versions(&self) -> Result<Vec<u32>, JavaError>;

    /// Get provider name (e.g., "adoptium", "corretto")
    #[allow(dead_code)]
    fn provider_name(&self) -> &'static str;

    /// Get OS name for this provider's API
    fn os_name(&self) -> &'static str;

    /// Get architecture name for this provider's API
    fn arch_name(&self) -> &'static str;

    /// Get installation directory prefix (e.g., "temurin", "corretto")
    fn install_prefix(&self) -> &'static str;
}

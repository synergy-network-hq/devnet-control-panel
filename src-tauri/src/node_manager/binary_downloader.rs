use super::binary_verification;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

/// Binary download configuration
pub struct BinaryDownloadConfig {
    pub base_url: String,
    pub version: String,
}

impl Default for BinaryDownloadConfig {
    fn default() -> Self {
        Self {
            base_url: "https://releases.synergy-network.io".to_string(),
            version: "latest".to_string(),
        }
    }
}

/// Get the current platform's binary name
pub fn get_platform_binary_name() -> &'static str {
    #[cfg(all(target_arch = "aarch64", target_os = "macos"))]
    return "synergy-devnet-aarch64-apple-darwin";

    #[cfg(all(target_arch = "x86_64", target_os = "macos"))]
    return "synergy-devnet-x86_64-apple-darwin";

    #[cfg(all(target_arch = "x86_64", target_os = "linux"))]
    return "synergy-devnet-x86_64-unknown-linux-gnu";

    #[cfg(all(target_arch = "aarch64", target_os = "linux"))]
    return "synergy-devnet-aarch64-unknown-linux-gnu";

    #[cfg(all(target_arch = "x86_64", target_os = "windows"))]
    return "synergy-devnet-x86_64-pc-windows-msvc.exe";

    #[allow(unreachable_code)]
    "synergy-devnet"
}

/// Download binary from remote server
pub async fn download_binary(
    dest_path: &Path,
    config: Option<BinaryDownloadConfig>,
) -> Result<(), String> {
    let config = config.unwrap_or_default();
    let binary_name = get_platform_binary_name();

    // Construct download URL
    let url = format!("{}/v{}/{}", config.base_url, config.version, binary_name);

    println!("Downloading binary from: {}", url);

    // Download the file
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download binary: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read binary data: {}", e))?;

    println!("Downloaded {} bytes", bytes.len());

    // Create parent directory if needed
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Write to temporary file first
    let temp_path = dest_path.with_extension("tmp");
    let mut temp_file =
        File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {}", e))?;

    temp_file
        .write_all(&bytes)
        .map_err(|e| format!("Failed to write binary: {}", e))?;

    drop(temp_file);

    // Verify checksum before finalizing - security must not be bypassed
    println!("Verifying downloaded binary...");
    match binary_verification::verify_binary(&temp_path) {
        Ok(true) => {
            println!("✅ Binary verified successfully");
        }
        Ok(false) => {
            // Clean up failed download
            let _ = fs::remove_file(&temp_path);
            return Err(
                "Downloaded binary failed checksum verification. Download aborted for security."
                    .to_string(),
            );
        }
        Err(e) => {
            // Verification errors must also fail - do not bypass security
            let _ = fs::remove_file(&temp_path);
            return Err(format!(
                "Binary verification failed: {}. Download aborted for security.",
                e
            ));
        }
    }

    // Move temp file to final destination
    fs::rename(&temp_path, dest_path)
        .map_err(|e| format!("Failed to move binary to destination: {}", e))?;

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(dest_path)
            .map_err(|e| format!("Failed to get metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(dest_path, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    println!("✅ Binary downloaded and installed successfully");

    Ok(())
}

/// Download binary with progress callback
pub async fn download_binary_with_progress<F>(
    dest_path: &Path,
    config: Option<BinaryDownloadConfig>,
    mut progress_callback: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64), // (downloaded_bytes, total_bytes)
{
    let config = config.unwrap_or_default();
    let binary_name = get_platform_binary_name();
    let url = format!("{}/v{}/{}", config.base_url, config.version, binary_name);

    println!("Downloading binary from: {}", url);

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download binary: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;

    // Create parent directory if needed
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Write to temporary file with progress tracking
    let temp_path = dest_path.with_extension("tmp");
    let mut temp_file =
        File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {}", e))?;

    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        temp_file
            .write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;
        progress_callback(downloaded, total_size);
    }

    drop(temp_file);

    // Verify checksum - security must not be bypassed
    println!("Verifying downloaded binary...");
    match binary_verification::verify_binary(&temp_path) {
        Ok(true) => {
            println!("✅ Binary verified successfully");
        }
        Ok(false) => {
            let _ = fs::remove_file(&temp_path);
            return Err(
                "Downloaded binary failed checksum verification. Download aborted for security."
                    .to_string(),
            );
        }
        Err(e) => {
            // Verification errors must also fail - do not bypass security
            let _ = fs::remove_file(&temp_path);
            return Err(format!(
                "Binary verification failed: {}. Download aborted for security.",
                e
            ));
        }
    }

    // Move to final destination
    fs::rename(&temp_path, dest_path).map_err(|e| format!("Failed to move binary: {}", e))?;

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(dest_path)
            .map_err(|e| format!("Failed to get metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(dest_path, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    println!("✅ Binary downloaded and installed successfully");
    Ok(())
}

/// Download a binary directly from a provided URL with optional progress.
pub async fn download_binary_direct_with_progress<F>(
    dest_path: &Path,
    url: &str,
    checksum: Option<&str>,
    mut progress_callback: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64), // (downloaded_bytes, total_bytes)
{
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download binary: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;

    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let temp_path = dest_path.with_extension("tmp");
    let mut temp_file =
        File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {}", e))?;

    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        temp_file
            .write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;
        progress_callback(downloaded, total_size);
    }

    drop(temp_file);

    if let Some(expected) = checksum {
        let actual = binary_verification::calculate_checksum(&temp_path)
            .map_err(|e| format!("Failed to calculate checksum: {}", e))?;
        if actual != expected {
            let _ = fs::remove_file(&temp_path);
            return Err("Checksum mismatch for downloaded binary".to_string());
        }
    }

    fs::rename(&temp_path, dest_path)
        .map_err(|e| format!("Failed to move binary to destination: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(dest_path)
            .map_err(|e| format!("Failed to get binary metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(dest_path, perms)
            .map_err(|e| format!("Failed to set binary permissions: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_platform_binary_name() {
        let binary_name = get_platform_binary_name();
        assert!(!binary_name.is_empty());
        assert!(binary_name.starts_with("synergy-devnet"));
    }

    #[test]
    fn test_binary_download_config_default() {
        let config = BinaryDownloadConfig::default();
        assert_eq!(config.base_url, "https://releases.synergy-network.io");
        assert!(!config.version.is_empty());
    }
}

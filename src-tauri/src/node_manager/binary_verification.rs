use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

/// Calculate SHA-256 checksum of a file
pub fn calculate_checksum(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

pub fn verify_binary_with_expected(path: &Path, expected_checksum: &str) -> Result<bool, String> {
    let actual_checksum =
        calculate_checksum(path).map_err(|e| format!("Failed to calculate checksum: {}", e))?;

    Ok(actual_checksum == expected_checksum)
}

/// Verify binary checksum against an expected value provided via env
pub fn verify_binary(path: &Path) -> Result<bool, String> {
    let env_key = platform_env_checksum_key();
    let expected =
        std::env::var(&env_key).map_err(|_| format!("Checksum env var {} not set", env_key))?;
    verify_binary_with_expected(path, &expected)
}

/// Verify binary and provide detailed output
pub fn verify_binary_verbose(path: &Path) -> Result<(), String> {
    let env_key = platform_env_checksum_key();
    let expected =
        std::env::var(&env_key).map_err(|_| format!("Checksum env var {} not set", env_key))?;

    println!("Verifying binary: {}", path.display());

    let actual_checksum =
        calculate_checksum(path).map_err(|e| format!("Failed to calculate checksum: {}", e))?;

    println!("Calculated checksum: {}", actual_checksum);
    println!("Expected checksum:   {}", expected);

    if actual_checksum == expected {
        println!("✅ Checksum verified successfully");
        Ok(())
    } else {
        Err("❌ Checksum verification failed!".to_string())
    }
}

fn platform_env_checksum_key() -> String {
    #[cfg(all(target_arch = "aarch64", target_os = "macos"))]
    return "SYNERGY_BINARY_CHECKSUM_DARWIN_ARM64".to_string();

    #[cfg(all(target_arch = "x86_64", target_os = "macos"))]
    return "SYNERGY_BINARY_CHECKSUM_DARWIN_AMD64".to_string();

    #[cfg(all(target_arch = "x86_64", target_os = "linux"))]
    return "SYNERGY_BINARY_CHECKSUM_LINUX_AMD64".to_string();

    #[cfg(all(target_arch = "aarch64", target_os = "linux"))]
    return "SYNERGY_BINARY_CHECKSUM_LINUX_ARM64".to_string();

    #[cfg(all(target_arch = "x86_64", target_os = "windows"))]
    return "SYNERGY_BINARY_CHECKSUM_WINDOWS_AMD64".to_string();

    #[allow(unreachable_code)]
    "SYNERGY_BINARY_CHECKSUM".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_calculate_checksum() {
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(b"Hello, World!").unwrap();
        temp_file.flush().unwrap();

        let checksum = calculate_checksum(temp_file.path()).unwrap();

        // SHA-256 of "Hello, World!" is known
        assert_eq!(
            checksum,
            "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
        );
    }

    #[test]
    fn test_verify_with_env_checksum() {
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(b"Hello, World!").unwrap();
        temp_file.flush().unwrap();

        let expected = calculate_checksum(temp_file.path()).unwrap();
        std::env::set_var(platform_env_checksum_key(), expected.clone());

        assert!(verify_binary(temp_file.path()).unwrap());
        assert!(verify_binary_with_expected(temp_file.path(), &expected).unwrap());
    }
}

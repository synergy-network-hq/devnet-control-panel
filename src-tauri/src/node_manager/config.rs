use std::fs;
use std::path::PathBuf;

pub fn load_config(config_path: &PathBuf) -> Result<serde_json::Value, String> {
    let content =
        fs::read_to_string(config_path).map_err(|e| format!("Failed to read config: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))
}

pub fn save_config(config_path: &PathBuf, config: &serde_json::Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(config_path, content).map_err(|e| format!("Failed to write config: {}", e))
}

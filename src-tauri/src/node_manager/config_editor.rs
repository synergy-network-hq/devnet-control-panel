use crate::node_manager::multi_node::MultiNodeManager;
use std::fs;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[tauri::command]
pub async fn get_node_config(
    node_id: String,
    manager: State<'_, Arc<Mutex<MultiNodeManager>>>,
) -> Result<String, String> {
    let mgr = manager.lock().await;

    let node = mgr.get_node(&node_id).ok_or("Node not found")?;

    fs::read_to_string(&node.config_path).map_err(|e| format!("Failed to read config file: {}", e))
}

#[tauri::command]
pub async fn save_node_config(
    node_id: String,
    config_content: String,
    manager: State<'_, Arc<Mutex<MultiNodeManager>>>,
) -> Result<(), String> {
    let mgr = manager.lock().await;

    let node = mgr.get_node(&node_id).ok_or("Node not found")?;

    // Validate TOML syntax before saving
    toml::from_str::<toml::Value>(&config_content)
        .map_err(|e| format!("Invalid TOML syntax: {}", e))?;

    fs::write(&node.config_path, config_content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn reload_node_config(
    node_id: String,
    manager: State<'_, Arc<Mutex<MultiNodeManager>>>,
) -> Result<(), String> {
    let mgr = manager.lock().await;

    let node = mgr.get_node(&node_id).ok_or("Node not found")?;

    if node.is_running {
        return Err(
            "Cannot reload config while node is running. Please stop the node first.".to_string(),
        );
    }

    // Verify config file exists and is valid
    let config_content = fs::read_to_string(&node.config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    toml::from_str::<toml::Value>(&config_content)
        .map_err(|e| format!("Invalid TOML syntax in config: {}", e))?;

    Ok(())
}

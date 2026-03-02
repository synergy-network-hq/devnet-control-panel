use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Serialize, Deserialize};
use crate::node_manager::types::*;
use crate::node_manager::multi_node::MultiNodeManager;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeInfo {
    pub node_id: String,
    pub node_type: String,
    pub node_class: String,
    pub is_running: bool,
    pub uptime: String,
    pub version: String,
    pub public_key: String,
}

#[tauri::command]
pub async fn get_node_info(
    manager: State<'_, Arc<Mutex<MultiNodeManager>>>,
) -> Result<NodeInfo, String> {
    let mgr = manager.lock().await;

    // Get the first node (for now, we'll assume single node setup)
    let nodes = mgr.list_nodes();
    if nodes.is_empty() {
        return Err("No nodes found".to_string());
    }

    let node = &nodes[0];

    Ok(NodeInfo {
        node_id: node.id.clone(),
        node_type: node.node_type.as_str().to_string(),
        node_class: format!("Class {}", node.node_class.class_number()),
        is_running: node.is_running,
        uptime: "N/A".to_string(), // Would need actual uptime calculation
        version: "1.0.0".to_string(),
        public_key: node.public_key.clone(),
    })
}

#[tauri::command]
pub async fn get_network_setting() -> Result<String, String> {
    // For now, always return "devnet" as requested
    Ok("devnet".to_string())
}

#[tauri::command]
pub async fn set_network_setting(
    network: String,
) -> Result<(), String> {
    // Only allow devnet for now
    if network != "devnet" {
        return Err("Only devnet is available at this time".to_string());
    }

    // In a real implementation, this would update the network configuration
    // For now, we'll just accept the setting
    Ok(())
}

#[tauri::command]
pub async fn get_secret_key(
    node_id: String,
    manager: State<'_, Arc<Mutex<MultiNodeManager>>>,
) -> Result<String, String> {
    let mgr = manager.lock().await;

    // Find the node
    let node = mgr.get_node(&node_id)
        .ok_or_else(|| "Node not found".to_string())?;

    // Read the secret key from file
    let secret_key_path = node.sandbox_path.join("keys").join("private.key");

    if !secret_key_path.exists() {
        return Err("Secret key file not found".to_string());
    }

    let secret_key = fs::read_to_string(&secret_key_path)
        .map_err(|e| format!("Failed to read secret key: {}", e))?;

    Ok(secret_key)
}
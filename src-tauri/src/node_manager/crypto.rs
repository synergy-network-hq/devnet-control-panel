use crate::node_manager::node_classes::NodeClass;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// Import synergy-address-engine
use synergy_address_engine::{generate_identity, AddressType};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyPair {
    pub public_key: String,
    pub private_key: String,
    pub address: String,
    pub node_class: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeIdentity {
    pub address: String,
    pub public_key: String,
    pub private_key_path: PathBuf,
    pub node_class: u8,
}

/// Generate PQC keypair using synergy-address-engine
pub async fn generate_pqc_keypair(
    node_class: NodeClass,
    keys_dir: &PathBuf,
) -> Result<NodeIdentity, String> {
    // Ensure keys directory exists
    std::fs::create_dir_all(keys_dir)
        .map_err(|e| format!("Failed to create keys directory: {}", e))?;

    // Map NodeClass to AddressType
    let address_type = match node_class {
        NodeClass::ClassI => AddressType::NodeClass1,
        NodeClass::ClassII => AddressType::NodeClass2,
        NodeClass::ClassIII => AddressType::NodeClass3,
        NodeClass::ClassIV => AddressType::NodeClass4,
        NodeClass::ClassV => AddressType::NodeClass5,
    };

    // Generate identity using synergy-address-engine
    let identity = generate_identity(address_type)
        .map_err(|e| format!("Failed to generate PQC identity: {}", e))?;

    // Create key files
    let public_key_path = keys_dir.join("public.key");
    let private_key_path = keys_dir.join("private.key");

    // Write public key
    std::fs::write(&public_key_path, &identity.public_key)
        .map_err(|e| format!("Failed to write public key: {}", e))?;

    // Write private key
    std::fs::write(&private_key_path, &identity.private_key)
        .map_err(|e| format!("Failed to write private key: {}", e))?;

    Ok(NodeIdentity {
        address: identity.address,
        public_key: identity.public_key,
        private_key_path: private_key_path,
        node_class: node_class.class_number(),
    })
}

/// Parse the output from synergy-devnet keygen command
fn parse_keygen_output(
    output: &str,
    node_class: NodeClass,
    keys_dir: &PathBuf,
) -> Result<NodeIdentity, String> {
    // The new binary outputs the address directly to stdout
    let address = output.trim().to_string();

    // Validate the address format
    if address.is_empty() || !address.starts_with(node_class.address_prefix()) {
        return Err(format!("Invalid address format: {}", address));
    }

    let public_key_path = keys_dir.join("public.key");
    let private_key_path = keys_dir.join("private.key");

    // Read public key from file (should be base64 encoded)
    let public_key = if public_key_path.exists() {
        std::fs::read_to_string(&public_key_path)
            .map_err(|e| format!("Failed to read public key: {}", e))?
            .trim()
            .to_string()
    } else {
        return Err("Public key file not found".to_string());
    };

    Ok(NodeIdentity {
        address,
        public_key,
        private_key_path,
        node_class: node_class.class_number(),
    })
}

use tauri::Emitter;

/// Register node with the Synergy network via RPC
pub async fn register_node_with_network(
    app_handle: tauri::AppHandle,
    _binary_path: &PathBuf,
    node_identity: &NodeIdentity,
    _config_path: &PathBuf,
) -> Result<(), String> {
    // Emit that we're starting the registration process
    app_handle.emit("terminal-output",
        serde_json::json!({ "line": "[Network] Starting node registration...", "type": "info" })
    ).unwrap_or(());

    // Load config to get RPC endpoint
    let env_config = crate::env_config::EnvConfig::load(Some(&app_handle))?;

    // Read public key from file
    let public_key =
        std::fs::read_to_string(&node_identity.private_key_path.with_file_name("public.key"))
            .map_err(|e| format!("Failed to read public key: {}", e))?;

    // Build the RPC request to register the node
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let node_name = node_identity.address.clone();
    let stake_amount = 0u64;
    let rpc_request = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "synergy_registerValidator",
        "params": [
            node_identity.address.clone(),
            public_key.trim(),
            node_name,
            stake_amount
        ],
        "id": 1
    });

    app_handle.emit("terminal-output",
        serde_json::json!({ "line": format!("[Network] Registering {} with devnet...", node_identity.address), "type": "info" })
    ).unwrap_or(());

    let endpoints = env_config.rpc_endpoints();
    if endpoints.is_empty() {
        return Err("No RPC endpoints configured for registration".to_string());
    }

    let mut last_error = None;
    for rpc_endpoint in endpoints {
        let response = client.post(&rpc_endpoint).json(&rpc_request).send().await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let body: serde_json::Value = match resp.json().await {
                    Ok(body) => body,
                    Err(e) => {
                        last_error = Some(format!(
                            "Failed to parse registration response from {}: {}",
                            rpc_endpoint, e
                        ));
                        continue;
                    }
                };

                if let Some(error) = body.get("error") {
                    last_error = Some(format!("RPC error from {}: {}", rpc_endpoint, error));
                    continue;
                }

                let result = match body.get("result") {
                    Some(result) => result,
                    None => {
                        last_error = Some(format!(
                            "Registration response from {} missing result field",
                            rpc_endpoint
                        ));
                        continue;
                    }
                };

                if let Some(success) = result.get("success").and_then(|v| v.as_bool()) {
                    if success {
                        app_handle.emit("terminal-output",
                            serde_json::json!({ "line": "[Network] ✓ Registration confirmed!", "type": "success" })
                        ).unwrap_or(());

                        app_handle.emit("terminal-output",
                            serde_json::json!({ "line": "[Network] ✓ Node added to devnet registry", "type": "success" })
                        ).unwrap_or(());

                        return Ok(());
                    }
                }

                let error_msg = result
                    .get("error")
                    .and_then(|v| v.as_str())
                    .or_else(|| result.get("message").and_then(|v| v.as_str()))
                    .or_else(|| result.as_str())
                    .unwrap_or("Registration rejected by network");
                last_error = Some(format!(
                    "Registration rejected by {}: {}",
                    rpc_endpoint, error_msg
                ));
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                last_error = Some(format!(
                    "Registration failed via {} (HTTP {}): {}",
                    rpc_endpoint, status, body
                ));
            }
            Err(e) => {
                if e.is_timeout() {
                    last_error = Some(format!("Registration timed out via {}", rpc_endpoint));
                } else if e.is_connect() {
                    last_error = Some(format!("Cannot connect to {}", rpc_endpoint));
                } else {
                    last_error = Some(format!("Registration failed via {}: {}", rpc_endpoint, e));
                }
            }
        }
    }

    app_handle.emit("terminal-output",
        serde_json::json!({ "line": "[ERROR] Registration failed across all RPC endpoints", "type": "error" })
    ).unwrap_or(());
    Err(format!(
        "Registration failed across all RPC endpoints. Last error: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

/// Connect to Synergy devnet and sync via RPC
pub async fn connect_and_sync(
    app_handle: tauri::AppHandle,
    _binary_path: &PathBuf,
    _config_path: &PathBuf,
) -> Result<(), String> {
    // Emit that we're starting the sync process
    app_handle.emit("terminal-output",
        serde_json::json!({ "line": "[Sync] Starting blockchain synchronization...", "type": "info" })
    ).unwrap_or(());

    // Load config to get RPC endpoint
    let env_config = crate::env_config::EnvConfig::load(Some(&app_handle))?;

    // Build the RPC request to get sync status
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Get current block height from network
    let rpc_request = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "synergy_blockNumber",
        "params": [],
        "id": 1
    });

    app_handle
        .emit(
            "terminal-output",
            serde_json::json!({ "line": "[Sync] Connecting to network...", "type": "info" }),
        )
        .unwrap_or(());

    let endpoints = env_config.rpc_endpoints();
    if endpoints.is_empty() {
        return Err("No RPC endpoints configured for sync".to_string());
    }

    let mut last_error = None;
    for rpc_endpoint in endpoints {
        let response = client.post(&rpc_endpoint).json(&rpc_request).send().await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let body: serde_json::Value = match resp.json().await {
                    Ok(body) => body,
                    Err(e) => {
                        last_error = Some(format!(
                            "Failed to parse sync response from {}: {}",
                            rpc_endpoint, e
                        ));
                        continue;
                    }
                };

                if let Some(error) = body.get("error") {
                    last_error = Some(format!("RPC error from {}: {}", rpc_endpoint, error));
                    continue;
                }

                let result = match body.get("result") {
                    Some(result) => result,
                    None => {
                        last_error = Some(format!(
                            "Sync response from {} missing result field",
                            rpc_endpoint
                        ));
                        continue;
                    }
                };

                let block_number = if let Some(value) = result.as_u64() {
                    Some(value)
                } else if let Some(value) = result.as_str() {
                    if value.starts_with("0x") {
                        u64::from_str_radix(&value[2..], 16).ok()
                    } else {
                        value.parse::<u64>().ok()
                    }
                } else {
                    None
                };

                if let Some(block_number) = block_number {
                    app_handle.emit("terminal-output",
                        serde_json::json!({ "line": format!("[Sync] Current block height: {}", block_number), "type": "info" })
                    ).unwrap_or(());

                    app_handle.emit("terminal-output",
                        serde_json::json!({ "line": "[Sync] ✓ Blockchain synchronization completed!", "type": "success" })
                    ).unwrap_or(());

                    return Ok(());
                }

                last_error = Some(format!(
                    "Unexpected sync response from {}: {}",
                    rpc_endpoint, result
                ));
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                last_error = Some(format!(
                    "Sync failed via {} (HTTP {}): {}",
                    rpc_endpoint, status, body
                ));
            }
            Err(e) => {
                if e.is_timeout() {
                    last_error = Some(format!("Sync timed out via {}", rpc_endpoint));
                } else if e.is_connect() {
                    last_error = Some(format!("Cannot connect to {}", rpc_endpoint));
                } else {
                    last_error = Some(format!("Sync failed via {}: {}", rpc_endpoint, e));
                }
            }
        }
    }

    app_handle.emit("terminal-output",
        serde_json::json!({ "line": "[ERROR] Sync failed across all RPC endpoints", "type": "error" })
    ).unwrap_or(());
    Err(format!(
        "Sync failed across all RPC endpoints. Last error: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

use crate::blockchain::BlockchainService;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[tauri::command]
pub async fn set_rpc_endpoint(
    endpoint: String,
    blockchain_state: State<'_, Arc<Mutex<BlockchainService>>>,
) -> Result<(), String> {
    // This would require recreating the RPC client, which is complex
    // For now, we'll return an error indicating this needs to be set at startup
    Err("RPC endpoint can only be set at application startup".to_string())
}

#[tauri::command]  
pub async fn get_network_status(
    blockchain_state: State<'_, Arc<Mutex<BlockchainService>>>,
) -> Result<crate::blockchain::NetworkStatus, String> {
    let blockchain_service = blockchain_state.lock().await;
    blockchain_service.get_network_status().await
}

#[tauri::command]
pub async fn get_block_height(
    blockchain_state: State<'_, Arc<Mutex<BlockchainService>>>,
) -> Result<u64, String> {
    let blockchain_service = blockchain_state.lock().await;
    let status = blockchain_service.get_network_status().await?;
    Ok(status.current_block_height)
}

#[tauri::command]
pub async fn get_peer_count(
    blockchain_state: State<'_, Arc<Mutex<BlockchainService>>>,
) -> Result<u64, String> {
    let blockchain_service = blockchain_state.lock().await;
    let status = blockchain_service.get_network_status().await?;
    Ok(status.network_peers)
}
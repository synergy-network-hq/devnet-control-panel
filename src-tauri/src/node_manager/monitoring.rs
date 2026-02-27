use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::blockchain::BlockchainService;
use crate::node_manager::multi_node::MultiNodeManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringData {
    pub timestamp: i64,
    pub node_id: Option<String>,
    pub node_status: String,
    pub block_height: Option<u64>,
    pub peer_count: Option<u64>,
    pub cpu_usage: Option<f64>,
    pub memory_usage: Option<u64>,
    pub disk_usage: Option<u64>,
}

pub struct MonitoringService {
    app_handle: Option<AppHandle>,
    multi_node_manager: Arc<Mutex<MultiNodeManager>>,
    blockchain_service: Arc<Mutex<BlockchainService>>,
}

impl MonitoringService {
    pub fn new(
        multi_node_manager: Arc<Mutex<MultiNodeManager>>,
        blockchain_service: Arc<Mutex<BlockchainService>>,
    ) -> Self {
        Self {
            app_handle: None,
            multi_node_manager,
            blockchain_service,
        }
    }

    pub fn set_app_handle(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
    }

    pub async fn start_monitoring(&self) {
        let multi_node_manager = Arc::clone(&self.multi_node_manager);
        let blockchain_service = Arc::clone(&self.blockchain_service);
        let app_handle_option = self.app_handle.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));

            loop {
                interval.tick().await;

                // Get all nodes and blockchain status
                let (all_nodes_data, blockchain_status) = {
                    let mgr = multi_node_manager.lock().await;
                    let nodes = mgr
                        .list_nodes()
                        .iter()
                        .map(|n| (n.id.clone(), n.is_running))
                        .collect::<Vec<_>>();

                    let blockchain_service = blockchain_service.lock().await;
                    let status = blockchain_service.get_network_status().await.ok();
                    (nodes, status)
                };

                // Process each node
                for (node_id, is_running) in all_nodes_data {
                    let app_handle = if let Some(ref app_handle) = app_handle_option {
                        app_handle.clone()
                    } else {
                        continue;
                    };

                    let monitoring_data = MonitoringData {
                        timestamp: Utc::now().timestamp(),
                        node_id: Some(node_id.clone()),
                        node_status: if is_running {
                            "running".to_string()
                        } else {
                            "stopped".to_string()
                        },
                        block_height: if is_running {
                            // Use the blockchain status we already fetched
                            blockchain_status
                                .as_ref()
                                .map(|status| status.current_block_height)
                        } else {
                            None
                        },
                        peer_count: if is_running {
                            // Use the blockchain status we already fetched
                            blockchain_status
                                .as_ref()
                                .map(|status| status.network_peers)
                        } else {
                            None
                        },
                        cpu_usage: None,    // This would come from system metrics
                        memory_usage: None, // This would come from system metrics
                        disk_usage: None,   // This would come from system metrics
                    };

                    // Emit the monitoring data
                    let _ = app_handle.emit("node-monitoring-update", monitoring_data);
                }

                // Also emit general blockchain status
                if let Some(ref app_handle) = app_handle_option {
                    if let Some(network_status) = &blockchain_status {
                        let blockchain_data = serde_json::json!({
                            "timestamp": Utc::now().timestamp(),
                            "type": "blockchain_status",
                            "current_block_height": network_status.current_block_height,
                            "network_peers": network_status.network_peers,
                            "sync_percentage": network_status.sync_percentage,
                            "is_synced": network_status.is_synced,
                        });

                        let _ = app_handle.emit("blockchain-update", blockchain_data);
                    }
                }
            }
        });
    }
}

use crate::node_manager::crypto::NodeIdentity;
use crate::node_manager::types::{MultiNodeInfo, NodeInstance, NodeOperationMode, NodeType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiNodeManager {
    pub info: MultiNodeInfo,
    pub processes: HashMap<String, Option<u32>>,
}

impl MultiNodeManager {
    pub fn new() -> Result<Self, String> {
        let home = dirs::home_dir().ok_or("Failed to get home directory")?;
        let control_panel_path = home.join(".synergy").join("control-panel");
        let binary_path = control_panel_path.join("bin").join(get_binary_name());

        let info = MultiNodeInfo {
            control_panel_path,
            binary_path,
            nodes: HashMap::new(),
            is_initialized: false,
        };

        Ok(Self {
            info,
            processes: HashMap::new(),
        })
    }

    pub fn load() -> Result<Self, String> {
        let home = dirs::home_dir().ok_or("Failed to get home directory")?;
        let state_file = home
            .join(".synergy")
            .join("control-panel")
            .join("state.json");

        if !state_file.exists() {
            return Self::new();
        }

        let data = fs::read_to_string(&state_file)
            .map_err(|e| format!("Failed to read state file: {}", e))?;

        let info: MultiNodeInfo = serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse state file: {}", e))?;

        Ok(Self {
            info,
            processes: HashMap::new(),
        })
    }

    pub fn save(&self) -> Result<(), String> {
        let state_file = self.info.control_panel_path.join("state.json");

        // Ensure parent directory exists
        if let Some(parent) = state_file.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create state directory: {}", e))?;
        }

        let json = serde_json::to_string_pretty(&self.info)
            .map_err(|e| format!("Failed to serialize state: {}", e))?;

        fs::write(&state_file, json).map_err(|e| format!("Failed to write state file: {}", e))?;

        Ok(())
    }

    pub fn add_node(
        &mut self,
        node_type: NodeType,
        display_name: Option<String>,
    ) -> Result<String, String> {
        // Generate unique ID
        let id = uuid::Uuid::new_v4().to_string();

        // Check compatibility with existing nodes
        let existing_types: Vec<NodeType> = self
            .info
            .nodes
            .values()
            .map(|n| n.node_type.clone())
            .collect();

        for existing_type in &existing_types {
            if !self.is_compatible(&node_type, existing_type) {
                return Err(format!(
                    "Node type {} is not compatible with existing {}",
                    node_type.display_name(),
                    existing_type.display_name()
                ));
            }
        }

        // Create node-specific sandbox
        let node_sandbox = self.info.control_panel_path.join("nodes").join(&id);

        let instance = NodeInstance {
            id: id.clone(),
            node_type: node_type.clone(),
            sandbox_path: node_sandbox.clone(),
            config_path: node_sandbox.join("config").join("node.toml"),
            logs_path: node_sandbox.join("logs"),
            data_path: node_sandbox.join("data"),
            is_running: false,
            pid: None,
            started_at: None,
            display_name: display_name.unwrap_or_else(|| node_type.display_name().to_string()),
            address: None,
            public_key: None,
            node_class: None,
            operation_mode: NodeOperationMode::default(),
        };

        // Create directory structure
        self.create_node_directories(&instance)?;

        self.info.nodes.insert(id.clone(), instance);
        self.save()?;

        Ok(id)
    }

    pub fn is_compatible(&self, node_type: &NodeType, existing_type: &NodeType) -> bool {
        if node_type == existing_type {
            return true;
        }

        let compatible = node_type.compatible_nodes();
        compatible.contains(existing_type)
    }

    pub fn get_compatible_node_types(&self) -> Vec<NodeType> {
        if self.info.nodes.is_empty() {
            // Return all node types if no nodes exist yet
            return vec![
                NodeType::Validator,
                NodeType::Committee,
                NodeType::ArchiveValidator,
                NodeType::AuditValidator,
                NodeType::Relayer,
                NodeType::Witness,
                NodeType::Oracle,
                NodeType::UmaCoordinator,
                NodeType::CrossChainVerifier,
                NodeType::Compute,
                NodeType::AiInference,
                NodeType::PqcCrypto,
                NodeType::DataAvailability,
                NodeType::GovernanceAuditor,
                NodeType::TreasuryController,
                NodeType::SecurityCouncil,
                NodeType::RpcGateway,
                NodeType::Indexer,
                NodeType::Observer,
            ];
        }

        // Get all existing node types
        let existing_types: Vec<NodeType> = self
            .info
            .nodes
            .values()
            .map(|n| n.node_type.clone())
            .collect();

        // Find node types compatible with ALL existing nodes
        let all_types = vec![
            NodeType::Validator,
            NodeType::Committee,
            NodeType::ArchiveValidator,
            NodeType::AuditValidator,
            NodeType::Relayer,
            NodeType::Witness,
            NodeType::Oracle,
            NodeType::UmaCoordinator,
            NodeType::CrossChainVerifier,
            NodeType::Compute,
            NodeType::AiInference,
            NodeType::PqcCrypto,
            NodeType::DataAvailability,
            NodeType::GovernanceAuditor,
            NodeType::TreasuryController,
            NodeType::SecurityCouncil,
            NodeType::RpcGateway,
            NodeType::Indexer,
            NodeType::Observer,
        ];

        all_types
            .into_iter()
            .filter(|node_type| {
                existing_types
                    .iter()
                    .all(|existing| self.is_compatible(node_type, existing))
            })
            .collect()
    }

    fn create_node_directories(&self, instance: &NodeInstance) -> Result<(), String> {
        fs::create_dir_all(&instance.sandbox_path)
            .map_err(|e| format!("Failed to create sandbox: {}", e))?;

        fs::create_dir_all(&instance.logs_path)
            .map_err(|e| format!("Failed to create logs directory: {}", e))?;

        fs::create_dir_all(&instance.data_path)
            .map_err(|e| format!("Failed to create data directory: {}", e))?;

        if let Some(parent) = instance.config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        // Create keys directory
        fs::create_dir_all(instance.sandbox_path.join("keys"))
            .map_err(|e| format!("Failed to create keys directory: {}", e))?;

        Ok(())
    }

    pub fn remove_node(&mut self, node_id: &str) -> Result<(), String> {
        let node = self.info.nodes.get(node_id).ok_or("Node not found")?;

        if node.is_running {
            return Err("Cannot remove running node. Stop it first.".to_string());
        }

        // Remove the node directory
        if node.sandbox_path.exists() {
            fs::remove_dir_all(&node.sandbox_path)
                .map_err(|e| format!("Failed to remove node directory: {}", e))?;
        }

        self.info.nodes.remove(node_id);
        self.save()?;

        Ok(())
    }

    pub fn get_node(&self, node_id: &str) -> Option<&NodeInstance> {
        self.info.nodes.get(node_id)
    }

    pub fn get_node_mut(&mut self, node_id: &str) -> Option<&mut NodeInstance> {
        self.info.nodes.get_mut(node_id)
    }

    pub fn list_nodes(&self) -> Vec<&NodeInstance> {
        self.info.nodes.values().collect()
    }

    pub fn update_node_identity(
        &mut self,
        node_id: &str,
        identity: &NodeIdentity,
    ) -> Result<(), String> {
        let node = self.info.nodes.get_mut(node_id).ok_or("Node not found")?;

        node.address = Some(identity.address.clone());
        node.public_key = Some(identity.public_key.clone());
        node.node_class = Some(identity.node_class);
        if node.display_name.trim().is_empty() {
            node.display_name = identity.address.clone();
        }

        self.save()?;

        Ok(())
    }

    pub fn set_node_operation_mode(
        &mut self,
        node_id: &str,
        mode: NodeOperationMode,
    ) -> Result<(), String> {
        let node = self.info.nodes.get_mut(node_id).ok_or("Node not found")?;
        node.operation_mode = mode;

        self.save()?;

        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn get_binary_name() -> &'static str {
    "synergy-devnet.exe"
}

#[cfg(not(target_os = "windows"))]
fn get_binary_name() -> &'static str {
    "synergy-devnet"
}

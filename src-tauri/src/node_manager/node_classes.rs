use crate::node_manager::types::NodeType;

/// Node class definitions for Synergy Network
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeClass {
    ClassI = 1,
    ClassII = 2,
    ClassIII = 3,
    ClassIV = 4,
    ClassV = 5,
}

impl NodeClass {
    /// Get the address prefix for this node class
    pub fn address_prefix(&self) -> &'static str {
        match self {
            NodeClass::ClassI => "synv1",
            NodeClass::ClassII => "synv2",
            NodeClass::ClassIII => "synv3",
            NodeClass::ClassIV => "synv4",
            NodeClass::ClassV => "synv5",
        }
    }

    /// Get the class number
    pub fn class_number(&self) -> u8 {
        *self as u8
    }

    /// Get node class from node type
    pub fn from_node_type(node_type: &NodeType) -> Self {
        match node_type {
            // Class I: Core validators and committee members
            NodeType::Validator => NodeClass::ClassI,
            NodeType::Committee => NodeClass::ClassI,

            // Class II: Archive and audit validators
            NodeType::ArchiveValidator => NodeClass::ClassII,
            NodeType::AuditValidator => NodeClass::ClassII,
            NodeType::DataAvailability => NodeClass::ClassII,

            // Class III: Relayers and cross-chain infrastructure
            NodeType::Relayer => NodeClass::ClassIII,
            NodeType::Witness => NodeClass::ClassIII,
            NodeType::Oracle => NodeClass::ClassIII,
            NodeType::UmaCoordinator => NodeClass::ClassIII,
            NodeType::CrossChainVerifier => NodeClass::ClassIII,

            // Class IV: Compute and specialized processing
            NodeType::Compute => NodeClass::ClassIV,
            NodeType::AiInference => NodeClass::ClassIV,
            NodeType::PqcCrypto => NodeClass::ClassIV,

            // Class V: Governance and RPC infrastructure
            NodeType::GovernanceAuditor => NodeClass::ClassV,
            NodeType::TreasuryController => NodeClass::ClassV,
            NodeType::SecurityCouncil => NodeClass::ClassV,
            NodeType::RpcGateway => NodeClass::ClassV,
            NodeType::Indexer => NodeClass::ClassV,
            NodeType::Observer => NodeClass::ClassV,
        }
    }

    /// Get description of this node class
    pub fn description(&self) -> &'static str {
        match self {
            NodeClass::ClassI => "Core Validators & Committee Members",
            NodeClass::ClassII => "Archive, Audit & Data Availability",
            NodeClass::ClassIII => "Relayers & Cross-Chain Infrastructure",
            NodeClass::ClassIV => "Compute & Specialized Processing",
            NodeClass::ClassV => "Governance & RPC Infrastructure",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_address_prefixes() {
        assert_eq!(NodeClass::ClassI.address_prefix(), "synv1");
        assert_eq!(NodeClass::ClassII.address_prefix(), "synv2");
        assert_eq!(NodeClass::ClassIII.address_prefix(), "synv3");
        assert_eq!(NodeClass::ClassIV.address_prefix(), "synv4");
        assert_eq!(NodeClass::ClassV.address_prefix(), "synv5");
    }

    #[test]
    fn test_node_type_mapping() {
        assert_eq!(
            NodeClass::from_node_type(&NodeType::Validator),
            NodeClass::ClassI
        );
        assert_eq!(
            NodeClass::from_node_type(&NodeType::ArchiveValidator),
            NodeClass::ClassII
        );
        assert_eq!(
            NodeClass::from_node_type(&NodeType::Relayer),
            NodeClass::ClassIII
        );
        assert_eq!(
            NodeClass::from_node_type(&NodeType::Compute),
            NodeClass::ClassIV
        );
        assert_eq!(
            NodeClass::from_node_type(&NodeType::RpcGateway),
            NodeClass::ClassV
        );
    }
}

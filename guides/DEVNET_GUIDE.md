# Synergy Devnet - Setup & Management Guide

A comprehensive guide for building and running the Synergy blockchain devnet with support for 19 different node types.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Building the Devnet](#building-the-devnet)
- [Node Types](#node-types)
- [Quick Start](#quick-start)
- [Management Commands](#management-commands)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Rust 1.70 or higher
- Cargo (comes with Rust)
- macOS, Linux, or Windows with WSL2

## Building the Devnet

### Option 1: Using the Management Script (Recommended)

```bash
./devnet.sh build
```

### Option 2: Using Cargo Directly

```bash
cargo build --release
```

The binary will be located at: `./target/release/synergy-devnet`

## Node Types

The Synergy devnet supports 19 specialized node types:

| Type | Class | Description |
|------|-------|-------------|
| validator | Class I | Core blockchain validator |
| oracle | Class II | External data provider |
| ai-inference | Class III | AI model execution node |
| archive-validator | Class I | Validator with full history |
| audit-validator | Class I | Validator with audit capabilities |
| committee | Class I | Governance committee member |
| compute | Class III | General computation node |
| cross-chain-verifier | Class II | Cross-chain bridge verifier |
| data-availability | Class II | Data availability layer |
| governance-auditor | Class I | Governance oversight |
| indexer | Class II | Blockchain indexer |
| observer | Class II | Read-only observer node |
| pqc-crypto | Class III | Post-quantum crypto operations |
| relayer | Class II | Cross-chain message relayer |
| rpc | Class II | RPC endpoint provider |
| rpc-gateway | Class II | High-capacity RPC gateway |
| security-council | Class I | Security oversight |
| treasury-controller | Class I | Treasury management |
| uma-coordinator | Class III | UMA coordination |
| witness | Class II | Event witness node |

## Quick Start

### 1. Build the Binary

```bash
./devnet.sh build
```

### 2. List Available Node Templates

```bash
./devnet.sh list
```

### 3. Start a Node

Start a validator node:

```bash
./devnet.sh start validator
```

Start an oracle node:

```bash
./devnet.sh start oracle
```

### 4. Check Node Status

```bash
./devnet.sh status
```

### 5. View Logs

View recent logs:

```bash
./devnet.sh logs
```

Follow logs in real-time:

```bash
./devnet.sh logs follow
```

### 6. Stop the Node

```bash
./devnet.sh stop
```

## Management Commands

### Using the Management Script (`devnet.sh`)

The `devnet.sh` script provides a convenient interface:

| Command | Description | Example |
|---------|-------------|---------|
| `build` | Build the devnet binary | `./devnet.sh build` |
| `start <type>` | Start a node | `./devnet.sh start validator` |
| `stop` | Stop the running node | `./devnet.sh stop` |
| `restart <type>` | Restart the node | `./devnet.sh restart oracle` |
| `status` | Check node status | `./devnet.sh status` |
| `logs [follow]` | View logs | `./devnet.sh logs` |
| `list` | List node templates | `./devnet.sh list` |
| `clean` | Clean data and logs | `./devnet.sh clean` |
| `help` | Show help message | `./devnet.sh help` |

### Using the Binary Directly

You can also use the binary directly:

```bash
# Show help
./target/release/synergy-devnet help

# Start a specific node type
./target/release/synergy-devnet start --node-type validator

# Start with custom config
./target/release/synergy-devnet start --config config/custom.toml

# List available templates
./target/release/synergy-devnet list-templates

# Generate a keypair
./target/release/synergy-devnet generate-keypair

# Check status
./target/release/synergy-devnet status

# View logs
./target/release/synergy-devnet logs --follow
./target/release/synergy-devnet logs --lines 100

# Show version
./target/release/synergy-devnet version
```

## Configuration

### Using Templates

Each node type has a pre-configured template in the `templates/` directory:

```
templates/
├── validator.toml
├── oracle.toml
├── ai-inference.toml
├── archive-validator.toml
└── ... (19 templates total)
```

To start a node with a template:

```bash
./target/release/synergy-devnet start --node-type <template-name>
```

### Custom Configuration

You can create custom configuration files based on the templates:

1. Copy a template:
```bash
cp templates/validator.toml config/my-custom-node.toml
```

2. Edit the configuration:
```bash
nano config/my-custom-node.toml
```

3. Start with custom config:
```bash
./target/release/synergy-devnet start --config config/my-custom-node.toml
```

### Environment Variables

You can override configuration values with environment variables:

```bash
export SYNERGY_LOG_LEVEL=debug
export SYNERGY_RPC_PORT=58638
export SYNERGY_P2P_PORT=30304
./target/release/synergy-devnet start --node-type validator
```

Supported environment variables:
- `SYNERGY_NETWORK_ID` - Network ID
- `SYNERGY_P2P_PORT` - P2P port
- `SYNERGY_RPC_PORT` - RPC HTTP port
- `SYNERGY_WS_PORT` - WebSocket port
- `SYNERGY_LOG_LEVEL` - Log level (debug, info, warn, error)
- `SYNERGY_LOG_FILE` - Log file path
- `SYNERGY_DATA_PATH` - Data directory path
- `SYNERGY_CONFIG_PATH` - Configuration file path

## Directory Structure

```
synergy-devnet/
├── target/
│   └── release/
│       └── synergy-devnet          # Main binary
├── templates/                       # Node configuration templates
│   ├── validator.toml
│   ├── oracle.toml
│   └── ...
├── config/                          # User configurations
│   └── node.toml                    # Default config
├── data/                            # Runtime data (created on first run)
│   ├── chain/                       # Blockchain data
│   ├── logs/                        # Log files
│   └── synergy-devnet.pid           # Process ID file
├── devnet.sh                        # Management script
└── DEVNET_GUIDE.md                  # This guide
```

## Running Multiple Nodes

To run multiple nodes simultaneously, use different ports:

### Terminal 1 - Validator Node
```bash
export SYNERGY_RPC_PORT=48638
export SYNERGY_P2P_PORT=38638
./target/release/synergy-devnet start --node-type validator
```

### Terminal 2 - Oracle Node
```bash
export SYNERGY_RPC_PORT=58638
export SYNERGY_P2P_PORT=30304
./target/release/synergy-devnet start --node-type oracle
```

### Terminal 3 - RPC Gateway
```bash
export SYNERGY_RPC_PORT=8547
export SYNERGY_P2P_PORT=30305
./target/release/synergy-devnet start --node-type rpc-gateway
```

## Troubleshooting

### Binary Not Found

**Problem**: `Error: Binary not found`

**Solution**:
```bash
cargo build --release
```

### Port Already in Use

**Problem**: `Error: Address already in use`

**Solution**: Change the port using environment variables:
```bash
export SYNERGY_RPC_PORT=58638
./devnet.sh start validator
```

### Node Won't Stop

**Problem**: Node continues running after stop command

**Solution**: Force kill the process:
```bash
pkill -9 synergy-devnet
rm -f data/synergy-devnet.pid
```

### Logs Not Found

**Problem**: Cannot view logs

**Solution**: Ensure the node has been started at least once:
```bash
mkdir -p data/logs
./devnet.sh start validator
```

### Clean Start

To completely reset the devnet:

```bash
./devnet.sh stop
./devnet.sh clean
./devnet.sh start validator
```

## Development Workflow

### 1. Make Code Changes

Edit files in `src/`

### 2. Rebuild

```bash
./devnet.sh build
```

### 3. Restart Node

```bash
./devnet.sh restart validator
```

### 4. Monitor Logs

```bash
./devnet.sh logs follow
```

## Advanced Usage

### Generate PQC Keypair

```bash
./target/release/synergy-devnet generate-keypair
```

Output format (JSON):
```bash
./target/release/synergy-devnet generate-keypair --format json
```

### Initialize Configuration Directory

```bash
./target/release/synergy-devnet init
```

### Custom Log Viewing

```bash
# View specific number of lines
./target/release/synergy-devnet logs --lines 200

# Follow logs
./target/release/synergy-devnet logs --follow

# View with grep
./devnet.sh logs | grep ERROR
```

## Network Information

- **Network Name**: synergy-devnet
- **Chain ID**: 338638
- **Default P2P Port**: 38638
- **Default RPC Port**: 48638
- **Default WS Port**: 58638
- **Consensus**: Proof of Synergy

## Support

For issues, questions, or contributions:
- GitHub Issues: [Create an issue]
- Documentation: See inline code documentation

## Version

Current Version: 0.1.0
Platform: macOS, Linux, Windows (WSL2)

---

Built with Rust and the Synergy blockchain framework.

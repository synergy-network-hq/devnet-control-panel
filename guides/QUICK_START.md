# Synergy Devnet - Quick Start

## Build & Run in 3 Steps

```bash
# 1. Build the binary
./devnet.sh build

# 2. Start a node (choose any of the 19 types)
./devnet.sh start validator

# 3. Check status
./devnet.sh status
```

## Common Commands

```bash
# List all available node types
./devnet.sh list

# Start different node types
./devnet.sh start validator      # Core validator
./devnet.sh start oracle          # Oracle node
./devnet.sh start ai-inference    # AI inference node
./devnet.sh start rpc-gateway     # RPC gateway

# View logs
./devnet.sh logs                  # View recent logs
./devnet.sh logs follow           # Follow logs in real-time

# Control nodes
./devnet.sh stop                  # Stop the node
./devnet.sh restart validator     # Restart with new type
./devnet.sh status                # Check if running

# Maintenance
./devnet.sh clean                 # Clean all data (requires confirmation)
```

## Available Node Types (19 Total)

**Class I - Validators & Governance:**
- validator
- archive-validator
- audit-validator
- committee
- governance-auditor
- security-council
- treasury-controller

**Class II - Data & Infrastructure:**
- oracle
- observer
- indexer
- data-availability
- cross-chain-verifier
- relayer
- rpc
- rpc-gateway
- witness

**Class III - Compute & AI:**
- ai-inference
- compute
- pqc-crypto
- uma-coordinator

## Binary Commands (Alternative)

```bash
# Direct binary usage
./target/release/synergy-devnet start --node-type validator
./target/release/synergy-devnet list-templates
./target/release/synergy-devnet generate-keypair
./target/release/synergy-devnet version
./target/release/synergy-devnet logs --follow
./target/release/synergy-devnet stop
```

## Default Ports

- **P2P**: 38638
- **RPC**: 48638
- **WebSocket**: 58638

## Files & Directories

- **Binary**: `./target/release/synergy-devnet`
- **Templates**: `./templates/`
- **Config**: `./config/node.toml`
- **Data**: `./data/chain/`
- **Logs**: `./data/logs/`
- **PID File**: `./data/synergy-devnet.pid`

## Troubleshooting

```bash
# If node won't stop
pkill -9 synergy-devnet
rm -f data/synergy-devnet.pid

# Clean restart
./devnet.sh stop
./devnet.sh clean
./devnet.sh start validator

# Change ports (if in use)
export SYNERGY_RPC_PORT=58638
export SYNERGY_P2P_PORT=30304
./devnet.sh start validator
```

## Running Multiple Nodes

Open multiple terminals:

```bash
# Terminal 1: Validator
export SYNERGY_RPC_PORT=48638 && export SYNERGY_P2P_PORT=38638
./target/release/synergy-devnet start --node-type validator

# Terminal 2: Oracle
export SYNERGY_RPC_PORT=58638 && export SYNERGY_P2P_PORT=30304
./target/release/synergy-devnet start --node-type oracle

# Terminal 3: RPC Gateway
export SYNERGY_RPC_PORT=8547 && export SYNERGY_P2P_PORT=30305
./target/release/synergy-devnet start --node-type rpc-gateway
```

## Next Steps

For detailed documentation, see [DEVNET_GUIDE.md](DEVNET_GUIDE.md)

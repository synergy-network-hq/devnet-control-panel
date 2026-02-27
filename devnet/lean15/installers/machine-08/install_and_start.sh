#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$BASE_DIR/node.env"

BIN_LINUX="$BASE_DIR/bin/synergy-devnet-linux-amd64"
BIN_DARWIN="$BASE_DIR/bin/synergy-devnet-darwin-arm64"
BIN_SELECTED=""
DATA_DIR="$BASE_DIR/data"
CHAIN_DIR="$DATA_DIR/chain"
LOG_DIR="$DATA_DIR/logs"
PID_FILE="$DATA_DIR/node.pid"
OUT_FILE="$LOG_DIR/node.out"
NETWORK_TRANSPORT="${NETWORK_TRANSPORT:-wireguard}"
WIREGUARD_INTERFACE="${WIREGUARD_INTERFACE:-wg0}"
VPN_CIDR="${VPN_CIDR:-10.50.0.0/24}"

select_binary() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  if [[ "$os" == "Linux" && "$arch" == "x86_64" ]]; then
    BIN_SELECTED="$BIN_LINUX"
  elif [[ "$os" == "Darwin" && "$arch" == "arm64" ]]; then
    BIN_SELECTED="$BIN_DARWIN"
  else
    echo "Unsupported platform for this script: ${os}/${arch}" >&2
    echo "For Windows, use install_and_start.ps1" >&2
    exit 1
  fi

  chmod +x "$BIN_SELECTED"
}

run_privileged() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Privilege escalation unavailable for: $*" >&2
    return 1
  fi
}

open_ports_ufw() {
  if [[ "$NETWORK_TRANSPORT" == "wireguard" ]]; then
    for port in "$P2P_PORT" "$RPC_PORT" "$WS_PORT" "$GRPC_PORT" "$DISCOVERY_PORT"; do
      run_privileged ufw allow in on "$WIREGUARD_INTERFACE" from "$VPN_CIDR" to any port "$port" proto tcp >/dev/null || true
    done
    return
  fi

  for port in "$P2P_PORT" "$RPC_PORT" "$WS_PORT" "$GRPC_PORT" "$DISCOVERY_PORT"; do
    run_privileged ufw allow "${port}/tcp" >/dev/null || true
  done
}

open_ports_firewalld() {
  if [[ "$NETWORK_TRANSPORT" == "wireguard" ]]; then
    for port in "$P2P_PORT" "$RPC_PORT" "$WS_PORT" "$GRPC_PORT" "$DISCOVERY_PORT"; do
      run_privileged firewall-cmd --permanent --add-rich-rule="rule family='ipv4' source address='${VPN_CIDR}' port protocol='tcp' port='${port}' accept" >/dev/null || true
    done
    run_privileged firewall-cmd --reload >/dev/null || true
    return
  fi

  for port in "$P2P_PORT" "$RPC_PORT" "$WS_PORT" "$GRPC_PORT" "$DISCOVERY_PORT"; do
    run_privileged firewall-cmd --permanent --add-port="${port}/tcp" >/dev/null || true
  done
  run_privileged firewall-cmd --reload >/dev/null || true
}

open_ports_iptables() {
  if [[ "$NETWORK_TRANSPORT" == "wireguard" ]]; then
    for port in "$P2P_PORT" "$RPC_PORT" "$WS_PORT" "$GRPC_PORT" "$DISCOVERY_PORT"; do
      if ! run_privileged iptables -C INPUT -i "$WIREGUARD_INTERFACE" -s "$VPN_CIDR" -p tcp --dport "$port" -j ACCEPT >/dev/null 2>&1; then
        run_privileged iptables -I INPUT -i "$WIREGUARD_INTERFACE" -s "$VPN_CIDR" -p tcp --dport "$port" -j ACCEPT >/dev/null || true
      fi
    done
    return
  fi

  for port in "$P2P_PORT" "$RPC_PORT" "$WS_PORT" "$GRPC_PORT" "$DISCOVERY_PORT"; do
    if ! run_privileged iptables -C INPUT -p tcp --dport "$port" -j ACCEPT >/dev/null 2>&1; then
      run_privileged iptables -I INPUT -p tcp --dport "$port" -j ACCEPT >/dev/null || true
    fi
  done
}

open_ports() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "Non-Linux host detected; skipping firewall automation."
    return
  fi

  if [[ "$NETWORK_TRANSPORT" == "wireguard" ]]; then
    echo "WireGuard mode: allowing node ports only from $VPN_CIDR on interface $WIREGUARD_INTERFACE..."
  fi

  if command -v ufw >/dev/null 2>&1; then
    echo "Opening ports via ufw..."
    open_ports_ufw
  elif command -v firewall-cmd >/dev/null 2>&1; then
    echo "Opening ports via firewalld..."
    open_ports_firewalld
  elif command -v iptables >/dev/null 2>&1; then
    echo "Opening ports via iptables..."
    open_ports_iptables
  else
    echo "No supported firewall tool detected. Open these TCP ports manually:"
    echo "$P2P_PORT, $RPC_PORT, $WS_PORT, $GRPC_PORT, $DISCOVERY_PORT"
  fi
}

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

start_node() {
  if is_running; then
    echo "$MACHINE_ID already running (PID $(cat "$PID_FILE"))"
    return
  fi

  mkdir -p "$CHAIN_DIR" "$LOG_DIR"

  local validator_address
  validator_address="${SYNERGY_VALIDATOR_ADDRESS:-${NODE_ADDRESS:-}}"
  local auto_register_validator
  auto_register_validator="${SYNERGY_AUTO_REGISTER_VALIDATOR:-${AUTO_REGISTER_VALIDATOR:-false}}"
  local strict_allowlist
  strict_allowlist="${SYNERGY_STRICT_VALIDATOR_ALLOWLIST:-${STRICT_VALIDATOR_ALLOWLIST:-true}}"
  local allowed_validators
  allowed_validators="${SYNERGY_ALLOWED_VALIDATOR_ADDRESSES:-${ALLOWED_VALIDATOR_ADDRESSES:-}}"
  local rpc_bind_address
  rpc_bind_address="${SYNERGY_RPC_BIND_ADDRESS:-${RPC_BIND_ADDRESS:-}}"
  if [[ -z "$validator_address" ]]; then
    echo "Warning: NODE_ADDRESS is empty; validator identity will fallback to node_name."
  fi

  nohup env \
    SYNERGY_VALIDATOR_ADDRESS="$validator_address" \
    NODE_ADDRESS="$validator_address" \
    SYNERGY_AUTO_REGISTER_VALIDATOR="$auto_register_validator" \
    SYNERGY_STRICT_VALIDATOR_ALLOWLIST="$strict_allowlist" \
    SYNERGY_ALLOWED_VALIDATOR_ADDRESSES="$allowed_validators" \
    SYNERGY_RPC_BIND_ADDRESS="$rpc_bind_address" \
    "$BIN_SELECTED" start --config "$BASE_DIR/config/node.toml" > "$OUT_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  echo "Started $MACHINE_ID ($NODE_TYPE) PID $(cat "$PID_FILE")"
  echo "Logs: $OUT_FILE"
}

select_binary
open_ports
start_node

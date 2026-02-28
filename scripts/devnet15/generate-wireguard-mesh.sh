#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY_FILE="$ROOT_DIR/devnet/lean15/node-inventory.csv"
HOSTS_ENV_FILE="${SYNERGY_MONITOR_HOSTS_ENV:-$ROOT_DIR/devnet/lean15/hosts.env}"
OUT_DIR="${1:-$ROOT_DIR/devnet/lean15/wireguard}"
KEYS_DIR="$OUT_DIR/keys"
CONFIGS_DIR="$OUT_DIR/configs"
PORT_BASE="${WIREGUARD_PORT_BASE:-51820}"

usage() {
  cat <<USAGE
Usage: $0 [output-dir]

Generates full-mesh WireGuard configs for all machines in:
- devnet/lean15/node-inventory.csv

Environment:
- WIREGUARD_PORT_BASE (default: 51820)
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -f "$INVENTORY_FILE" ]]; then
  echo "Missing inventory file: $INVENTORY_FILE" >&2
  exit 1
fi

if [[ -f "$HOSTS_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$HOSTS_ENV_FILE"
fi

if ! command -v wg >/dev/null 2>&1; then
  echo "WireGuard tooling not found. Install 'wg' first." >&2
  exit 1
fi

mkdir -p "$KEYS_DIR" "$CONFIGS_DIR"

resolve_var() {
  local name="$1"
  printf '%s' "${!name:-}"
}

machines=()
vpn_ips=()
hosts=()
listen_ports=()

index=0
while IFS=, read -r machine_id _ _ _ _ _ _ _ _ _ _ host vpn_ip _ _ _ || [[ -n "${machine_id:-}" ]]; do
  [[ "$machine_id" == "machine_id" ]] && continue
  if [[ -z "$machine_id" || -z "$vpn_ip" ]]; then
    continue
  fi

  machine_id="${machine_id//$'\r'/}"
  host="${host//$'\r'/}"
  vpn_ip="${vpn_ip//$'\r'/}"

  machine_key="$(printf '%s' "$machine_id" | tr '[:lower:]-' '[:upper:]_')"
  host_override_var="${machine_key}_HOST"
  host_override="$(resolve_var "$host_override_var")"
  if [[ -n "$host_override" ]]; then
    host="$host_override"
  fi
  if [[ -z "$host" ]]; then
    host="$vpn_ip"
  fi

  machines+=("$machine_id")
  vpn_ips+=("$vpn_ip")
  hosts+=("$host")
  listen_ports+=("$((PORT_BASE + index))")
  index=$((index + 1))
done < "$INVENTORY_FILE"

for machine_id in "${machines[@]}"; do
  key_dir="$KEYS_DIR/$machine_id"
  mkdir -p "$key_dir"
  private_key_file="$key_dir/privatekey"
  public_key_file="$key_dir/publickey"

  if [[ ! -f "$private_key_file" || ! -f "$public_key_file" ]]; then
    private_key="$(wg genkey)"
    public_key="$(printf '%s' "$private_key" | wg pubkey)"
    printf '%s\n' "$private_key" > "$private_key_file"
    printf '%s\n' "$public_key" > "$public_key_file"
    chmod 600 "$private_key_file" "$public_key_file"
  fi
done

for i in "${!machines[@]}"; do
  machine_id="${machines[$i]}"
  machine_vpn_ip="${vpn_ips[$i]}"
  machine_listen_port="${listen_ports[$i]}"
  machine_private_key="$(cat "$KEYS_DIR/$machine_id/privatekey")"

  conf_file="$CONFIGS_DIR/$machine_id.conf"
  {
    echo "[Interface]"
    echo "PrivateKey = $machine_private_key"
    echo "Address = ${machine_vpn_ip}/32"
    echo "ListenPort = $machine_listen_port"
    echo ""
  } > "$conf_file"

  for j in "${!machines[@]}"; do
    if [[ "$i" == "$j" ]]; then
      continue
    fi
    peer_machine="${machines[$j]}"
    peer_vpn_ip="${vpn_ips[$j]}"
    peer_host="${hosts[$j]}"
    peer_port="${listen_ports[$j]}"
    peer_public_key="$(cat "$KEYS_DIR/$peer_machine/publickey")"

    {
      echo "[Peer]"
      echo "PublicKey = $peer_public_key"
      echo "AllowedIPs = ${peer_vpn_ip}/32"
      echo "Endpoint = ${peer_host}:${peer_port}"
      echo "PersistentKeepalive = 25"
      echo ""
    } >> "$conf_file"
  done

  echo "Generated WireGuard config: $conf_file"
done

echo "WireGuard mesh artifacts written to: $OUT_DIR"

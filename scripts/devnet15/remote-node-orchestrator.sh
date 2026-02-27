#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY_FILE="$ROOT_DIR/devnet/lean15/node-inventory.csv"
HOSTS_ENV_FILE="${SYNERGY_MONITOR_HOSTS_ENV:-$ROOT_DIR/devnet/lean15/hosts.env}"
INSTALLERS_DIR="$ROOT_DIR/devnet/lean15/installers"
WIREGUARD_CONFIGS_DIR="${SYNERGY_WIREGUARD_CONFIGS_DIR:-$ROOT_DIR/devnet/lean15/wireguard/configs}"
REMOTE_ROOT_DEFAULT="${SYNERGY_REMOTE_ROOT:-/opt/synergy}"
REMOTE_EXPORTS_DIR="$ROOT_DIR/devnet/lean15/reports/remote-exports"

usage() {
  cat <<USAGE
Usage: $0 <machine-id> <operation>

Operations:
  install_node          Copy installer bundle to remote machine
  setup_node            Deploy installer bundle and run install_and_start.sh
  bootstrap_node        install_node + wireguard_install + wireguard_connect + start
  start                 nodectl start
  stop                  nodectl stop
  restart               nodectl restart
  status                nodectl status
  logs                  tail nodectl logs (last 120 lines)
  export_logs           Download logs archive from remote machine to local reports dir
  view_chain_data       Show chain data size and top files on remote machine
  export_chain_data     Download chain data archive from remote machine to local reports dir
  wireguard_install     Install wireguard tooling on remote machine (best-effort)
  wireguard_connect     Upload WireGuard config and bring tunnel up
  wireguard_disconnect  Bring tunnel down
  wireguard_status      Show wireguard tunnel status
  wireguard_restart     Reapply WireGuard config (down/up)
  info                  Print resolved host/ssh/paths for this machine

Required local files:
  - devnet/lean15/node-inventory.csv
  - devnet/lean15/hosts.env
  - devnet/lean15/installers/<machine-id>/

WireGuard operation requires:
  - devnet/lean15/wireguard/configs/<machine-id>.conf
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  usage
  exit $(( $# < 2 ? 1 : 0 ))
fi

MACHINE_ID="$1"
OPERATION="$2"
MACHINE_KEY_UPPER="$(printf '%s' "$MACHINE_ID" | tr '[:lower:]-' '[:upper:]_')"

if [[ ! -f "$INVENTORY_FILE" ]]; then
  echo "Inventory file missing: $INVENTORY_FILE" >&2
  exit 1
fi

if [[ -f "$HOSTS_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$HOSTS_ENV_FILE"
else
  echo "Warning: hosts.env not found at $HOSTS_ENV_FILE. Falling back to inventory/default SSH settings." >&2
fi

inventory_host() {
  awk -F, -v machine="$MACHINE_ID" 'NR>1 && tolower($1)==tolower(machine){print $12; exit}' "$INVENTORY_FILE"
}

inventory_vpn_ip() {
  awk -F, -v machine="$MACHINE_ID" 'NR>1 && tolower($1)==tolower(machine){print $13; exit}' "$INVENTORY_FILE"
}

resolve_var() {
  local name="$1"
  printf '%s' "${!name:-}"
}

HOST_VAR="${MACHINE_KEY_UPPER}_HOST"
VPN_VAR="${MACHINE_KEY_UPPER}_VPN_IP"
SSH_USER_VAR="${MACHINE_KEY_UPPER}_SSH_USER"
SSH_PORT_VAR="${MACHINE_KEY_UPPER}_SSH_PORT"
SSH_KEY_VAR="${MACHINE_KEY_UPPER}_SSH_KEY"
REMOTE_DIR_VAR="${MACHINE_KEY_UPPER}_REMOTE_DIR"
WG_INTERFACE_VAR="${MACHINE_KEY_UPPER}_WG_INTERFACE"
WG_REMOTE_CONF_VAR="${MACHINE_KEY_UPPER}_WG_REMOTE_CONF"

HOST="$(resolve_var "$HOST_VAR")"
if [[ -z "$HOST" ]]; then
  HOST="$(inventory_host)"
fi
VPN_IP="$(resolve_var "$VPN_VAR")"
if [[ -z "$VPN_IP" ]]; then
  VPN_IP="$(inventory_vpn_ip)"
fi

SSH_USER="$(resolve_var "$SSH_USER_VAR")"
if [[ -z "$SSH_USER" ]]; then
  SSH_USER="${SYNERGY_DEVNET_SSH_USER:-ops}"
fi

SSH_PORT="$(resolve_var "$SSH_PORT_VAR")"
if [[ -z "$SSH_PORT" ]]; then
  SSH_PORT="${SYNERGY_DEVNET_SSH_PORT:-22}"
fi

SSH_KEY="$(resolve_var "$SSH_KEY_VAR")"
if [[ -z "$SSH_KEY" ]]; then
  SSH_KEY="${SYNERGY_DEVNET_SSH_KEY:-}"
fi
REMOTE_NODE_DIR="$(resolve_var "$REMOTE_DIR_VAR")"
if [[ -z "$REMOTE_NODE_DIR" ]]; then
  REMOTE_NODE_DIR="$REMOTE_ROOT_DEFAULT/$MACHINE_ID"
fi

WG_INTERFACE="$(resolve_var "$WG_INTERFACE_VAR")"
if [[ -z "$WG_INTERFACE" ]]; then
  WG_INTERFACE="synergy-devnet"
fi

WG_REMOTE_CONF="$(resolve_var "$WG_REMOTE_CONF_VAR")"
if [[ -z "$WG_REMOTE_CONF" ]]; then
  WG_REMOTE_CONF="/etc/wireguard/${WG_INTERFACE}.conf"
fi

if [[ -z "$HOST" ]]; then
  echo "Unable to resolve host for $MACHINE_ID from hosts.env or inventory." >&2
  exit 1
fi

SSH_ARGS=( -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p "$SSH_PORT" )
SCP_ARGS=( -o BatchMode=yes -o StrictHostKeyChecking=accept-new -P "$SSH_PORT" )

if [[ -n "$SSH_KEY" ]]; then
  SSH_ARGS+=( -i "$SSH_KEY" )
  SCP_ARGS+=( -i "$SSH_KEY" )
fi

REMOTE_TARGET="${SSH_USER}@${HOST}"
INSTALLER_DIR="$INSTALLERS_DIR/$MACHINE_ID"
WG_CONFIG_FILE="$WIREGUARD_CONFIGS_DIR/$MACHINE_ID.conf"

remote_run_script() {
  local script="$1"
  ssh "${SSH_ARGS[@]}" "$REMOTE_TARGET" "bash -s" <<<"$script"
}

copy_to_remote() {
  local local_path="$1"
  local remote_path="$2"
  scp "${SCP_ARGS[@]}" "$local_path" "${REMOTE_TARGET}:$remote_path"
}

copy_from_remote() {
  local remote_path="$1"
  local local_path="$2"
  scp "${SCP_ARGS[@]}" "${REMOTE_TARGET}:$remote_path" "$local_path"
}

deploy_installer_bundle() {
  if [[ ! -d "$INSTALLER_DIR" ]]; then
    echo "Installer directory missing: $INSTALLER_DIR" >&2
    exit 1
  fi

  local archive
  archive="$(mktemp "/tmp/${MACHINE_ID}-installer.XXXXXX.tgz")"
  tar -C "$INSTALLER_DIR" -czf "$archive" .

  local remote_archive
  remote_archive="/tmp/${MACHINE_ID}-installer.tgz"
  copy_to_remote "$archive" "$remote_archive"
  rm -f "$archive"

  remote_run_script "
set -euo pipefail
mkdir -p '$REMOTE_NODE_DIR'
tar -xzf '$remote_archive' -C '$REMOTE_NODE_DIR'
rm -f '$remote_archive'
chmod +x '$REMOTE_NODE_DIR/install_and_start.sh' '$REMOTE_NODE_DIR/nodectl.sh' || true
echo 'Installer deployed to $REMOTE_NODE_DIR'
"
}

run_nodectl() {
  local command="$1"
  remote_run_script "
set -euo pipefail
if [[ ! -x '$REMOTE_NODE_DIR/nodectl.sh' ]]; then
  echo 'nodectl.sh not found in $REMOTE_NODE_DIR. Run install_node or setup_node first.' >&2
  exit 1
fi
cd '$REMOTE_NODE_DIR'
./nodectl.sh $command
"
}

wireguard_install() {
  remote_run_script "
set -euo pipefail
if command -v wg >/dev/null 2>&1 && command -v wg-quick >/dev/null 2>&1; then
  echo 'WireGuard tools already installed.'
  exit 0
fi
if command -v apt-get >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then sudo apt-get update -y && sudo apt-get install -y wireguard wireguard-tools; else apt-get update -y && apt-get install -y wireguard wireguard-tools; fi
elif command -v dnf >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then sudo dnf install -y wireguard-tools; else dnf install -y wireguard-tools; fi
elif command -v yum >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then sudo yum install -y wireguard-tools; else yum install -y wireguard-tools; fi
elif command -v pacman >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then sudo pacman -Sy --noconfirm wireguard-tools; else pacman -Sy --noconfirm wireguard-tools; fi
elif command -v brew >/dev/null 2>&1; then
  brew list wireguard-tools >/dev/null 2>&1 || brew install wireguard-tools
else
  echo 'Unable to install wireguard-tools automatically (unsupported package manager).' >&2
  exit 1
fi
"
}

wireguard_connect() {
  if [[ ! -f "$WG_CONFIG_FILE" ]]; then
    echo "WireGuard config missing: $WG_CONFIG_FILE" >&2
    echo "Run scripts/devnet15/generate-wireguard-mesh.sh first." >&2
    exit 1
  fi

  local remote_tmp_conf
  remote_tmp_conf="/tmp/${MACHINE_ID}-${WG_INTERFACE}.conf"
  copy_to_remote "$WG_CONFIG_FILE" "$remote_tmp_conf"

  remote_run_script "
set -euo pipefail
if ! command -v wg-quick >/dev/null 2>&1; then
  echo 'wg-quick is not available. Run wireguard_install first.' >&2
  exit 1
fi
if command -v sudo >/dev/null 2>&1; then
  sudo mkdir -p /etc/wireguard
  sudo install -m 600 '$remote_tmp_conf' '$WG_REMOTE_CONF'
  sudo wg-quick down '$WG_INTERFACE' >/dev/null 2>&1 || true
  sudo wg-quick up '$WG_INTERFACE'
  sudo wg show '$WG_INTERFACE' || true
else
  mkdir -p /etc/wireguard
  install -m 600 '$remote_tmp_conf' '$WG_REMOTE_CONF'
  wg-quick down '$WG_INTERFACE' >/dev/null 2>&1 || true
  wg-quick up '$WG_INTERFACE'
  wg show '$WG_INTERFACE' || true
fi
rm -f '$remote_tmp_conf'
"
}

wireguard_disconnect() {
  remote_run_script "
set -euo pipefail
if command -v sudo >/dev/null 2>&1; then
  sudo wg-quick down '$WG_INTERFACE' >/dev/null 2>&1 || true
else
  wg-quick down '$WG_INTERFACE' >/dev/null 2>&1 || true
fi
echo 'WireGuard interface $WG_INTERFACE is down.'
"
}

wireguard_status() {
  remote_run_script "
set -euo pipefail
if command -v sudo >/dev/null 2>&1; then
  sudo wg show '$WG_INTERFACE' || true
else
  wg show '$WG_INTERFACE' || true
fi
"
}

export_logs() {
  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  local remote_archive
  remote_archive="/tmp/${MACHINE_ID}-logs-${ts}.tgz"

  remote_run_script "
set -euo pipefail
if [[ ! -d '$REMOTE_NODE_DIR/data/logs' ]]; then
  echo 'Remote logs directory not found: $REMOTE_NODE_DIR/data/logs' >&2
  exit 1
fi
tar -C '$REMOTE_NODE_DIR' -czf '$remote_archive' data/logs
echo '$remote_archive'
"

  local local_dir
  local_dir="$REMOTE_EXPORTS_DIR/$MACHINE_ID"
  mkdir -p "$local_dir"
  local local_archive
  local_archive="$local_dir/${MACHINE_ID}-logs-${ts}.tgz"

  copy_from_remote "$remote_archive" "$local_archive"
  remote_run_script "rm -f '$remote_archive'"

  echo "Exported logs to $local_archive"
}

view_chain_data() {
  remote_run_script "
set -euo pipefail
if [[ ! -d '$REMOTE_NODE_DIR/data/chain' ]]; then
  echo 'Remote chain directory not found: $REMOTE_NODE_DIR/data/chain' >&2
  exit 1
fi
du -sh '$REMOTE_NODE_DIR/data/chain'
ls -lah '$REMOTE_NODE_DIR/data/chain' | head -40
"
}

export_chain_data() {
  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  local remote_archive
  remote_archive="/tmp/${MACHINE_ID}-chain-${ts}.tgz"

  remote_run_script "
set -euo pipefail
if [[ ! -d '$REMOTE_NODE_DIR/data/chain' ]]; then
  echo 'Remote chain directory not found: $REMOTE_NODE_DIR/data/chain' >&2
  exit 1
fi
tar -C '$REMOTE_NODE_DIR' -czf '$remote_archive' data/chain
echo '$remote_archive'
"

  local local_dir
  local_dir="$REMOTE_EXPORTS_DIR/$MACHINE_ID"
  mkdir -p "$local_dir"
  local local_archive
  local_archive="$local_dir/${MACHINE_ID}-chain-${ts}.tgz"

  copy_from_remote "$remote_archive" "$local_archive"
  remote_run_script "rm -f '$remote_archive'"

  echo "Exported chain data to $local_archive"
}

show_info() {
  cat <<INFO
Machine:            $MACHINE_ID
Host:               $HOST
VPN IP:             ${VPN_IP:-unknown}
SSH user:           $SSH_USER
SSH port:           $SSH_PORT
SSH key:            ${SSH_KEY:-default-agent}
Remote node dir:    $REMOTE_NODE_DIR
WireGuard iface:    $WG_INTERFACE
WireGuard conf dst: $WG_REMOTE_CONF
Installer source:   $INSTALLER_DIR
WireGuard source:   $WG_CONFIG_FILE
INFO
}

case "$OPERATION" in
  install_node)
    deploy_installer_bundle
    ;;
  setup_node)
    deploy_installer_bundle
    remote_run_script "set -euo pipefail; cd '$REMOTE_NODE_DIR'; ./install_and_start.sh"
    ;;
  bootstrap_node)
    deploy_installer_bundle
    wireguard_install
    wireguard_connect
    run_nodectl "start"
    ;;
  start)
    run_nodectl "start"
    ;;
  stop)
    run_nodectl "stop"
    ;;
  restart)
    run_nodectl "restart"
    ;;
  status)
    run_nodectl "status"
    ;;
  logs)
    run_nodectl "logs"
    ;;
  export_logs)
    export_logs
    ;;
  view_chain_data)
    view_chain_data
    ;;
  export_chain_data)
    export_chain_data
    ;;
  wireguard_install)
    wireguard_install
    ;;
  wireguard_connect)
    wireguard_connect
    ;;
  wireguard_disconnect)
    wireguard_disconnect
    ;;
  wireguard_status)
    wireguard_status
    ;;
  wireguard_restart)
    wireguard_disconnect
    wireguard_connect
    ;;
  info)
    show_info
    ;;
  *)
    echo "Unsupported operation: $OPERATION" >&2
    usage
    exit 1
    ;;
esac

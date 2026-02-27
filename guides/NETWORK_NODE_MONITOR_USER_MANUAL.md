# Synergy Network Node Monitor User Manual

Version: 2026-02-27
Applies to: `tools/devnet-control-panel`

## Table of Contents

1. Purpose
2. What the App Does
3. Installation
4. First Run and Workspace Initialization
5. Required Infrastructure Prerequisites
6. App Navigation
7. Node Operations (Single Node)
8. Fleet Operations (Bulk)
9. SSH Profiles and Machine Binding
10. WireGuard Provisioning Workflow
11. Atlas Explorer Integration
12. Atlas Deployment (nginx + PM2)
13. RBAC and Audit Logging
14. Exports and Reports
15. Troubleshooting
16. Operational Checklist
17. Current Limitations

---

## 1. Purpose

The Network Node Monitor app is the operator console for your closed devnet. It is used to:
- initialize and monitor node infrastructure,
- run node lifecycle operations,
- perform role-aware diagnostics,
- manage remote execution settings,
- operate fleet-wide actions,
- validate state against Atlas explorer endpoints.

---

## 2. What the App Does

The app supports:
- Per-node controls: `start`, `stop`, `restart`, `status`, `setup`, `export_logs`, `view_chain_data`, `export_chain_data`.
- Custom machine actions from hosts configuration and orchestrator defaults.
- Role-specific RPC diagnostics:
  - Runtime: node/sync/peer status
  - Consensus/Governance: validator activity, validator set, determinism digest
  - Interop/SXCP: SXCP status, relayer set, relayer health, attestations
  - Services: network stats, wallet inventory, latest block
- Atlas deep links for block/tx/wallet/contract verification.
- Bulk operations by scope (`all`, role group, role substring, single machine).

---

## 3. Installation

### macOS bundle artifacts

Current build outputs:
- `.app`: `tools/devnet-control-panel/src-tauri/target/release/bundle/macos/Synergy Node Monitor.app`
- `.dmg`: `tools/devnet-control-panel/src-tauri/target/release/bundle/dmg/Synergy Node Monitor_1.0.0_aarch64.dmg`

### Build command

```bash
cd tools/devnet-control-panel
npm run tauri:build -- --bundles app,dmg
```

---

## 4. First Run and Workspace Initialization

On launch, the app initializes a writable workspace and copies bundled read-only resources into it.

Initialized content includes:
- `devnet/lean15/node-inventory.csv`
- `devnet/lean15/hosts.env.example`
- `devnet/lean15/configs`
- `devnet/lean15/installers`
- `devnet/lean15/wireguard`
- `scripts/devnet15`
- `scripts/reset-devnet.sh`

If `hosts.env` is missing, it is auto-created from `hosts.env.example`.

Workspace also stores security and audit data:
- `config/security.json`
- `audit/control-actions.jsonl`

---

## 5. Required Infrastructure Prerequisites

Before operating remote nodes, ensure:
- Inventory exists and matches target machines.
- SSH access from monitor host to all machines (key-based recommended).
- Installer artifacts exist per machine:
  - `devnet/lean15/installers/<machine-id>/`
- WireGuard configs exist per machine:
  - `devnet/lean15/wireguard/configs/<machine-id>.conf`

Recommended helper generation:

```bash
./scripts/devnet15/generate-wireguard-mesh.sh
./scripts/devnet15/generate-monitor-hosts-env.sh
```

---

## 6. App Navigation

### Dashboard (`/`)

Shows:
- total/online/offline/syncing node counts,
- highest network block,
- inventory path,
- per-node matrix.

Includes operations panels:
- Operator Access (RBAC)
- SSH Profiles + Machine Binding
- Fleet Bulk Actions

### Node Detail (`/node/:machineId`)

Shows:
- node runtime status,
- role diagnostics,
- role execution checks,
- RPC diagnostics payloads,
- Atlas Explorer Bridge links,
- node action controls and result output.

### Help (`/help`)

Accessible through the header Help button. Opens a second Tauri window (`help-articles-window`) with setup/troubleshooting guides.

---

## 7. Node Operations (Single Node)

Single-node control is available from each node page.

Core actions:
- `start`
- `stop`
- `restart`
- `status`
- `setup`
- `export_logs`
- `view_chain_data`
- `export_chain_data`

Custom actions may also appear (for example):
- `install_node`
- `bootstrap_node`
- `wireguard_install`
- `wireguard_connect`
- `wireguard_disconnect`
- `wireguard_status`
- `wireguard_restart`
- `node_logs`

Action output and exit status are shown inline.

---

## 8. Fleet Operations (Bulk)

Bulk controls are available on the dashboard.

### Action selection
Examples:
- `status`, `start`, `stop`, `restart`
- `wireguard_status`, `wireguard_connect`, `wireguard_disconnect`, `wireguard_restart`
- `rpc:get_node_status`, `rpc:get_sync_status`, `rpc:get_peer_info`

### Scope selection
Supported scopes:
- `all`
- `role_group:<group>`
- `role:<substring>`
- single node/machine id

Bulk execution returns:
- requested node count,
- success/failure counts,
- per-node result summary.

---

## 9. SSH Profiles and Machine Binding

SSH control parameters are managed in-app and persisted in `config/security.json`.

### SSH Profile fields
- `profile_id`
- `label`
- `ssh_user`
- `ssh_port`
- `ssh_key_path` (path reference)
- `remote_root`

### Machine binding
Maps `machine_id -> profile_id` with optional overrides:
- `host_override`
- `remote_dir_override`

During action execution, bindings are applied as environment overrides for the orchestrator path.

---

## 10. WireGuard Provisioning Workflow

Recommended per-machine sequence:
1. `wireguard_install`
2. `wireguard_connect`
3. `install_node` or `setup`
4. `start`
5. `status`

Then verify convergence in dashboard and node diagnostics.

---

## 11. Atlas Explorer Integration

Node Monitor Atlas bridge uses:
1. `ATLAS_BASE_URL` in `devnet/lean15/hosts.env` (preferred)
2. `EXPLORER_URL` in `hosts.env` (fallback)
3. `SYNERGY_ATLAS_BASE_URL` or `SYNERGY_EXPLORER_ENDPOINT` env vars

Recommended setting:

```bash
ATLAS_BASE_URL=https://devnet-explorer.synergy-network.io
```

Atlas deep links target hash routes used by Atlas UI:
- `#/transactions`
- `#/wallet`
- `#/contracts`
- `#/block/:id`
- `#/tx/:hash`
- `#/address/:address`

---

## 12. Atlas Deployment (nginx + PM2)

Atlas deployment assets are in:
- `/Users/devpup/Desktop/devnet-explorer-app/ops/nginx/devnet-explorer.conf`
- `/Users/devpup/Desktop/devnet-explorer-app/ops/pm2/ecosystem.devnet.cjs`
- `/Users/devpup/Desktop/devnet-explorer-app/ops/scripts/deploy-devnet-atlas.sh`

### Deployment outline

```bash
cd /opt/synergy/devnet-explorer-app
cp ops/env/backend.env.production.example backend/.env
cp ops/env/indexer.env.production.example indexer/.env
# edit env files
ops/scripts/deploy-devnet-atlas.sh
```

### Validate

```bash
pm2 status
curl -fsS https://devnet-explorer-api.synergy-network.io/healthz
curl -fsS https://devnet-explorer-api.synergy-network.io/readyz
curl -fsS https://devnet-explorer-api.synergy-network.io/api/v1/network/summary
curl -I https://devnet-explorer.synergy-network.io
```

---

## 13. RBAC and Audit Logging

### Roles
- `admin`: full control, can manage operators and SSH profiles/bindings
- `operator`: control actions and bulk actions (restricted from admin-only mutation actions)
- `viewer`: read-only

### Operator management
In-app controls support:
- set active operator,
- add/update/delete operators,
- role assignment.

### Audit log
Every control/security change is appended to:
- `<workspace>/audit/control-actions.jsonl`

Captured event types include:
- single control executed/denied,
- bulk control completed/denied,
- operator/profile/binding changes.

---

## 14. Exports and Reports

### Node snapshot export
Node page action exports detailed diagnostic JSON payloads to:
- `devnet/lean15/reports/node-monitor-exports/`

Payload includes:
- status,
- role diagnostics,
- execution checks,
- RPC diagnostics,
- control capabilities,
- Atlas links.

### Remote artifacts
Orchestrator export actions place downloaded artifacts under:
- `devnet/lean15/reports/remote-exports/<machine-id>/`

---

## 15. Troubleshooting

### Inventory cannot be resolved
- Ensure workspace initialization completed.
- Confirm `node-inventory.csv` exists in workspace `devnet/lean15`.
- Set `SYNERGY_MONITOR_INVENTORY` explicitly if needed.

### Node actions fail immediately
- Verify SSH access from monitor host.
- Check selected operator role permissions.
- Verify machine SSH binding/profile values.
- Confirm installer and wireguard config files exist for target machine.

### WireGuard actions fail
- Ensure remote machine has privileges for WireGuard commands.
- Validate generated config file for that machine.
- Check `wg`/`wg-quick` availability remotely.

### Atlas links open but no data
- Confirm Atlas API and indexer are healthy.
- Confirm Atlas points at current devnet RPC endpoints.
- Verify `ATLAS_BASE_URL` setting and hash-route URL contract.

---

## 16. Operational Checklist

1. Initialize workspace on each operator machine.
2. Confirm operator and role assignments.
3. Configure SSH profiles and machine bindings.
4. Validate `wireguard_status` on all nodes.
5. Run `status` + role-specific `rpc:*` on all nodes.
6. Execute at least one role-group bulk action.
7. Export one node snapshot and one remote log archive.
8. Validate Atlas links against live node state.
9. Confirm audit log entries for all critical actions.

---

## 17. Current Limitations

1. Operator authentication is local session/operator selection (not password-backed auth).
2. SSH keys are referenced by filesystem path (no encrypted key vault in-app yet).
3. Bulk actions run sequentially by default.

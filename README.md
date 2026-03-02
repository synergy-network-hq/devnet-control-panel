# Synergy Node Monitor Panel

This app is a dedicated monitoring-only fork of the Synergy control panel.

It reads your 15-node inventory (`node-inventory.csv`) and continuously probes each node's RPC endpoint to display:

- online/offline/syncing status
- block height
- peer count
- RPC response latency
- per-node error details

No setup wizard, no node start/stop controls, no write-side actions.

## Run (Desktop Dev)

From this directory:

```bash
npm install
npm run tauri:dev
```

## Build App Bundle

```bash
npm run tauri:build
```

## Inventory Resolution

The monitor resolves the inventory file in this order:

1. `SYNERGY_MONITOR_INVENTORY` environment variable (absolute path recommended)
2. relative project paths (for repo-local development)
3. bundled/local fallback path under `devnet/lean15/node-inventory.csv`

### Recommended explicit override

```bash
export SYNERGY_MONITOR_INVENTORY="/absolute/path/to/synergy-devnet/devnet/lean15/node-inventory.csv"
```

On PowerShell:

```powershell
$env:SYNERGY_MONITOR_INVENTORY="C:\absolute\path\to\synergy-devnet\devnet\lean15\node-inventory.csv"
```

## Host Overrides

If your monitor machine cannot resolve the default DNS names (for example `machine01.synergy-devnet.local`), add a `hosts.env` file in the same directory as `node-inventory.csv`.

For WireGuard deployments:

- keep `node-inventory.csv` `host` as monitor/public host identity
- keep `node-inventory.csv` `vpn_ip` for internal P2P identity
- use `hosts.env` only when this monitor machine needs local override behavior

Example:

```dotenv
machine-01=10.0.0.21
machine-02=10.0.0.22
machine-03=10.0.0.23
machine-04=10.0.0.24
machine-05=10.0.0.25
machine-06=10.0.0.26
machine-07=10.0.0.27
machine-08=10.0.0.28
machine-09=10.0.0.29
machine-10=10.0.0.30
machine-11=10.0.0.31
machine-12=10.0.0.32
machine-13=10.0.0.33
machine-14=10.0.0.34
machine-15=10.0.0.35
```

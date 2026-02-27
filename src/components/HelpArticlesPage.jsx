import { Link } from 'react-router-dom';

function HelpArticlesPage() {
  return (
    <section className="monitor-shell help-shell">
      <div className="help-hero">
        <div>
          <p className="help-eyebrow">Synergy Devnet Operator Manual</p>
          <h2>Network Node Monitor Help Center</h2>
          <p className="help-hero-copy">
            This page documents the app-only workflow for installing WireGuard, provisioning node
            types, operating the fleet, and validating node state in Atlas from any device.
          </p>
        </div>
        <div className="help-hero-actions">
          <Link className="monitor-link-btn" to="/">
            Open Dashboard
          </Link>
          <a
            className="monitor-link-btn"
            href="https://devnet-explorer.synergy-network.io"
            target="_blank"
            rel="noreferrer"
          >
            Open Atlas
          </a>
        </div>
      </div>

      <article className="help-article">
        <h3>1. Install Network Node Monitor App (macOS)</h3>
        <ol>
          <li>Install the generated `.dmg` or `.app` bundle on the target Mac device.</li>
          <li>Launch the app and confirm the dashboard loads with node inventory rows.</li>
          <li>
            If this is the first operator machine, generate orchestration mappings once:
            <pre>{`./scripts/devnet15/generate-monitor-hosts-env.sh`}</pre>
          </li>
        </ol>
      </article>

      <article className="help-article">
        <h3>2. WireGuard Private Devnet Setup</h3>
        <p>For each machine hosting node workloads, use the node page custom operations in order:</p>
        <ol>
          <li><code>Wireguard Install</code></li>
          <li><code>Wireguard Connect</code></li>
          <li><code>Wireguard Status</code></li>
        </ol>
        <p>To pre-generate mesh configs for all machines:</p>
        <pre>{`./scripts/devnet15/generate-wireguard-mesh.sh`}</pre>
        <p>
          Default private subnet: <code>10.50.0.0/24</code>. Node P2P/RPC services should bind to
          WireGuard VPN identity, not public internet interfaces.
        </p>
      </article>

      <article className="help-article">
        <h3>3. Node Install/Setup from the App</h3>
        <p>
          On each machine row in the Node Infrastructure page, use these controls:
        </p>
        <ul>
          <li><code>Install Node</code> or <code>Setup</code> to deploy node bundle + initial configuration.</li>
          <li><code>Start</code>, <code>Stop</code>, <code>Restart</code>, <code>Status</code> for lifecycle operations.</li>
          <li><code>Export Logs</code>, <code>View Chain Data</code>, <code>Export Chain Data</code> for diagnostics and artifact capture.</li>
          <li>Role-specific RPC operations for consensus, SXCP/interop, services, and PQC checks.</li>
        </ul>
      </article>

      <article className="help-article">
        <h3>4. Multi-Device Visibility Rules</h3>
        <p>
          If 5 operator devices run the app and one device starts 2 nodes, all devices can observe
          those nodes as online as long as the following are true:
        </p>
        <ul>
          <li>Each running node must have its own inventory entry (one row per node/service endpoint).</li>
          <li>All apps use the same node inventory/host mapping.</li>
          <li>All operator devices can reach the node RPC endpoints over VPN/private network.</li>
          <li>Node services are actually started and reporting block/sync/peer telemetry.</li>
        </ul>
        <p>
          The dashboard polls every node endpoint and computes online/offline/syncing state from
          live RPC responses. Node details include role diagnostics and execution checks.
        </p>
      </article>

      <article className="help-article">
        <h3>5. Atlas Explorer Verification (Any Device)</h3>
        <p>Primary explorer endpoints currently expected:</p>
        <ul>
          <li><code>https://devnet-explorer.synergy-network.io</code> (UI)</li>
          <li><code>https://devnet-explorer-api.synergy-network.io</code> (API)</li>
          <li><code>https://devnet-core-rpc.synergy-network.io</code> (core RPC)</li>
          <li><code>https://devnet-evm-rpc.synergy-network.io</code> (EVM RPC)</li>
          <li><code>https://devnet-indexer.synergy-network.io</code> (indexer API)</li>
          <li><code>https://devnet-api.synergy-network.io</code> (network API)</li>
        </ul>
        <p>
          The monitor app Atlas bridge uses <code>ATLAS_BASE_URL</code> / <code>EXPLORER_URL</code>
          and opens transactions, wallets, contracts, and latest block links directly from node pages.
        </p>
      </article>

      <article className="help-article">
        <h3>6. Troubleshooting Quick Checks</h3>
        <ul>
          <li>Node remains offline: run <code>Status</code> then <code>Node Logs</code>, verify RPC port and VPN path.</li>
          <li>WireGuard fails: run <code>Wireguard Status</code>, verify peer config and endpoint reachability.</li>
          <li>Explorer mismatch: confirm Atlas API/indexer points to current devnet RPC sources.</li>
          <li>Cross-machine blind spots: verify inventory host/IP and SSH mapping in hosts config.</li>
        </ul>
      </article>
    </section>
  );
}

export default HelpArticlesPage;

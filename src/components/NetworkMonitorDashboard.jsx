import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link } from 'react-router-dom';

const REFRESH_SECONDS_OPTIONS = [3, 5, 10, 15, 30];

function formatLocalTimestamp(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function truncate(value, max = 120) {
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function NetworkMonitorDashboard() {
  const [snapshot, setSnapshot] = useState(null);
  const [inventoryPath, setInventoryPath] = useState('');
  const [refreshSeconds, setRefreshSeconds] = useState(5);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const fetchSnapshot = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (!workspaceReady) {
        await invoke('monitor_initialize_workspace');
        setWorkspaceReady(true);
      }
      const [path, data] = await Promise.all([
        invoke('get_monitor_inventory_path'),
        invoke('get_monitor_snapshot'),
      ]);
      setInventoryPath(path);
      setSnapshot(data);
      setError('');
    } catch (err) {
      console.error('Failed to fetch monitor snapshot:', err);
      setError(String(err));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const handle = setInterval(() => {
      fetchSnapshot(true);
    }, refreshSeconds * 1000);
    return () => clearInterval(handle);
  }, [autoRefresh, refreshSeconds, workspaceReady]);

  const nodes = snapshot?.nodes || [];

  const roleGroupSummary = useMemo(() => {
    const counts = {};
    nodes.forEach((node) => {
      const group = node.node.role_group || 'unknown';
      counts[group] = (counts[group] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([group, count]) => `${group}: ${count}`)
      .join(' | ');
  }, [nodes]);

  if (loading) {
    return (
      <section className="monitor-shell">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading network monitor...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="monitor-shell">
      <div className="monitor-toolbar">
        <div className="monitor-toolbar-left">
          <h2>Devnet Infrastructure</h2>
          <p className="monitor-path">
            Inventory:
            {' '}
            <code>{inventoryPath || 'Not resolved'}</code>
          </p>
          <p className="monitor-path">
            Captured:
            {' '}
            <strong>{formatLocalTimestamp(snapshot?.captured_at_utc)}</strong>
          </p>
          <p className="monitor-path">{roleGroupSummary}</p>
        </div>
        <div className="monitor-toolbar-right">
          <Link className="monitor-link-btn" to="/settings">
            Operator Configuration
          </Link>
          <Link className="monitor-link-btn" to="/jarvis">
            Launch Jarvis Setup
          </Link>
          <button className="monitor-btn monitor-btn-primary" onClick={() => fetchSnapshot()}>
            Refresh Now
          </button>
          <label className="monitor-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto-refresh
          </label>
          <label className="monitor-refresh-select">
            Interval
            <select
              value={refreshSeconds}
              onChange={(event) => setRefreshSeconds(Number(event.target.value))}
              disabled={!autoRefresh}
            >
              {REFRESH_SECONDS_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds}
                  s
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="monitor-error-box">
          <strong>Monitor backend error:</strong>
          {' '}
          {truncate(error, 260)}
        </div>
      )}

      <div className="monitor-cards">
        <article className="monitor-card">
          <span>Total Nodes</span>
          <strong>{snapshot?.total_nodes ?? 0}</strong>
        </article>
        <article className="monitor-card monitor-card-online">
          <span>Online</span>
          <strong>{snapshot?.online_nodes ?? 0}</strong>
        </article>
        <article className="monitor-card monitor-card-offline">
          <span>Offline</span>
          <strong>{snapshot?.offline_nodes ?? 0}</strong>
        </article>
        <article className="monitor-card monitor-card-sync">
          <span>Syncing</span>
          <strong>{snapshot?.syncing_nodes ?? 0}</strong>
        </article>
        <article className="monitor-card">
          <span>Highest Block</span>
          <strong>{snapshot?.highest_block ?? 'N/A'}</strong>
        </article>
      </div>

      <div className="monitor-table-wrap">
        <table className="monitor-table">
          <thead>
            <tr>
              <th>Machine</th>
              <th>Node ID</th>
              <th>Role Group</th>
              <th>Role</th>
              <th>Type</th>
              <th>RPC</th>
              <th>Status</th>
              <th>Block</th>
              <th>Peers</th>
              <th>Syncing</th>
              <th>Latency</th>
              <th>Error</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((entry) => (
              <tr key={entry.node.machine_id}>
                <td>{entry.node.machine_id}</td>
                <td>{entry.node.node_id}</td>
                <td>{entry.node.role_group}</td>
                <td>{entry.node.role}</td>
                <td>{entry.node.node_type}</td>
                <td>
                  <code>{entry.node.rpc_url}</code>
                </td>
                <td>
                  <span className={`status-pill status-${entry.status}`}>{entry.status}</span>
                </td>
                <td>{entry.block_height ?? 'N/A'}</td>
                <td>{entry.peer_count ?? 'N/A'}</td>
                <td>{entry.syncing === null ? 'N/A' : String(entry.syncing)}</td>
                <td>
                  {entry.response_ms}
                  {' '}
                  ms
                </td>
                <td>{truncate(entry.error || '')}</td>
                <td>
                  <Link
                    className="monitor-link-btn"
                    to={`/node/${encodeURIComponent(entry.node.machine_id)}`}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default NetworkMonitorDashboard;

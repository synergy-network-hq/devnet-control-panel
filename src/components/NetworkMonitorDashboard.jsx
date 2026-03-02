import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link } from 'react-router-dom';

const REFRESH_SECONDS_OPTIONS = [3, 5, 10, 15, 30];

const PHYSICAL_NODE_MAP = {
  'machine-01': ['machine-01'],
  'machine-02': ['machine-02', 'machine-15'],
  'machine-03': ['machine-03', 'machine-07'],
  'machine-04': ['machine-04', 'machine-06'],
  'machine-05': ['machine-05', 'machine-10'],
  'machine-06': ['machine-11', 'machine-08'],
  'machine-07': ['machine-09', 'machine-13'],
  'machine-08': ['machine-14', 'machine-12'],
};

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
  const [viewMode, setViewMode] = useState('physical');

  const fetchSnapshot = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (!workspaceReady) {
        await invoke('monitor_initialize_workspace');
        await invoke('monitor_apply_eight_machine_topology');
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

  const physicalRows = useMemo(
    () =>
      Object.entries(PHYSICAL_NODE_MAP).map(([physicalMachineId, logicalMachineIds]) => {
        const entries = logicalMachineIds
          .map((logicalMachineId) => nodes.find((entry) => entry.node.machine_id === logicalMachineId))
          .filter(Boolean);

        const onlineCount = entries.filter((entry) => entry.online).length;
        const anySyncing = entries.some((entry) => entry.syncing === true);
        let status = 'offline';
        if (entries.length > 0 && onlineCount === entries.length) {
          status = anySyncing ? 'syncing' : 'online';
        } else if (onlineCount > 0) {
          status = 'syncing';
        }

        const highestBlock = entries
          .map((entry) => entry.block_height)
          .filter((value) => value !== null && value !== undefined)
          .reduce((acc, value) => Math.max(acc, value), 0);

        const peers = entries
          .map((entry) => (entry.peer_count === null || entry.peer_count === undefined ? 0 : entry.peer_count))
          .reduce((acc, value) => acc + value, 0);

        const latencyAvg = entries.length
          ? Math.round(entries.reduce((acc, entry) => acc + Number(entry.response_ms || 0), 0) / entries.length)
          : 0;

        const errors = entries
          .map((entry) => entry.error)
          .filter((value) => value)
          .join(' | ');

        const roleGroup = Array.from(new Set(entries.map((entry) => entry.node.role_group))).join(', ');
        const role = Array.from(new Set(entries.map((entry) => entry.node.role))).join(', ');
        const nodeType = Array.from(new Set(entries.map((entry) => entry.node.node_type))).join(', ');

        return {
          physicalMachineId,
          logicalMachineIds,
          status,
          highestBlock: highestBlock || null,
          peers,
          latencyAvg,
          errors,
          roleGroup,
          role,
          nodeType,
          entries,
        };
      }),
    [nodes],
  );

  const topologyNote =
    'Topology mode: 15 logical node slots are distributed across 8 physical machines (machine-01..08).';

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
          <p className="monitor-path">{topologyNote}</p>
        </div>
        <div className="monitor-toolbar-right">
          <Link className="monitor-link-btn" to="/settings">
            Operator Configuration
          </Link>
          <button className="monitor-btn" onClick={() => setViewMode((prev) => (prev === 'physical' ? 'logical' : 'physical'))}>
            {viewMode === 'physical' ? 'Switch To Logical View' : 'Switch To Physical View'}
          </button>
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
              <th>{viewMode === 'physical' ? 'Physical Machine' : 'Machine'}</th>
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
            {viewMode === 'physical'
              ? physicalRows.map((row) => (
                <tr key={row.physicalMachineId}>
                  <td>{row.physicalMachineId}</td>
                  <td>{row.logicalMachineIds.join(', ')}</td>
                  <td>{row.roleGroup || 'N/A'}</td>
                  <td>{row.role || 'N/A'}</td>
                  <td>{row.nodeType || 'N/A'}</td>
                  <td>
                    {row.entries.map((entry) => (
                      <div key={entry.node.machine_id}>
                        <code>{entry.node.machine_id}</code>
                        {' '}
                        <code>{entry.node.rpc_url}</code>
                      </div>
                    ))}
                  </td>
                  <td>
                    <span className={`status-pill status-${row.status}`}>{row.status}</span>
                  </td>
                  <td>{row.highestBlock ?? 'N/A'}</td>
                  <td>{row.peers ?? 'N/A'}</td>
                  <td>{row.entries.some((entry) => entry.syncing === true) ? 'true' : 'false'}</td>
                  <td>{row.latencyAvg} ms</td>
                  <td>{truncate(row.errors || '')}</td>
                  <td>
                    {row.entries.map((entry) => (
                      <Link
                        key={entry.node.machine_id}
                        className="monitor-link-btn"
                        to={`/node/${encodeURIComponent(entry.node.machine_id)}`}
                        style={{ marginRight: '0.35rem' }}
                      >
                        {entry.node.machine_id}
                      </Link>
                    ))}
                  </td>
                </tr>
              ))
              : nodes.map((entry) => (
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

import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link } from 'react-router-dom';

const REFRESH_SECONDS_OPTIONS = [3, 5, 10, 15, 30];

const BULK_ACTIONS = [
  'status',
  'start',
  'stop',
  'restart',
  'setup',
  'export_logs',
  'view_chain_data',
  'export_chain_data',
  'wireguard_status',
  'wireguard_connect',
  'wireguard_disconnect',
  'wireguard_restart',
  'rpc:get_node_status',
  'rpc:get_sync_status',
  'rpc:get_peer_info',
  'rpc:get_latest_block',
  'rpc:get_network_stats',
  'rpc:get_validator_activity',
  'rpc:get_relayer_set',
  'rpc:get_sxcp_status',
];

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

function toSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function NetworkMonitorDashboard() {
  const [snapshot, setSnapshot] = useState(null);
  const [inventoryPath, setInventoryPath] = useState('');
  const [refreshSeconds, setRefreshSeconds] = useState(5);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const [securityState, setSecurityState] = useState(null);
  const [securityError, setSecurityError] = useState('');

  const [bulkAction, setBulkAction] = useState('status');
  const [bulkScope, setBulkScope] = useState('all');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const [newOperator, setNewOperator] = useState({
    operator_id: '',
    display_name: '',
    role: 'operator',
  });

  const [newSshProfile, setNewSshProfile] = useState({
    profile_id: '',
    label: '',
    ssh_user: 'ops',
    ssh_port: '22',
    ssh_key_path: '',
    remote_root: '/opt/synergy',
  });

  const [newBinding, setNewBinding] = useState({
    machine_id: '',
    profile_id: '',
    host_override: '',
    remote_dir_override: '',
  });

  const fetchSecurityState = async () => {
    try {
      const state = await invoke('get_monitor_security_state');
      setSecurityState(state);
      setSecurityError('');
    } catch (err) {
      console.error('Failed to fetch security state:', err);
      setSecurityError(String(err));
    }
  };

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

  const refreshEverything = async () => {
    await Promise.all([fetchSnapshot(), fetchSecurityState()]);
  };

  useEffect(() => {
    refreshEverything();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const handle = setInterval(() => {
      fetchSnapshot(true);
    }, refreshSeconds * 1000);
    return () => clearInterval(handle);
  }, [autoRefresh, refreshSeconds, workspaceReady]);

  const nodes = snapshot?.nodes || [];

  const roleGroups = useMemo(() => {
    const set = new Set();
    nodes.forEach((entry) => {
      if (entry?.node?.role_group) set.add(String(entry.node.role_group));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [nodes]);

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

  const activeRole = securityState?.active_role || 'viewer';
  const isAdmin = activeRole === 'admin';

  const handleSetActiveOperator = async (operatorId) => {
    try {
      const updated = await invoke('monitor_set_active_operator', { operatorId });
      setSecurityState(updated);
      setSecurityError('');
    } catch (err) {
      setSecurityError(String(err));
    }
  };

  const handleCreateOperator = async () => {
    try {
      const payload = {
        operator_id: toSlug(newOperator.operator_id),
        display_name: String(newOperator.display_name || '').trim(),
        role: newOperator.role,
      };
      const updated = await invoke('monitor_upsert_operator', { input: payload });
      setSecurityState(updated);
      setSecurityError('');
      setNewOperator({ operator_id: '', display_name: '', role: 'operator' });
    } catch (err) {
      setSecurityError(String(err));
    }
  };

  const handleDeleteOperator = async (operatorId) => {
    try {
      const updated = await invoke('monitor_delete_operator', { operatorId });
      setSecurityState(updated);
      setSecurityError('');
    } catch (err) {
      setSecurityError(String(err));
    }
  };

  const handleCreateSshProfile = async () => {
    try {
      const payload = {
        profile_id: toSlug(newSshProfile.profile_id),
        label: String(newSshProfile.label || '').trim(),
        ssh_user: String(newSshProfile.ssh_user || '').trim(),
        ssh_port: Number(newSshProfile.ssh_port || 22),
        ssh_key_path: String(newSshProfile.ssh_key_path || '').trim() || null,
        remote_root: String(newSshProfile.remote_root || '').trim() || null,
        strict_host_key_checking: null,
        extra_ssh_args: null,
      };
      const updated = await invoke('monitor_upsert_ssh_profile', { input: payload });
      setSecurityState(updated);
      setSecurityError('');
      setNewSshProfile({
        profile_id: '',
        label: '',
        ssh_user: 'ops',
        ssh_port: '22',
        ssh_key_path: '',
        remote_root: '/opt/synergy',
      });
    } catch (err) {
      setSecurityError(String(err));
    }
  };

  const handleDeleteSshProfile = async (profileId) => {
    try {
      const updated = await invoke('monitor_delete_ssh_profile', { profileId });
      setSecurityState(updated);
      setSecurityError('');
    } catch (err) {
      setSecurityError(String(err));
    }
  };

  const handleAssignBinding = async () => {
    try {
      const payload = {
        machine_id: newBinding.machine_id,
        profile_id: newBinding.profile_id,
        host_override: String(newBinding.host_override || '').trim() || null,
        remote_dir_override: String(newBinding.remote_dir_override || '').trim() || null,
      };
      const updated = await invoke('monitor_assign_machine_ssh_profile', { input: payload });
      setSecurityState(updated);
      setSecurityError('');
    } catch (err) {
      setSecurityError(String(err));
    }
  };

  const handleRemoveBinding = async (machineId) => {
    try {
      const updated = await invoke('monitor_remove_machine_ssh_profile', { machineId });
      setSecurityState(updated);
      setSecurityError('');
    } catch (err) {
      setSecurityError(String(err));
    }
  };

  const handleBulkAction = async () => {
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const result = await invoke('monitor_bulk_node_control', {
        action: bulkAction,
        scope: bulkScope,
      });
      setBulkResult(result);
      await fetchSnapshot(true);
    } catch (err) {
      setBulkResult({ error: String(err) });
    } finally {
      setBulkBusy(false);
    }
  };

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
            Inventory: <code>{inventoryPath || 'Not resolved'}</code>
          </p>
          <p className="monitor-path">
            Captured: <strong>{formatLocalTimestamp(snapshot?.captured_at_utc)}</strong>
          </p>
          <p className="monitor-path">{roleGroupSummary}</p>
        </div>
        <div className="monitor-toolbar-right">
          <button className="monitor-btn monitor-btn-primary" onClick={refreshEverything}>
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
                  {seconds}s
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="monitor-error-box">
          <strong>Monitor backend error:</strong> {truncate(error, 260)}
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

      <div className="monitor-admin-grid">
        <article className="monitor-panel">
          <h3>Operator Access (RBAC)</h3>
          <p className="monitor-path">
            Workspace: <code>{securityState?.workspace_path || 'N/A'}</code>
          </p>
          <p className="monitor-path">
            Active role: <strong>{activeRole}</strong>
          </p>

          <label className="monitor-field">
            Active Operator
            <select
              value={securityState?.active_operator_id || ''}
              onChange={(event) => handleSetActiveOperator(event.target.value)}
            >
              {(securityState?.operators || []).map((operator) => (
                <option key={operator.operator_id} value={operator.operator_id}>
                  {operator.display_name} ({operator.role})
                </option>
              ))}
            </select>
          </label>

          <div className="monitor-form-inline">
            <input
              placeholder="operator_id"
              value={newOperator.operator_id}
              onChange={(event) => setNewOperator((prev) => ({ ...prev, operator_id: event.target.value }))}
            />
            <input
              placeholder="display name"
              value={newOperator.display_name}
              onChange={(event) => setNewOperator((prev) => ({ ...prev, display_name: event.target.value }))}
            />
            <select
              value={newOperator.role}
              onChange={(event) => setNewOperator((prev) => ({ ...prev, role: event.target.value }))}
            >
              <option value="viewer">viewer</option>
              <option value="operator">operator</option>
              <option value="admin">admin</option>
            </select>
            <button className="monitor-btn" onClick={handleCreateOperator} disabled={!isAdmin}>
              Add Operator
            </button>
          </div>

          <div className="monitor-chip-row">
            {(securityState?.operators || []).map((operator) => (
              <div key={operator.operator_id} className="monitor-chip">
                <span>{operator.display_name} ({operator.role})</span>
                {isAdmin && operator.operator_id !== securityState?.active_operator_id ? (
                  <button onClick={() => handleDeleteOperator(operator.operator_id)}>remove</button>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="monitor-panel">
          <h3>SSH Profiles</h3>
          <div className="monitor-form-grid">
            <input
              placeholder="profile_id"
              value={newSshProfile.profile_id}
              onChange={(event) => setNewSshProfile((prev) => ({ ...prev, profile_id: event.target.value }))}
            />
            <input
              placeholder="label"
              value={newSshProfile.label}
              onChange={(event) => setNewSshProfile((prev) => ({ ...prev, label: event.target.value }))}
            />
            <input
              placeholder="ssh user"
              value={newSshProfile.ssh_user}
              onChange={(event) => setNewSshProfile((prev) => ({ ...prev, ssh_user: event.target.value }))}
            />
            <input
              placeholder="ssh port"
              value={newSshProfile.ssh_port}
              onChange={(event) => setNewSshProfile((prev) => ({ ...prev, ssh_port: event.target.value }))}
            />
            <input
              placeholder="ssh key path (optional)"
              value={newSshProfile.ssh_key_path}
              onChange={(event) => setNewSshProfile((prev) => ({ ...prev, ssh_key_path: event.target.value }))}
            />
            <input
              placeholder="remote root"
              value={newSshProfile.remote_root}
              onChange={(event) => setNewSshProfile((prev) => ({ ...prev, remote_root: event.target.value }))}
            />
          </div>
          <button className="monitor-btn" onClick={handleCreateSshProfile} disabled={!isAdmin}>
            Save SSH Profile
          </button>

          <div className="monitor-chip-row">
            {(securityState?.ssh_profiles || []).map((profile) => (
              <div key={profile.profile_id} className="monitor-chip">
                <span>{profile.label} ({profile.ssh_user}@:{profile.ssh_port})</span>
                {isAdmin ? (
                  <button onClick={() => handleDeleteSshProfile(profile.profile_id)}>remove</button>
                ) : null}
              </div>
            ))}
          </div>

          <h4>Machine Binding</h4>
          <div className="monitor-form-grid">
            <select
              value={newBinding.machine_id}
              onChange={(event) => setNewBinding((prev) => ({ ...prev, machine_id: event.target.value }))}
            >
              <option value="">Select machine</option>
              {nodes.map((entry) => (
                <option key={entry.node.machine_id} value={entry.node.machine_id}>
                  {entry.node.machine_id}
                </option>
              ))}
            </select>
            <select
              value={newBinding.profile_id}
              onChange={(event) => setNewBinding((prev) => ({ ...prev, profile_id: event.target.value }))}
            >
              <option value="">Select profile</option>
              {(securityState?.ssh_profiles || []).map((profile) => (
                <option key={profile.profile_id} value={profile.profile_id}>
                  {profile.label}
                </option>
              ))}
            </select>
            <input
              placeholder="host override (optional)"
              value={newBinding.host_override}
              onChange={(event) => setNewBinding((prev) => ({ ...prev, host_override: event.target.value }))}
            />
            <input
              placeholder="remote dir override (optional)"
              value={newBinding.remote_dir_override}
              onChange={(event) => setNewBinding((prev) => ({ ...prev, remote_dir_override: event.target.value }))}
            />
          </div>
          <button className="monitor-btn" onClick={handleAssignBinding} disabled={!isAdmin}>
            Bind Machine
          </button>

          <div className="monitor-chip-row">
            {(securityState?.machine_bindings || []).map((binding) => (
              <div key={binding.machine_id} className="monitor-chip">
                <span>{`${binding.machine_id} -> ${binding.profile_id}`}</span>
                {isAdmin ? (
                  <button onClick={() => handleRemoveBinding(binding.machine_id)}>remove</button>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="monitor-panel">
          <h3>Fleet Bulk Actions</h3>
          <div className="monitor-form-grid">
            <select value={bulkAction} onChange={(event) => setBulkAction(event.target.value)}>
              {BULK_ACTIONS.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>

            <select value={bulkScope} onChange={(event) => setBulkScope(event.target.value)}>
              <option value="all">all</option>
              {roleGroups.map((group) => (
                <option key={group} value={`role_group:${group}`}>
                  role_group:{group}
                </option>
              ))}
            </select>
          </div>

          <button className="monitor-btn monitor-btn-primary" onClick={handleBulkAction} disabled={bulkBusy}>
            {bulkBusy ? 'Executing...' : 'Execute Bulk Action'}
          </button>

          {bulkResult?.error ? (
            <div className="monitor-error-box">
              <strong>Bulk action failed:</strong> {bulkResult.error}
            </div>
          ) : null}

          {bulkResult && !bulkResult.error ? (
            <div className="monitor-bulk-result">
              <p>
                Action <code>{bulkResult.action}</code> on <code>{bulkResult.scope}</code> |
                success: <strong>{bulkResult.succeeded}</strong> |
                failed: <strong>{bulkResult.failed}</strong>
              </p>
              <div className="monitor-chip-row">
                {(bulkResult.results || []).slice(0, 20).map((result) => (
                  <div key={`${result.machine_id}-${result.executed_at_utc}`} className="monitor-chip">
                    <span>{result.machine_id}: {result.success ? 'ok' : `fail (${result.exit_code})`}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </div>

      {securityError && (
        <div className="monitor-error-box">
          <strong>Security/RBAC error:</strong> {truncate(securityError, 320)}
        </div>
      )}

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
                <td>{entry.response_ms} ms</td>
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

import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link, useParams } from 'react-router-dom';

const REFRESH_SECONDS_OPTIONS = [3, 5, 10, 15, 30];

function formatLocalTimestamp(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function jsonPretty(value) {
  if (value === null || value === undefined) return 'N/A';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function scalar(value) {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'object') return jsonPretty(value);
  return String(value);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function countByStatus(checks = [], status) {
  return checks.filter((check) => check.status === status).length;
}

function dedupeByKey(actions = []) {
  const map = new Map();
  actions.forEach((action) => {
    if (!action?.key || map.has(action.key)) return;
    map.set(action.key, action);
  });
  return Array.from(map.values());
}

function titleizeKey(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function NetworkMonitorNodePage() {
  const { nodeSlotId } = useParams();
  const [nodeDetails, setNodeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState('');

  const [snapshot, setSnapshot] = useState(null);

  const [refreshSeconds, setRefreshSeconds] = useState(5);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [controlResult, setControlResult] = useState(null);
  const [controlBusyAction, setControlBusyAction] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportResult, setExportResult] = useState(null);

  const fetchSnapshot = async () => {
    try {
      const data = await invoke('get_monitor_snapshot');
      setSnapshot(data);
    } catch (err) {
      console.error('Failed to fetch monitor snapshot for routing context:', err);
    }
  };

  const fetchNodeDetails = async (silent = false) => {
    if (!nodeSlotId) return;
    if (!silent) setDetailsLoading(true);

    try {
      const details = await invoke('get_monitor_node_details', { machineId: nodeSlotId });
      setNodeDetails(details);
      setDetailsError('');
    } catch (err) {
      console.error('Failed to fetch monitor node details:', err);
      setDetailsError(String(err));
    } finally {
      if (!silent) setDetailsLoading(false);
    }
  };

  useEffect(() => {
    fetchNodeDetails();
    fetchSnapshot();
  }, [nodeSlotId]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const handle = setInterval(() => {
      fetchNodeDetails(true);
      fetchSnapshot();
    }, refreshSeconds * 1000);
    return () => clearInterval(handle);
  }, [autoRefresh, refreshSeconds, nodeSlotId]);

  const roleDiagnosticsEntries = useMemo(() => {
    const diag = nodeDetails?.role_diagnostics;
    if (!diag || typeof diag !== 'object') return [];
    return Object.entries(diag);
  }, [nodeDetails]);

  const sortedNodes = useMemo(() => {
    const nodes = snapshot?.nodes || [];
    return [...nodes].sort((a, b) =>
      (a?.node?.machine_id || '').localeCompare(b?.node?.machine_id || ''),
    );
  }, [snapshot]);

  const currentIndex = useMemo(() => {
    const target = normalize(nodeSlotId);
    return sortedNodes.findIndex(
      (entry) =>
        normalize(entry?.node?.machine_id) === target || normalize(entry?.node?.node_id) === target,
    );
  }, [sortedNodes, nodeSlotId]);

  const previousNode = currentIndex > 0 ? sortedNodes[currentIndex - 1] : null;
  const nextNode = currentIndex >= 0 && currentIndex < sortedNodes.length - 1
    ? sortedNodes[currentIndex + 1]
    : null;

  const networkMaxHeight = snapshot?.highest_block ?? null;
  const localHeight = nodeDetails?.status?.block_height ?? null;
  const blockLag =
    networkMaxHeight !== null && localHeight !== null && networkMaxHeight >= localHeight
      ? networkMaxHeight - localHeight
      : null;
  const nodeStatus = nodeDetails?.status?.status || 'unknown';
  const syncing = nodeDetails?.status?.syncing;
  const heroTone =
    nodeStatus === 'online'
      ? 'healthy'
      : nodeStatus === 'syncing'
        ? 'degraded'
        : nodeStatus === 'offline'
          ? 'critical'
          : 'unknown';
  const statusSummary =
    syncing === true
      ? 'Syncing toward chain head.'
      : syncing === false
        ? 'Tracking chain head normally.'
        : 'Sync state not reported yet.';

  const handleControlAction = async (action) => {
    if (!nodeSlotId) return;
    setControlBusyAction(action);
    setControlResult(null);

    try {
      const result = await invoke('monitor_node_control', {
        machineId: nodeSlotId,
        action,
      });
      setControlResult(result);
      await fetchNodeDetails(true);
      await fetchSnapshot();
    } catch (err) {
      setControlResult({
        success: false,
        action,
        exit_code: -1,
        stdout: '',
        stderr: String(err),
        command: 'N/A',
        executed_at_utc: new Date().toISOString(),
      });
    } finally {
      setControlBusyAction('');
    }
  };

  const handleExportNodeData = async () => {
    if (!nodeSlotId) return;
    setExportBusy(true);
    setExportResult(null);
    try {
      const result = await invoke('monitor_export_node_data', { machineId: nodeSlotId });
      setExportResult({ ok: true, ...result });
    } catch (err) {
      setExportResult({
        ok: false,
        error: String(err),
        exported_at_utc: new Date().toISOString(),
      });
    } finally {
      setExportBusy(false);
    }
  };

  if (detailsLoading) {
    return (
      <section className="monitor-shell">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading node diagnostics...</p>
        </div>
      </section>
    );
  }

  const control = nodeDetails?.control;
  const roleExecution = nodeDetails?.role_execution;
  const atlas = nodeDetails?.atlas;
  const roleOperations = dedupeByKey(
    (nodeDetails?.role_operations || []).filter((action) => action?.category !== 'custom'),
  );
  const customActions = dedupeByKey(control?.custom_actions || []);
  const resetChainAction = customActions.find((action) => action?.key === 'reset_chain');
  const customActionsVisible = customActions.filter((action) => action?.key !== 'reset_chain');
  const node = nodeDetails?.status?.node;
  const quickFacts = [
    { label: 'Node Slot', value: node?.machine_id || nodeSlotId },
    { label: 'Physical Machine', value: node?.physical_machine || 'N/A' },
    { label: 'Node Alias', value: node?.node_id || 'N/A' },
    { label: 'Role Group', value: node?.role_group || 'N/A' },
    { label: 'Node Type', value: node?.node_type || 'N/A' },
    { label: 'Address', value: node?.node_address || 'N/A', code: true },
  ];
  const runtimeFacts = [
    { label: 'RPC Endpoint', value: node?.rpc_url || 'N/A', code: true },
    { label: 'Status', value: nodeDetails?.status?.status || 'unknown' },
    { label: 'Syncing', value: scalar(nodeDetails?.status?.syncing) },
    { label: 'Checked', value: formatLocalTimestamp(nodeDetails?.status?.last_checked_utc) },
    { label: 'Captured', value: formatLocalTimestamp(nodeDetails?.captured_at_utc) },
    { label: 'Role Summary', value: roleExecution?.summary || 'No execution assessment available.' },
  ];
  const healthStats = [
    { label: 'Network Head', value: scalar(networkMaxHeight) },
    { label: 'Local Height', value: scalar(localHeight) },
    { label: 'Block Lag', value: scalar(blockLag), tone: blockLag > 25 ? 'critical' : blockLag > 0 ? 'degraded' : 'healthy' },
    { label: 'Peers', value: scalar(nodeDetails?.status?.peer_count), tone: Number(nodeDetails?.status?.peer_count || 0) > 0 ? 'healthy' : 'critical' },
    { label: 'Latency', value: `${scalar(nodeDetails?.status?.response_ms)} ms`, tone: Number(nodeDetails?.status?.response_ms || 0) > 1000 ? 'degraded' : 'healthy' },
  ];
  const sectionLinks = [
    ['overview', 'Overview'],
    ['execution', 'Execution'],
    ['control', 'Control'],
    ['atlas', 'Atlas'],
    ['rpc', 'RPC'],
  ];

  return (
    <section className="monitor-shell monitor-shell-node">
      <div className="monitor-page-hero monitor-page-hero-node">
        <div className="monitor-hero-copy">
          <p className="monitor-hero-eyebrow">Node Slot Diagnostics</p>
          <h2 className="monitor-hero-title">
            {node?.machine_id || nodeSlotId}
            {' '}
            /
            {' '}
            {node?.role || 'unknown-role'}
          </h2>
          <p className="monitor-hero-summary">
            {statusSummary}
            {' '}
            Role execution summary:
            {' '}
            {roleExecution?.summary || 'No execution assessment available yet.'}
          </p>
          <div className="monitor-inline-pills">
            <span className={`monitor-inline-pill monitor-inline-pill-${heroTone}`}>
              {nodeStatus}
            </span>
            <span className="monitor-inline-pill">
              Physical
              {' '}
              {node?.physical_machine || 'N/A'}
            </span>
            <span className="monitor-inline-pill">
              Node ID
              {' '}
              {node?.node_id || 'N/A'}
            </span>
            <span className="monitor-inline-pill">
              Captured
              {' '}
              {formatLocalTimestamp(nodeDetails?.captured_at_utc)}
            </span>
          </div>
        </div>
        <div className="monitor-hero-actions">
          <Link className="monitor-link-btn" to="/">
            Back to Fleet Matrix
          </Link>
          <div className="monitor-node-nav">
            <Link
              className={`monitor-link-btn ${previousNode ? '' : 'monitor-link-btn-disabled'}`}
              to={previousNode ? `/node/${encodeURIComponent(previousNode.node.machine_id)}` : '#'}
              onClick={(event) => {
                if (!previousNode) event.preventDefault();
              }}
            >
              Previous Node
            </Link>
            <Link
              className={`monitor-link-btn ${nextNode ? '' : 'monitor-link-btn-disabled'}`}
              to={nextNode ? `/node/${encodeURIComponent(nextNode.node.machine_id)}` : '#'}
              onClick={(event) => {
                if (!nextNode) event.preventDefault();
              }}
            >
              Next Node
            </Link>
          </div>
          <button className="monitor-btn monitor-btn-primary" onClick={() => { fetchNodeDetails(); fetchSnapshot(); }}>
            Refresh Node
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

      <div className="monitor-stat-grid">
        {healthStats.map((stat) => (
          <article key={stat.label} className={`monitor-stat-card ${stat.tone ? `monitor-stat-card-${stat.tone}` : ''}`}>
            <span className="monitor-stat-label">{stat.label}</span>
            <strong className="monitor-stat-value">{stat.value}</strong>
          </article>
        ))}
      </div>

      <nav className="monitor-section-nav">
        {sectionLinks.map(([id, label]) => (
          <a key={id} className="monitor-section-nav-chip" href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      {detailsError && (
        <div className="monitor-error-box">
          <strong>Node detail error:</strong> {detailsError}
        </div>
      )}

      {!detailsError && nodeDetails && (
        <div className="monitor-node-layout">
          <div className="monitor-node-main">
            <section id="overview" className="monitor-detail-grid monitor-detail-grid-overview">
              <article className="monitor-detail-card monitor-detail-card-identity">
                <div className="monitor-card-heading">
                  <div>
                    <p className="monitor-card-kicker">Identity</p>
                    <h4>Slot and Host Mapping</h4>
                  </div>
                  <span className={`monitor-execution-pill monitor-execution-${heroTone}`}>
                    {nodeStatus}
                  </span>
                </div>
                <dl className="monitor-data-list">
                  {quickFacts.map((fact) => (
                    <div key={fact.label} className="monitor-data-row">
                      <dt>{fact.label}</dt>
                      <dd>{fact.code ? <code>{fact.value}</code> : fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </article>

              <article className="monitor-detail-card monitor-detail-card-runtime">
                <div className="monitor-card-heading">
                  <div>
                    <p className="monitor-card-kicker">Runtime</p>
                    <h4>Node Process Snapshot</h4>
                  </div>
                </div>
                <dl className="monitor-data-list">
                  {runtimeFacts.map((fact) => (
                    <div key={fact.label} className="monitor-data-row">
                      <dt>{fact.label}</dt>
                      <dd>{fact.code ? <code>{fact.value}</code> : fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </article>

              <article className="monitor-detail-card monitor-detail-card-diagnostics">
                <div className="monitor-card-heading">
                  <div>
                    <p className="monitor-card-kicker">Diagnostics</p>
                    <h4>Role-Specific Readout</h4>
                  </div>
                </div>
                {roleDiagnosticsEntries.length === 0 ? (
                  <p className="monitor-empty-state">No role diagnostics available.</p>
                ) : (
                  <dl className="monitor-data-list">
                    {roleDiagnosticsEntries.map(([key, value]) => (
                      <div key={key} className="monitor-data-row">
                        <dt>{titleizeKey(key)}</dt>
                        <dd className="monitor-detail-value">{scalar(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </article>
            </section>

            <section id="execution" className="monitor-execution-shell">
              <div className="monitor-execution-header">
                <div>
                  <p className="monitor-card-kicker">Execution</p>
                  <h4>Role Execution Status</h4>
                </div>
                <span className={`monitor-execution-pill monitor-execution-${roleExecution?.overall_status || 'unknown'}`}>
                  {roleExecution?.overall_status || 'unknown'}
                </span>
              </div>
              <p className="monitor-control-hint">{roleExecution?.summary || 'No execution assessment available.'}</p>
              <div className="monitor-execution-scoreboard">
                <article className="monitor-mini-stat monitor-mini-stat-pass">
                  <span>Pass</span>
                  <strong>{countByStatus(roleExecution?.checks, 'pass')}</strong>
                </article>
                <article className="monitor-mini-stat monitor-mini-stat-warn">
                  <span>Warn</span>
                  <strong>{countByStatus(roleExecution?.checks, 'warn')}</strong>
                </article>
                <article className="monitor-mini-stat monitor-mini-stat-fail">
                  <span>Fail</span>
                  <strong>{countByStatus(roleExecution?.checks, 'fail')}</strong>
                </article>
              </div>
              <div className="monitor-execution-table-wrap">
                <table className="monitor-execution-table">
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(roleExecution?.checks || []).map((check) => (
                      <tr key={check.key}>
                        <td>{check.label}</td>
                        <td>
                          <span className={`monitor-check-pill monitor-check-${check.status}`}>
                            {check.status}
                          </span>
                        </td>
                        <td>{check.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="monitor-role-notes">
              <div className="monitor-card-heading">
                <div>
                  <p className="monitor-card-kicker">Operational Notes</p>
                  <h4>What This Slot Should Be Doing</h4>
                </div>
              </div>
              <div className="monitor-note-stack">
                {(nodeDetails.role_notes || []).map((note, idx) => (
                  <p key={`${node?.machine_id}-note-${idx}`}>{note}</p>
                ))}
              </div>
            </section>

            <section id="control" className="monitor-control-shell">
              <div className="monitor-card-heading">
                <div>
                  <p className="monitor-card-kicker">Control Plane</p>
                  <h4>Node Actions</h4>
                </div>
              </div>
              <p className="monitor-control-hint">{control?.configuration_hint || 'No control configuration found.'}</p>

              <div className="monitor-control-buttons">
                <button
                  className="monitor-btn"
                  disabled={!control?.start_configured || !!controlBusyAction}
                  onClick={() => handleControlAction('start')}
                >
                  {controlBusyAction === 'start' ? 'Starting...' : 'Start'}
                </button>
                <button
                  className="monitor-btn"
                  disabled={!control?.stop_configured || !!controlBusyAction}
                  onClick={() => handleControlAction('stop')}
                >
                  {controlBusyAction === 'stop' ? 'Stopping...' : 'Stop'}
                </button>
                <button
                  className="monitor-btn"
                  disabled={!control?.restart_configured || !!controlBusyAction}
                  onClick={() => handleControlAction('restart')}
                >
                  {controlBusyAction === 'restart' ? 'Restarting...' : 'Restart'}
                </button>
                <button
                  className="monitor-btn"
                  disabled={!control?.status_configured || !!controlBusyAction}
                  onClick={() => handleControlAction('status')}
                >
                  {controlBusyAction === 'status' ? 'Querying...' : 'Status'}
                </button>
                <button
                  className="monitor-btn"
                  disabled={!control?.setup_configured || !!controlBusyAction}
                  onClick={() => handleControlAction('setup')}
                >
                  {controlBusyAction === 'setup' ? 'Setting Up...' : 'Setup'}
                </button>
                <button
                  className="monitor-btn"
                  disabled={!control?.export_logs_configured || !!controlBusyAction}
                  onClick={() => handleControlAction('export_logs')}
                >
                  {controlBusyAction === 'export_logs' ? 'Exporting Logs...' : 'Export Logs'}
                </button>
                <button
                  className="monitor-btn"
                  disabled={!control?.view_chain_data_configured || !!controlBusyAction}
                  onClick={() => handleControlAction('view_chain_data')}
                >
                  {controlBusyAction === 'view_chain_data' ? 'Loading Chain Data...' : 'View Chain Data'}
                </button>
                <button
                  className="monitor-btn"
                  disabled={!control?.export_chain_data_configured || !!controlBusyAction}
                  onClick={() => handleControlAction('export_chain_data')}
                >
                  {controlBusyAction === 'export_chain_data' ? 'Exporting Chain Data...' : 'Export Chain Data'}
                </button>
                <button
                  className="monitor-btn monitor-btn-primary"
                  disabled={exportBusy || !!controlBusyAction}
                  onClick={handleExportNodeData}
                >
                  {exportBusy ? 'Exporting Node Snapshot...' : 'Export Node Snapshot'}
                </button>
                <button
                  className="monitor-btn monitor-btn-danger"
                  disabled={!resetChainAction?.configured || !!controlBusyAction}
                  onClick={() => {
                    const approved = window.confirm(
                      'Reset chain to genesis for this node? This stops the node, deletes local chain state, and restarts it.',
                    );
                    if (approved) {
                      handleControlAction('reset_chain');
                    }
                  }}
                  title="Stop node, delete chain data, and restart from genesis."
                >
                  {controlBusyAction === 'reset_chain' ? 'Resetting Chain...' : 'Reset Chain (Genesis)'}
                </button>
              </div>

              {customActionsVisible.length > 0 && (
                <div className="monitor-action-group">
                  <h5>Custom Machine Operations</h5>
                  <div className="monitor-control-buttons">
                    {customActionsVisible.map((action) => (
                      <button
                        key={action.key}
                        className="monitor-btn"
                        disabled={!action.configured || !!controlBusyAction}
                        onClick={() => handleControlAction(action.key)}
                        title={action.description}
                      >
                        {controlBusyAction === action.key ? 'Running...' : action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {roleOperations.length > 0 && (
                <div className="monitor-action-group">
                  <h5>Role-Specific Operations</h5>
                  <div className="monitor-control-buttons">
                    {roleOperations.map((action) => (
                      <button
                        key={action.key}
                        className="monitor-btn"
                        disabled={!action.configured || !!controlBusyAction}
                        onClick={() => handleControlAction(action.key)}
                        title={action.description}
                      >
                        {controlBusyAction === action.key ? 'Running...' : action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {controlResult && (
                <div className={`monitor-control-result ${controlResult.success ? 'monitor-control-ok' : 'monitor-control-fail'}`}>
                  <p>
                    <strong>Action:</strong> {controlResult.action} | <strong>Success:</strong>{' '}
                    {String(controlResult.success)} | <strong>Exit:</strong> {controlResult.exit_code}
                  </p>
                  <p><strong>Command:</strong> <code>{controlResult.command}</code></p>
                  {controlResult.stdout && (
                    <details>
                      <summary>stdout</summary>
                      <pre>{controlResult.stdout}</pre>
                    </details>
                  )}
                  {controlResult.stderr && (
                    <details>
                      <summary>stderr</summary>
                      <pre>{controlResult.stderr}</pre>
                    </details>
                  )}
                </div>
              )}

              {exportResult && (
                <div className={`monitor-control-result ${exportResult.ok ? 'monitor-control-ok' : 'monitor-control-fail'}`}>
                  <p>
                    <strong>Export Success:</strong> {String(exportResult.ok)} | <strong>When:</strong>{' '}
                    {formatLocalTimestamp(exportResult.exported_at_utc)}
                  </p>
                  {exportResult.ok ? (
                    <>
                      <p><strong>File:</strong> <code>{exportResult.file_path}</code></p>
                      <p><strong>Bytes:</strong> {exportResult.bytes}</p>
                    </>
                  ) : (
                    <p><strong>Error:</strong> {exportResult.error}</p>
                  )}
                </div>
              )}
            </section>

            <section id="atlas" className="monitor-atlas-shell">
              <div className="monitor-execution-header">
                <div>
                  <p className="monitor-card-kicker">Explorer</p>
                  <h4>Atlas Explorer Bridge</h4>
                </div>
                <span className={`monitor-execution-pill monitor-execution-${atlas?.enabled ? 'healthy' : 'unknown'}`}>
                  {atlas?.enabled ? 'connected' : 'not-configured'}
                </span>
              </div>
              {!atlas?.enabled ? (
                <p className="monitor-control-hint">
                  Atlas link integration is not configured. Set <code>ATLAS_BASE_URL</code> or
                  <code> EXPLORER_URL</code> in <code>devnet/lean15/hosts.env</code>.
                </p>
              ) : (
                <div className="monitor-atlas-links">
                  {atlas.home_url && (
                    <a href={atlas.home_url} target="_blank" rel="noreferrer" className="monitor-link-btn">
                      Atlas Home
                    </a>
                  )}
                  {atlas.transactions_url && (
                    <a href={atlas.transactions_url} target="_blank" rel="noreferrer" className="monitor-link-btn">
                      Transactions
                    </a>
                  )}
                  {atlas.wallets_url && (
                    <a href={atlas.wallets_url} target="_blank" rel="noreferrer" className="monitor-link-btn">
                      Wallets
                    </a>
                  )}
                  {atlas.contracts_url && (
                    <a href={atlas.contracts_url} target="_blank" rel="noreferrer" className="monitor-link-btn">
                      Contracts
                    </a>
                  )}
                  {atlas.latest_block_url && (
                    <a href={atlas.latest_block_url} target="_blank" rel="noreferrer" className="monitor-link-btn">
                      Latest Block
                    </a>
                  )}
                  {atlas.latest_transaction_url && (
                    <a href={atlas.latest_transaction_url} target="_blank" rel="noreferrer" className="monitor-link-btn">
                      Latest Transaction
                    </a>
                  )}
                  {atlas.node_wallet_url && (
                    <a href={atlas.node_wallet_url} target="_blank" rel="noreferrer" className="monitor-link-btn">
                      Node Wallet
                    </a>
                  )}
                </div>
              )}
              {atlas?.latest_transaction_hash && (
                <p className="monitor-control-hint">
                  Latest tx hash: <code>{atlas.latest_transaction_hash}</code>
                </p>
              )}
            </section>

            <section id="rpc" className="monitor-rpc-shell">
              <div className="monitor-card-heading">
                <div>
                  <p className="monitor-card-kicker">RPC</p>
                  <h4>Direct Diagnostic Payloads</h4>
                </div>
                <span className="monitor-inline-pill">
                  {Array.isArray(nodeDetails.rpc.errors) ? nodeDetails.rpc.errors.length : 0}
                  {' '}
                  error(s)
                </span>
              </div>
              <div className="monitor-rpc-grid">
                <article className="monitor-rpc-card">
                  <h4>synergy_nodeInfo</h4>
                  <pre>{jsonPretty(nodeDetails.rpc.node_info)}</pre>
                </article>
                <article className="monitor-rpc-card">
                  <h4>synergy_getNodeStatus</h4>
                  <pre>{jsonPretty(nodeDetails.rpc.node_status)}</pre>
                </article>
                <article className="monitor-rpc-card">
                  <h4>synergy_getSyncStatus</h4>
                  <pre>{jsonPretty(nodeDetails.rpc.sync_status)}</pre>
                </article>
                <article className="monitor-rpc-card">
                  <h4>synergy_getPeerInfo</h4>
                  <pre>{jsonPretty(nodeDetails.rpc.peer_info)}</pre>
                </article>
                <article className="monitor-rpc-card">
                  <h4>synergy_getValidatorActivity</h4>
                  <pre>{jsonPretty(nodeDetails.rpc.validator_activity)}</pre>
                </article>
                <article className="monitor-rpc-card">
                  <h4>synergy_getLatestBlock</h4>
                  <pre>{jsonPretty(nodeDetails.rpc.latest_block)}</pre>
                </article>
                <article className="monitor-rpc-card">
                  <h4>SXCP: relayer set + attestations</h4>
                  <pre>{jsonPretty({ relayer_set: nodeDetails.rpc.relayer_set, attestations: nodeDetails.rpc.attestations })}</pre>
                </article>
              </div>
            </section>
          </div>

          <aside className="monitor-node-sidecar">
            <section className="monitor-sidecar-card">
              <p className="monitor-card-kicker">Operator Snapshot</p>
              <h4>At-a-Glance</h4>
              <div className="monitor-sidecar-stat-list">
                {healthStats.map((stat) => (
                  <div key={stat.label} className="monitor-sidecar-stat">
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="monitor-sidecar-card">
              <p className="monitor-card-kicker">Available Actions</p>
              <h4>Current Action Sets</h4>
              <div className="monitor-tag-cluster">
                {customActionsVisible.map((action) => (
                  <span key={action.key} className={`monitor-action-tag ${action.configured ? '' : 'monitor-action-tag-disabled'}`}>
                    {action.label}
                  </span>
                ))}
                {roleOperations.map((action) => (
                  <span key={action.key} className={`monitor-action-tag monitor-action-tag-role ${action.configured ? '' : 'monitor-action-tag-disabled'}`}>
                    {action.label}
                  </span>
                ))}
              </div>
            </section>

            {Array.isArray(nodeDetails.rpc.errors) && nodeDetails.rpc.errors.length > 0 && (
              <section className="monitor-sidecar-card monitor-sidecar-card-alert">
                <p className="monitor-card-kicker">Attention</p>
                <h4>RPC Diagnostics Errors</h4>
                <div className="monitor-sidecar-list">
                  {nodeDetails.rpc.errors.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

export default NetworkMonitorNodePage;

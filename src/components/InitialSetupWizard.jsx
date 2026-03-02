import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const MACHINE_OPTIONS = Array.from({ length: 13 }, (_, index) => `machine-${String(index + 1).padStart(2, '0')}`);

const ACTIVE_MACHINE_PLAN = [
  {
    machineId: 'machine-01',
    owner: 'Rob',
    os: 'macOS',
    vpnIp: '10.50.0.1',
    primaryRole: 'Validator',
    secondaryRole: 'Hub Control',
    notes: 'VPN hub host. Only validator node on this device.',
  },
  {
    machineId: 'machine-02',
    owner: 'Justin',
    os: 'macOS',
    vpnIp: '10.50.0.2',
    primaryRole: 'Validator',
    secondaryRole: 'Observer',
    notes: 'Class I + Class V',
  },
  {
    machineId: 'machine-03',
    owner: 'Rob',
    os: 'macOS',
    vpnIp: '10.50.0.3',
    primaryRole: 'Validator',
    secondaryRole: 'Cross-Chain Verifier',
    notes: 'Class I + Class II',
  },
  {
    machineId: 'machine-04',
    owner: 'Justin',
    os: 'Ubuntu',
    vpnIp: '10.50.0.4',
    primaryRole: 'Validator',
    secondaryRole: 'Relayer',
    notes: 'Class I + Class II',
  },
  {
    machineId: 'machine-05',
    owner: 'Rob',
    os: 'Ubuntu',
    vpnIp: '10.50.0.5',
    primaryRole: 'Validator',
    secondaryRole: 'Committee',
    notes: 'Class I + governance support',
  },
  {
    machineId: 'machine-06',
    owner: 'Network',
    os: 'Ubuntu Server',
    vpnIp: '10.50.0.6',
    primaryRole: 'Security Council',
    secondaryRole: 'Oracle',
    notes: 'Class IV + Class II',
  },
  {
    machineId: 'machine-07',
    owner: 'Rob',
    os: 'Windows',
    vpnIp: '10.50.0.7',
    primaryRole: 'Witness',
    secondaryRole: 'RPC Gateway',
    notes: 'Class II + Class V',
  },
  {
    machineId: 'machine-08',
    owner: 'Rob',
    os: 'Windows',
    vpnIp: '10.50.0.8',
    primaryRole: 'Indexer',
    secondaryRole: 'PQC Crypto',
    notes: 'Class V + Class III',
  },
];

const PHYSICAL_TO_LOGICAL_NODE_MAP = {
  'machine-01': ['machine-01'],
  'machine-02': ['machine-02', 'machine-15'],
  'machine-03': ['machine-03', 'machine-07'],
  'machine-04': ['machine-04', 'machine-06'],
  'machine-05': ['machine-05', 'machine-10'],
  'machine-06': ['machine-11', 'machine-08'],
  'machine-07': ['machine-09', 'machine-13'],
  'machine-08': ['machine-14', 'machine-12'],
};

const PHYSICAL_MACHINE_VPN_IP = {
  'machine-01': '10.50.0.1',
  'machine-02': '10.50.0.2',
  'machine-03': '10.50.0.3',
  'machine-04': '10.50.0.4',
  'machine-05': '10.50.0.5',
  'machine-06': '10.50.0.6',
  'machine-07': '10.50.0.7',
  'machine-08': '10.50.0.8',
};

const STEPS = [
  { id: 1, title: 'Operator Profile' },
  { id: 2, title: 'SSH Key Commands' },
  { id: 3, title: 'SSH Profile' },
  { id: 4, title: 'Machine Binding' },
  { id: 5, title: 'Node Setup' },
  { id: 6, title: 'Finish' },
];

function nowLabel() {
  return new Date().toLocaleTimeString();
}

function normalizeOutputLines(value) {
  const lines = String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  return lines;
}

function InitialSetupWizard({ onComplete }) {
  const terminalScrollRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  const [workspacePath, setWorkspacePath] = useState('');
  const [securityState, setSecurityState] = useState(null);
  const [lastWhoami, setLastWhoami] = useState('');

  const [operatorForm, setOperatorForm] = useState({
    operator_id: 'ops_lead',
    display_name: 'Ops Lead',
    role: 'admin',
  });
  const [sshProfileForm, setSshProfileForm] = useState({
    profile_id: 'ops',
    label: 'Ops SSH Profile',
    ssh_user: '',
    ssh_port: '22',
    ssh_key_path: '',
    remote_root: '/opt/synergy',
  });
  const [bindingForm, setBindingForm] = useState({
    machine_id: 'machine-01',
    profile_id: 'ops',
    host_override: '10.50.0.1',
    remote_dir_override: '',
  });
  const [selectedPhysicalMachine, setSelectedPhysicalMachine] = useState('machine-01');
  const [nodeSetupBusy, setNodeSetupBusy] = useState(false);
  const [nodeSetupSummary, setNodeSetupSummary] = useState('');

  const [terminalCwd, setTerminalCwd] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalLines, setTerminalLines] = useState([]);

  const addTerminalLine = (kind, text) => {
    if (!String(text || '').trim()) return;
    setTerminalLines((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind,
        text: String(text),
        at: nowLabel(),
      },
    ]);
  };

  useEffect(() => {
    terminalScrollRef.current?.scrollTo({
      top: terminalScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [terminalLines]);

  const refreshSecurityState = async () => {
    const data = await invoke('get_monitor_security_state');
    setSecurityState(data);
    return data;
  };

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      setError('');
      try {
        await invoke('monitor_initialize_workspace');
        const [workspace, state] = await Promise.all([
          invoke('get_monitor_workspace_path'),
          refreshSecurityState(),
        ]);
        const resolvedWorkspace = String(workspace || '');
        setWorkspacePath(resolvedWorkspace);
        setTerminalCwd(resolvedWorkspace);

        const topologyMessage = await invoke('monitor_apply_eight_machine_topology');
        addTerminalLine('success', String(topologyMessage || 'Applied topology mapping.'));

        const defaultKeyPath = `${resolvedWorkspace}/keys/ssh/ops_ed25519`;
        setSshProfileForm((prev) => ({
          ...prev,
          ssh_key_path: defaultKeyPath,
          ssh_user: prev.ssh_user || 'ops',
        }));

        const activeOperator = (state?.operators || []).find((entry) => entry.operator_id === state?.active_operator_id);
        if (activeOperator) {
          setOperatorForm({
            operator_id: activeOperator.operator_id,
            display_name: activeOperator.display_name,
            role: activeOperator.role,
          });
        }

        addTerminalLine('info', 'Embedded terminal ready. Run commands here to prepare SSH keys and verify environment.');
        addTerminalLine('info', `Working directory: ${resolvedWorkspace}`);
      } catch (setupError) {
        setError(String(setupError));
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  const activeMachineSet = useMemo(() => new Set(ACTIVE_MACHINE_PLAN.map((entry) => entry.machineId)), []);
  const sshProfiles = securityState?.ssh_profiles || [];
  const machineBindings = securityState?.machine_bindings || [];

  const runTerminalCommand = async (rawCommand) => {
    const command = String(rawCommand || '').trim();
    if (!command || terminalBusy) return;

    setTerminalBusy(true);
    addTerminalLine('prompt', `${terminalCwd || '~'} $ ${command}`);

    try {
      const cdOnlyMatch = command.match(/^cd(?:\s+(.+))?$/i);
      if (cdOnlyMatch) {
        const target = (cdOnlyMatch[1] || '~').trim();
        const resolveCommand = target === '~' ? 'cd ~ && pwd' : `cd ${target} && pwd`;
        const result = await invoke('monitor_run_terminal_command', {
          command: resolveCommand,
          cwd: terminalCwd || null,
        });
        if (result.success) {
          const lines = normalizeOutputLines(result.stdout);
          const updatedCwd = lines[lines.length - 1] || terminalCwd;
          setTerminalCwd(updatedCwd);
          addTerminalLine('success', updatedCwd);
        } else {
          addTerminalLine('error', result.stderr || `cd failed (exit ${result.exit_code})`);
        }
        return;
      }

      const result = await invoke('monitor_run_terminal_command', {
        command,
        cwd: terminalCwd || null,
      });

      if (result.cwd) {
        setTerminalCwd(String(result.cwd));
      }

      const stdoutLines = normalizeOutputLines(result.stdout);
      const stderrLines = normalizeOutputLines(result.stderr);
      stdoutLines.forEach((line) => addTerminalLine('output', line));
      stderrLines.forEach((line) => addTerminalLine('error', line));

      if (command.toLowerCase() === 'whoami' && result.success && stdoutLines.length > 0) {
        const detected = stdoutLines[0].trim();
        setLastWhoami(detected);
        setSshProfileForm((prev) => ({
          ...prev,
          ssh_user: detected || prev.ssh_user,
        }));
      }

      if (!result.success && stderrLines.length === 0) {
        addTerminalLine('error', `Command failed with exit code ${result.exit_code}`);
      }
    } catch (runError) {
      addTerminalLine('error', String(runError));
    } finally {
      setTerminalBusy(false);
    }
  };

  const submitTerminal = async (event) => {
    event.preventDefault();
    const command = terminalInput.trim();
    if (!command) return;
    setTerminalInput('');
    await runTerminalCommand(command);
  };

  const saveOperatorProfile = async () => {
    setError('');
    try {
      const payload = {
        operator_id: String(operatorForm.operator_id || '').trim().toLowerCase(),
        display_name: String(operatorForm.display_name || '').trim(),
        role: String(operatorForm.role || 'admin').trim().toLowerCase(),
      };
      if (!payload.operator_id || !payload.display_name) {
        throw new Error('operator_id and display_name are required.');
      }
      await invoke('monitor_upsert_operator', { input: payload });
      await invoke('monitor_set_active_operator', { operatorId: payload.operator_id });
      await refreshSecurityState();
      setStep(2);
    } catch (saveError) {
      setError(String(saveError));
    }
  };

  const saveSshProfile = async () => {
    setError('');
    try {
      const payload = {
        profile_id: String(sshProfileForm.profile_id || '').trim().toLowerCase(),
        label: String(sshProfileForm.label || '').trim(),
        ssh_user: String(sshProfileForm.ssh_user || '').trim(),
        ssh_port: Number(sshProfileForm.ssh_port || 22),
        ssh_key_path: String(sshProfileForm.ssh_key_path || '').trim() || null,
        remote_root: String(sshProfileForm.remote_root || '').trim() || null,
        strict_host_key_checking: null,
        extra_ssh_args: null,
      };
      if (!payload.profile_id || !payload.label || !payload.ssh_user) {
        throw new Error('profile_id, label, and ssh_user are required.');
      }
      await invoke('monitor_upsert_ssh_profile', { input: payload });
      const updated = await refreshSecurityState();
      setBindingForm((prev) => ({
        ...prev,
        profile_id: payload.profile_id,
      }));
      if ((updated?.ssh_profiles || []).length > 0) {
        setStep(4);
      }
    } catch (saveError) {
      setError(String(saveError));
    }
  };

  const bindMachineProfile = async () => {
    setError('');
    try {
      const selectedMachine = String(bindingForm.machine_id || '').trim();
      const logicalNodes = PHYSICAL_TO_LOGICAL_NODE_MAP[selectedMachine] || [selectedMachine];
      const basePayload = {
        profile_id: String(bindingForm.profile_id || '').trim().toLowerCase(),
        host_override: String(bindingForm.host_override || '').trim() || null,
        remote_dir_override: String(bindingForm.remote_dir_override || '').trim() || null,
      };
      if (!selectedMachine || !basePayload.profile_id) {
        throw new Error('machine_id and profile_id are required.');
      }

      for (const logicalMachineId of logicalNodes) {
        const payload = {
          ...basePayload,
          machine_id: logicalMachineId,
        };
        await invoke('monitor_assign_machine_ssh_profile', { input: payload });
      }
      await refreshSecurityState();
      setStep(5);
    } catch (bindError) {
      setError(String(bindError));
    }
  };

  const runLocalNodeSetup = async () => {
    setError('');
    setNodeSetupBusy(true);
    setNodeSetupSummary('');
    try {
      const topologyMessage = await invoke('monitor_apply_eight_machine_topology');
      addTerminalLine('success', String(topologyMessage || 'Applied topology mapping.'));

      const selectedMachine = selectedPhysicalMachine;
      const logicalNodes = PHYSICAL_TO_LOGICAL_NODE_MAP[selectedPhysicalMachine] || [];
      if (logicalNodes.length === 0) {
        throw new Error(`No logical node mapping found for ${selectedPhysicalMachine}`);
      }

      const hostOverride = String(bindingForm.host_override || '').trim() || PHYSICAL_MACHINE_VPN_IP[selectedMachine] || '';
      for (const logicalMachineId of logicalNodes) {
        await invoke('monitor_assign_machine_ssh_profile', {
          input: {
            machine_id: logicalMachineId,
            profile_id: String(bindingForm.profile_id || '').trim().toLowerCase() || 'ops',
            host_override: hostOverride || null,
            remote_dir_override: String(bindingForm.remote_dir_override || '').trim() || null,
          },
        });
      }
      await refreshSecurityState();

      addTerminalLine(
        'info',
        `Starting local node setup for ${selectedPhysicalMachine}: ${logicalNodes.join(', ')}`,
      );

      const basePath = `${workspacePath}/devnet/lean15/installers`;
      for (const logicalMachineId of logicalNodes) {
        const installScript = `${basePath}/${logicalMachineId}/install_and_start.sh`;
        const command = `bash "${installScript}"`;
        await runTerminalCommand(command);
      }

      const summary = `Completed setup commands for ${selectedPhysicalMachine} node slots: ${logicalNodes.join(', ')}`;
      setNodeSetupSummary(summary);
      addTerminalLine('success', summary);
    } catch (setupError) {
      setError(String(setupError));
    } finally {
      setNodeSetupBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="wizard-shell">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Preparing setup wizard...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="wizard-shell">
      <div className="wizard-top">
        <article className="wizard-main-panel">
          <header className="wizard-title-block">
            <h2>Synergy Devnet Control Center Setup Wizard</h2>
            <p>
              Complete operator onboarding, SSH profile configuration, and machine binding.
              WireGuard setup is skipped because mesh VPN is already online.
            </p>
            <p>
              Workspace:
              {' '}
              <code>{workspacePath}</code>
            </p>
          </header>

          <div className="wizard-stepper">
            {STEPS.map((entry) => (
              <div
                key={entry.id}
                className={`wizard-step-pill ${step === entry.id ? 'active' : ''} ${step > entry.id ? 'done' : ''}`}
              >
                <span>{entry.id}</span>
                <strong>{entry.title}</strong>
              </div>
            ))}
          </div>

          {step === 1 ? (
            <div className="wizard-section">
              <h3>Step 1: Create Active Operator</h3>
              <p>
                This operator identity controls RBAC for all start/stop/setup actions.
              </p>
              <div className="wizard-form-grid">
                <label>
                  Operator ID
                  <input
                    value={operatorForm.operator_id}
                    onChange={(event) => setOperatorForm((prev) => ({ ...prev, operator_id: event.target.value }))}
                    placeholder="ops_lead"
                  />
                </label>
                <label>
                  Display Name
                  <input
                    value={operatorForm.display_name}
                    onChange={(event) => setOperatorForm((prev) => ({ ...prev, display_name: event.target.value }))}
                    placeholder="Ops Lead"
                  />
                </label>
                <label>
                  Role
                  <select
                    value={operatorForm.role}
                    onChange={(event) => setOperatorForm((prev) => ({ ...prev, role: event.target.value }))}
                  >
                    <option value="admin">admin</option>
                    <option value="operator">operator</option>
                    <option value="viewer">viewer</option>
                  </select>
                </label>
              </div>
              <div className="wizard-action-row">
                <button className="monitor-btn monitor-btn-primary" onClick={saveOperatorProfile}>
                  Save Operator And Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="wizard-section">
              <h3>Step 2: Run SSH Setup Commands</h3>
              <p>
                Use the terminal below. If you do not know your username, run
                {' '}
                <code>whoami</code>
                .
              </p>
              <ol className="wizard-instruction-list">
                <li>Run <code>whoami</code> to detect local username (auto-fills SSH user).</li>
                <li>
                  Run
                  {' '}
                  <code>{`cd "${workspacePath}"`}</code>
                  {' '}
                  to enter the control center workspace.
                </li>
                <li>Run <code>mkdir -p keys/ssh</code>.</li>
                <li>
                  Run
                  {' '}
                  <code>ssh-keygen -t ed25519 -a 64 -f keys/ssh/ops_ed25519 -C "devnet-ops" -N ""</code>
                  {' '}
                  to create keys without interactive prompts.
                </li>
                <li>Run <code>ls -lah keys/ssh</code> and verify private/public key files exist.</li>
              </ol>
              <div className="wizard-action-row">
                <button className="monitor-btn monitor-btn-primary" onClick={() => setStep(3)}>
                  Continue To SSH Profile
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="wizard-section">
              <h3>Step 3: Configure SSH Profile</h3>
              <p>Recommended values are prefilled. Update only if your environment differs.</p>
              <div className="wizard-form-grid">
                <label>
                  Profile ID
                  <input
                    value={sshProfileForm.profile_id}
                    onChange={(event) => setSshProfileForm((prev) => ({ ...prev, profile_id: event.target.value }))}
                    placeholder="ops"
                  />
                </label>
                <label>
                  Label
                  <input
                    value={sshProfileForm.label}
                    onChange={(event) => setSshProfileForm((prev) => ({ ...prev, label: event.target.value }))}
                    placeholder="Ops SSH Profile"
                  />
                </label>
                <label>
                  SSH User
                  <input
                    value={sshProfileForm.ssh_user}
                    onChange={(event) => setSshProfileForm((prev) => ({ ...prev, ssh_user: event.target.value }))}
                    placeholder="ops"
                  />
                </label>
                <label>
                  SSH Port
                  <input
                    value={sshProfileForm.ssh_port}
                    onChange={(event) => setSshProfileForm((prev) => ({ ...prev, ssh_port: event.target.value }))}
                    placeholder="22"
                  />
                </label>
                <label>
                  SSH Key Path
                  <input
                    value={sshProfileForm.ssh_key_path}
                    onChange={(event) => setSshProfileForm((prev) => ({ ...prev, ssh_key_path: event.target.value }))}
                    placeholder={`${workspacePath}/keys/ssh/ops_ed25519`}
                  />
                </label>
                <label>
                  Remote Root
                  <input
                    value={sshProfileForm.remote_root}
                    onChange={(event) => setSshProfileForm((prev) => ({ ...prev, remote_root: event.target.value }))}
                    placeholder="/opt/synergy"
                  />
                </label>
              </div>
              {lastWhoami ? (
                <p className="wizard-note">
                  Detected username from terminal:
                  {' '}
                  <strong>{lastWhoami}</strong>
                </p>
              ) : null}
              <div className="wizard-action-row">
                <button className="monitor-btn monitor-btn-primary" onClick={saveSshProfile}>
                  Save SSH Profile And Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="wizard-section">
              <h3>Step 4: Bind SSH Profile To Machine</h3>
              <p>
                Machine options are
                {' '}
                <code>machine-01</code>
                {' '}
                through
                {' '}
                <code>machine-13</code>
                . Active deployment currently uses
                {' '}
                <code>machine-01</code>
                {' '}
                through
                {' '}
                <code>machine-08</code>
                .
              </p>
              <div className="wizard-form-grid">
                <label>
                  Machine ID
                  <select
                    value={bindingForm.machine_id}
                    onChange={(event) => {
                      const nextMachineId = event.target.value;
                      setBindingForm((prev) => ({
                        ...prev,
                        machine_id: nextMachineId,
                        host_override: PHYSICAL_MACHINE_VPN_IP[nextMachineId] || prev.host_override,
                      }));
                      if (PHYSICAL_MACHINE_VPN_IP[nextMachineId]) {
                        setSelectedPhysicalMachine(nextMachineId);
                      }
                    }}
                  >
                    {MACHINE_OPTIONS.map((machineId) => (
                      <option key={machineId} value={machineId}>
                        {machineId}
                        {activeMachineSet.has(machineId) ? ' (active)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  SSH Profile
                  <select
                    value={bindingForm.profile_id}
                    onChange={(event) => setBindingForm((prev) => ({ ...prev, profile_id: event.target.value }))}
                  >
                    {sshProfiles.map((profile) => (
                      <option key={profile.profile_id} value={profile.profile_id}>
                        {profile.profile_id}
                        {' '}
                        ({profile.ssh_user}@:{profile.ssh_port})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Host Override
                  <input
                    value={bindingForm.host_override}
                    onChange={(event) => setBindingForm((prev) => ({ ...prev, host_override: event.target.value }))}
                    placeholder="10.50.0.x or hostname"
                  />
                </label>
                <label>
                  Remote Dir Override
                  <input
                    value={bindingForm.remote_dir_override}
                    onChange={(event) => setBindingForm((prev) => ({ ...prev, remote_dir_override: event.target.value }))}
                    placeholder="/opt/synergy/machine-01"
                  />
                </label>
              </div>
              <div className="wizard-action-row">
                <button className="monitor-btn monitor-btn-primary" onClick={bindMachineProfile}>
                  Bind Physical Machine Nodes And Continue
                </button>
                <button className="monitor-btn" onClick={() => setStep(5)}>
                  Skip Binding And Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="wizard-section">
              <h3>Step 5: Local Node Setup</h3>
              <p>
                Deploy node slots for this physical machine now. WireGuard is already online, so this
                stage runs local installer scripts only.
              </p>
              <div className="wizard-form-grid">
                <label>
                  Physical Machine
                  <select
                    value={selectedPhysicalMachine}
                    onChange={(event) => {
                      const nextMachineId = event.target.value;
                      setSelectedPhysicalMachine(nextMachineId);
                      setBindingForm((prev) => ({
                        ...prev,
                        machine_id: nextMachineId,
                        host_override: PHYSICAL_MACHINE_VPN_IP[nextMachineId] || prev.host_override,
                      }));
                    }}
                  >
                    {ACTIVE_MACHINE_PLAN.map((entry) => (
                      <option key={entry.machineId} value={entry.machineId}>
                        {entry.machineId}
                        {' '}
                        ({entry.primaryRole}
                        {entry.secondaryRole ? ` + ${entry.secondaryRole}` : ''})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Logical Node Slots
                  <input
                    value={(PHYSICAL_TO_LOGICAL_NODE_MAP[selectedPhysicalMachine] || []).join(', ')}
                    readOnly
                  />
                </label>
              </div>
              {nodeSetupSummary ? (
                <p className="wizard-note">
                  <strong>{nodeSetupSummary}</strong>
                </p>
              ) : null}
              <div className="wizard-action-row">
                <button
                  className="monitor-btn monitor-btn-primary"
                  onClick={runLocalNodeSetup}
                  disabled={nodeSetupBusy}
                >
                  {nodeSetupBusy ? 'Running Setup...' : 'Run Local Node Setup'}
                </button>
                <button
                  className="monitor-btn"
                  onClick={() => setStep(6)}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 6 ? (
            <div className="wizard-section">
              <h3>Setup Ready</h3>
              <p>
                You can now open the dashboard. If this machine has multiple assigned node slots,
                verify each reports
                {' '}
                <code>online</code>
                {' '}
                after setup.
              </p>
              <div className="wizard-action-row">
                <button
                  className="monitor-btn monitor-btn-primary"
                  onClick={onComplete}
                >
                  Enter Control Center
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="monitor-error-box">
              <strong>Setup Error:</strong>
              {' '}
              {error}
            </div>
          ) : null}
        </article>

        <aside className="wizard-side-panel">
          <h3>Active 8-Machine Topology</h3>
          <p>Validators are fixed on machine-01 through machine-05.</p>
          <div className="wizard-plan-table-wrap">
            <table className="wizard-plan-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>VPN IP</th>
                  <th>Primary</th>
                  <th>Secondary</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVE_MACHINE_PLAN.map((entry) => (
                  <tr key={entry.machineId}>
                    <td>{entry.machineId}</td>
                    <td>{entry.vpnIp}</td>
                    <td>{entry.primaryRole}</td>
                    <td>{entry.secondaryRole}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="wizard-side-notes">
            <p>
              Active operator:
              {' '}
              <strong>{securityState?.active_operator_id || 'N/A'}</strong>
            </p>
            <p>
              SSH profiles:
              {' '}
              <strong>{sshProfiles.length}</strong>
            </p>
            <p>
              Machine bindings:
              {' '}
              <strong>{machineBindings.length}</strong>
            </p>
          </div>
        </aside>
      </div>

      <div className="wizard-terminal-panel">
        <div className="wizard-terminal-header">
          <span>Setup Terminal</span>
          <code>{terminalCwd || '~'}</code>
        </div>
        <div className="wizard-terminal-body" ref={terminalScrollRef}>
          {terminalLines.map((line) => (
            <div key={line.id} className={`wizard-terminal-line ${line.kind}`}>
              <span className="wizard-terminal-time">{line.at}</span>
              <span className="wizard-terminal-text">{line.text}</span>
            </div>
          ))}
        </div>
        <form className="wizard-terminal-input-row" onSubmit={submitTerminal}>
          <span className="wizard-terminal-prompt">$</span>
          <input
            value={terminalInput}
            onChange={(event) => setTerminalInput(event.target.value)}
            placeholder="Run command (example: whoami)"
            disabled={terminalBusy}
          />
          <button className="monitor-btn" type="submit" disabled={terminalBusy || !terminalInput.trim()}>
            Run
          </button>
        </form>
      </div>
    </section>
  );
}

export default InitialSetupWizard;

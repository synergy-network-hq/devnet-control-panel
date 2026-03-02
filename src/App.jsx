import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Layout from './components/Layout';
import NetworkMonitorDashboard from './components/NetworkMonitorDashboard';
import NetworkMonitorNodePage from './components/NetworkMonitorNodePage';
import HelpArticlesPage from './components/HelpArticlesPage';
import OperatorConfigurationPage from './components/OperatorConfigurationPage';
import InitialSetupWizard from './components/InitialSetupWizard';
import StartupLoadingScreen from './components/StartupLoadingScreen';
import { Navigate, Route, Routes } from 'react-router-dom';

const SPLASH_DURATION_MS = 6000;
const SPLASH_FADE_OUT_MS = 800;
const REQUIRED_LOGICAL_MACHINE_IDS = [
  'machine-01',
  'machine-02',
  'machine-03',
  'machine-04',
  'machine-05',
  'machine-06',
  'machine-07',
  'machine-08',
  'machine-09',
  'machine-10',
  'machine-11',
  'machine-12',
  'machine-13',
  'machine-14',
  'machine-15',
];

function App() {
  const [progress, setProgress] = useState(0);
  const [splashPhase, setSplashPhase] = useState('showing');
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupStateReady, setSetupStateReady] = useState(false);

  useEffect(() => {
    let raf = null;
    let fadeTimer = null;
    const start = performance.now();

    const tick = (timestamp) => {
      const elapsed = timestamp - start;
      const ratio = Math.min(elapsed / SPLASH_DURATION_MS, 1);
      setProgress(Math.round(ratio * 100));
      if (ratio < 1) {
        raf = window.requestAnimationFrame(tick);
      } else {
        setSplashPhase('fading');
        fadeTimer = window.setTimeout(() => {
          setSplashPhase('hidden');
        }, SPLASH_FADE_OUT_MS);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (fadeTimer) window.clearTimeout(fadeTimer);
    };
  }, []);

  useEffect(() => {
    if (splashPhase !== 'hidden') {
      return;
    }

    const resolveSetupState = async () => {
      try {
        await invoke('monitor_initialize_workspace');
        await invoke('monitor_apply_eight_machine_topology');
        const state = await invoke('get_monitor_security_state');
        const sshProfiles = Array.isArray(state?.ssh_profiles) ? state.ssh_profiles : [];
        const machineBindings = Array.isArray(state?.machine_bindings) ? state.machine_bindings : [];
        const bindingSet = new Set(
          machineBindings
            .map((binding) => String(binding?.machine_id || '').toLowerCase())
            .filter((value) => value.length > 0),
        );
        const allLogicalMachinesBound = REQUIRED_LOGICAL_MACHINE_IDS.every((machineId) =>
          bindingSet.has(machineId.toLowerCase()),
        );
        setSetupComplete(sshProfiles.length > 0 && allLogicalMachinesBound);
      } catch (error) {
        setSetupComplete(false);
      } finally {
        setSetupStateReady(true);
      }
    };

    resolveSetupState();
  }, [splashPhase]);

  const handleSetupComplete = () => {
    setSetupComplete(true);
    setSetupStateReady(true);
  };

  if (splashPhase !== 'hidden') {
    return <StartupLoadingScreen progress={progress} phase={splashPhase} />;
  }

  if (!setupStateReady) {
    return (
      <section className="wizard-shell">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Checking setup state...</p>
        </div>
      </section>
    );
  }

  if (!setupComplete) {
    return <InitialSetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<NetworkMonitorDashboard />} />
        <Route path="/settings" element={<OperatorConfigurationPage />} />
        <Route path="/node/:machineId" element={<NetworkMonitorNodePage />} />
        <Route path="/help" element={<HelpArticlesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;

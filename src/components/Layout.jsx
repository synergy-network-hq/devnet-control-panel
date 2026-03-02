import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { openHelpWindow } from '../lib/helpWindow';
import { checkAndInstallAppUpdate } from '../lib/appUpdater';

function Layout({ children }) {
  const location = useLocation();
  const onHelpRoute = location.pathname === '/help';
  const onSettingsRoute = location.pathname === '/settings';
  const [updateStatus, setUpdateStatus] = useState('');
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  const onCheckUpdates = async () => {
    setCheckingUpdates(true);
    setUpdateStatus('Checking for updates...');
    const result = await checkAndInstallAppUpdate();
    setUpdateStatus(result.message);
    setCheckingUpdates(false);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-brand">
            <div className="logo-container">
              <img
                src="/snrg.gif"
                alt="Synergy Logo"
                className="logo-icon-bg"
              />
              <span className="brand-title">Synergy Devnet Control Center</span>
            </div>
          </div>

          <div className="header-right-controls">
            <Link className="btn-header" to={onSettingsRoute ? '/' : '/settings'}>
              {onSettingsRoute ? 'Dashboard' : 'Settings'}
            </Link>
            <button
              className="btn-header"
              onClick={onCheckUpdates}
              disabled={checkingUpdates}
            >
              {checkingUpdates ? 'Checking...' : 'Check Updates'}
            </button>
            <button className="btn-header btn-help" onClick={openHelpWindow}>
              {onHelpRoute ? 'Help Window' : 'Help'}
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        {updateStatus ? <span>{updateStatus}</span> : null}
        <span className="footer-copyright">© 2026 Synergy Network Devnet Operations</span>
        <span className="footer-version">Control Center v1.0.0</span>
      </footer>
    </div>
  );
}

export default Layout;

import React from 'react';
import { useLocation } from 'react-router-dom';
import { openHelpWindow } from '../lib/helpWindow';

function Layout({ children }) {
  const location = useLocation();
  const onHelpRoute = location.pathname === '/help';

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
              <span className="brand-title">Synergy Node Monitor</span>
            </div>
          </div>

          <div className="header-right-controls">
            <button className="btn-header btn-help" onClick={openHelpWindow}>
              {onHelpRoute ? 'Help Window' : 'Help'}
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <span className="footer-copyright">© 2026 Synergy Network Devnet Operations</span>
        <span className="footer-version">Monitor v1.0.0</span>
      </footer>
    </div>
  );
}

export default Layout;

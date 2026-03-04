import '../styles/sxcp.css';

function SXCPDashboard() {
  return (
    <section className="sxcp-shell">
      <div className="sxcp-toolbar">
        <div className="sxcp-toolbar-left">
          <h2>SXCP Cross-Chain Protocol Dashboard</h2>
          <p className="sxcp-subtitle">Synergy cross-chain protocol infrastructure</p>
        </div>
      </div>

      <div className="sxcp-pending-container">
        <div className="sxcp-pending-card">
          <div className="sxcp-pending-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h3>External Testnet Integration Pending</h3>
          <p>
            Cross-chain protocol connections to external testnets (Sepolia, Amoy) are not yet
            configured. This dashboard will display live SXCP protocol data once the external
            testnet setup is complete.
          </p>

          <div className="sxcp-chain-status-list">
            <div className="sxcp-chain-status-row">
              <span className="sxcp-chain-name">Sepolia (Ethereum Testnet)</span>
              <span className="sxcp-status-badge sxcp-status-pending">Not Connected</span>
            </div>
            <div className="sxcp-chain-status-row">
              <span className="sxcp-chain-name">Amoy (Polygon Testnet)</span>
              <span className="sxcp-status-badge sxcp-status-pending">Not Connected</span>
            </div>
          </div>

          <p className="sxcp-pending-note">
            Gateway contracts and attestation store deployments are pending. Node role
            assignments (Relayer, Verifier/Coordinator, Oracle, Witness) will be configured
            once the external testnet setup is complete.
          </p>
        </div>
      </div>
    </section>
  );
}

export default SXCPDashboard;

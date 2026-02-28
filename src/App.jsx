import Layout from './components/Layout';
import NetworkMonitorDashboard from './components/NetworkMonitorDashboard';
import NetworkMonitorNodePage from './components/NetworkMonitorNodePage';
import HelpArticlesPage from './components/HelpArticlesPage';
import OperatorConfigurationPage from './components/OperatorConfigurationPage';
import JarvisAgentSetup from './components/JarvisAgentSetup';
import { Navigate, Route, Routes } from 'react-router-dom';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<NetworkMonitorDashboard />} />
        <Route path="/settings" element={<OperatorConfigurationPage />} />
        <Route path="/jarvis" element={<JarvisAgentSetup />} />
        <Route path="/node/:machineId" element={<NetworkMonitorNodePage />} />
        <Route path="/help" element={<HelpArticlesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;

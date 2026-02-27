import Layout from './components/Layout';
import NetworkMonitorDashboard from './components/NetworkMonitorDashboard';
import NetworkMonitorNodePage from './components/NetworkMonitorNodePage';
import HelpArticlesPage from './components/HelpArticlesPage';
import { Navigate, Route, Routes } from 'react-router-dom';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<NetworkMonitorDashboard />} />
        <Route path="/node/:machineId" element={<NetworkMonitorNodePage />} />
        <Route path="/help" element={<HelpArticlesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;

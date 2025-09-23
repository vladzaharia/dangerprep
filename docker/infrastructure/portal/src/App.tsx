import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import { Navigation } from './components/Navigation';
import { QRCodePage, ServicesPage, MaintenanceServicesPage, PowerPage } from './pages';

// Service configuration type
export interface Service {
  name: string;
  icon: string;
  url?: string;
  description: string;
  type?: 'public' | 'private' | 'maintenance';
  status?: 'healthy' | 'warning' | 'error';
  version?: string;
}

const App: React.FC = () => {
  return (
    <Router>
      {/* Main Layout using wa-flank for sidebar + content */}
      <div className="wa-flank app-layout">
        {/* Navigation Sidebar - Background Layer */}
        <Navigation />

        {/* Main Content Area - Raised Layer */}
        <main className="app-content">
          <div className="app-content-inner">
            <Routes>
              <Route path="/" element={<QRCodePage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/maintenance" element={<MaintenanceServicesPage />} />
              <Route path="/power" element={<PowerPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
};

export default App;

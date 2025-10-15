import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import { Navigation } from './components/Navigation';
import { DefaultRoute } from './components/DefaultRoute';
import { QRCodePage, ServicesPage, MaintenanceServicesPage, PowerPage, NetworkStatusPage } from './pages';

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

/**
 * Global loading fallback for the entire app
 */
function AppLoadingFallback() {
  return (
    <div className="wa-flank app-layout">
      <div className="app-content">
        <div className="app-content-inner">
          <div className="wa-stack wa-gap-xl">
            {/* Page title skeleton */}
            <wa-skeleton effect="sheen" style={{ width: '240px', height: '36px' }}></wa-skeleton>
            {/* Main content area skeleton */}
            <wa-skeleton effect="sheen" style={{ width: '100%', height: '300px', borderRadius: '8px' }}></wa-skeleton>
          </div>
        </div>
      </div>
    </div>
  );
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
            <Suspense fallback={<AppLoadingFallback />}>
              <Routes>
                {/* Modern React 19 routes with Suspense */}
                <Route path="/" element={<DefaultRoute />} />
                <Route path="/qr" element={<QRCodePage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/maintenance" element={<MaintenanceServicesPage />} />
                <Route path="/power" element={<PowerPage />} />
                <Route path="/network" element={<NetworkStatusPage />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </Router>
  );
};

export default App;

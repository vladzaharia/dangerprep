import React, { Suspense, lazy } from 'react';
import { useIdleTimer } from 'react-idle-timer';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { Navigation, DefaultRoute } from './components';

// Lazy load page components for better code splitting
const QRCodePage = lazy(() => import('./pages/QRCodePage').then(m => ({ default: m.QRCodePage })));
const ServicesPage = lazy(() => import('./pages/ServicesPage').then(m => ({ default: m.ServicesPage })));
const MaintenanceServicesPage = lazy(() => import('./pages/MaintenanceServicesPage').then(m => ({ default: m.MaintenanceServicesPage })));
const PowerPage = lazy(() => import('./pages/PowerPage').then(m => ({ default: m.PowerPage })));
const NetworkStatusPage = lazy(() => import('./pages/NetworkStatusPage').then(m => ({ default: m.NetworkStatusPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const TailscaleSettingsPage = lazy(() => import('./pages/TailscaleSettingsPage').then(m => ({ default: m.TailscaleSettingsPage })));

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
    <div className='wa-flank app-layout'>
      <div className='app-content'>
        <div className='app-content-inner'>
          <div className='wa-stack wa-gap-xl'>
            {/* Page title skeleton */}
            <wa-skeleton effect='sheen' style={{ width: '240px', height: '36px' }}></wa-skeleton>
            {/* Main content area skeleton */}
            <wa-skeleton
              effect='sheen'
              style={{ width: '100%', height: '300px', borderRadius: '8px' }}
            ></wa-skeleton>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * AppContent component that handles inactivity reset
 * Must be inside Router to use navigation hooks
 */
function AppContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Auto-reset to homepage after 5 minutes (300000ms) of inactivity
  useIdleTimer({
    timeout: 300000, // 5 minutes
    onIdle: () => {
      // Preserve search params (including kiosk mode)
      const queryString = searchParams.toString();
      const searchParamString = queryString ? `?${queryString}` : '';
      // Navigate to homepage (which will redirect to /qr or /services based on kiosk mode)
      navigate(`/${searchParamString}`, { replace: true });
    },
    // Events to listen for user activity
    events: ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'],
    // Throttle events to improve performance
    eventsThrottle: 200,
  });

  return (
    <>
      {/* Main Layout using wa-flank for sidebar + content */}
      <div className='wa-flank app-layout'>
        {/* Navigation Sidebar - Background Layer */}
        <Navigation />

        {/* Main Content Area - Raised Layer */}
        <main className='app-content'>
          <div className='app-content-inner'>
            <Suspense fallback={<AppLoadingFallback />}>
              <Routes>
                {/* Modern React 19 routes with Suspense */}
                <Route path='/' element={<DefaultRoute />} />
                <Route path='/qr' element={<QRCodePage />} />
                <Route path='/services' element={<ServicesPage />} />
                <Route path='/maintenance' element={<MaintenanceServicesPage />} />
                <Route path='/power' element={<PowerPage />} />
                <Route path='/network' element={<NetworkStatusPage />} />
                <Route path='/settings' element={<SettingsPage />} />
                <Route path='/tailscale' element={<TailscaleSettingsPage />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </>
  );
}

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;

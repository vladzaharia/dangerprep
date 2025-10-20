import React, { Suspense, lazy } from 'react';
import { useIdleTimer } from 'react-idle-timer';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { Navigation, DefaultRoute, ErrorBoundary, FooterNavigation } from './components';
import { useFooterNavigation } from './hooks/useFooterNavigation';
import { NotFoundPage } from './pages';

// Lazy load page components for better code splitting
const QRCodePage = lazy(() => import('./pages/QRCodePage').then(m => ({ default: m.QRCodePage })));
const ServicesPage = lazy(() =>
  import('./pages/ServicesPage').then(m => ({ default: m.ServicesPage }))
);
const MaintenanceServicesPage = lazy(() =>
  import('./pages/MaintenanceServicesPage').then(m => ({ default: m.MaintenanceServicesPage }))
);
const PowerPage = lazy(() => import('./pages/PowerPage').then(m => ({ default: m.PowerPage })));
const NetworkStatusPage = lazy(() =>
  import('./pages/NetworkStatusPage').then(m => ({ default: m.NetworkStatusPage }))
);
const ConnectedClientsPage = lazy(() =>
  import('./pages/ConnectedClientsPage').then(m => ({ default: m.ConnectedClientsPage }))
);
const TailscaleStatusPage = lazy(() =>
  import('./pages/TailscaleStatusPage').then(m => ({ default: m.TailscaleStatusPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage }))
);
const TailscaleSettingsPage = lazy(() =>
  import('./pages/TailscaleSettingsPage').then(m => ({ default: m.TailscaleSettingsPage }))
);
const WifiSettingsPage = lazy(() =>
  import('./pages/WifiSettingsPage').then(m => ({ default: m.WifiSettingsPage }))
);
const HotspotSettingsPage = lazy(() =>
  import('./pages/HotspotSettingsPage').then(m => ({ default: m.HotspotSettingsPage }))
);
const InternetSettingsPage = lazy(() =>
  import('./pages/InternetSettingsPage').then(m => ({ default: m.InternetSettingsPage }))
);
const StarlinkSettingsPage = lazy(() =>
  import('./pages/StarlinkSettingsPage').then(m => ({ default: m.StarlinkSettingsPage }))
);
const DeviceSettingsPage = lazy(() =>
  import('./pages/DeviceSettingsPage').then(m => ({ default: m.DeviceSettingsPage }))
);

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

// Idle timeout configuration
// The timer automatically resets on EACH user interaction, so this is
// 5 minutes from the LAST interaction, not from page load
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * AppContent component that handles inactivity reset
 * Must be inside Router to use navigation hooks
 */
function AppContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { shouldShow: showFooterNav, items: footerItems } = useFooterNavigation();

  // Auto-reset to homepage after 5 minutes of inactivity
  // IMPORTANT: The timer automatically resets on each user interaction
  // This means the user will be redirected 5 minutes after their LAST interaction
  useIdleTimer({
    timeout: IDLE_TIMEOUT_MS,
    onIdle: () => {
      // Preserve search params (including kiosk mode)
      const queryString = searchParams.toString();
      const searchParamString = queryString ? `?${queryString}` : '';
      // Navigate to homepage (which will redirect to /qr or /services based on kiosk mode)
      navigate(`/${searchParamString}`, { replace: true });
    },
    // Optional: Log user activity in development mode for debugging
    onAction: event => {
      if (process.env.NODE_ENV === 'development' && event) {
        // eslint-disable-next-line no-console
        console.log('[IdleTimer] User activity detected:', event.type);
      }
    },
    // Events to listen for user activity - comprehensive list for all interaction types
    // The timer resets whenever any of these events occur
    events: [
      'mousedown', // Mouse clicks
      'mousemove', // Mouse movement
      'keydown', // Keyboard input (replaces deprecated 'keypress')
      'wheel', // Mouse wheel scrolling
      'scroll', // Page scrolling
      'touchstart', // Touch screen taps
      'touchmove', // Touch screen gestures
      'click', // Click events
      'visibilitychange', // Tab becomes visible
    ],
    // Throttle events to improve performance (200ms is a good balance)
    eventsThrottle: 200,
  });

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  // Add search params to footer items
  const footerItemsWithParams = footerItems.map(item => ({
    ...item,
    path: getNavLinkTo(item.path),
  }));

  return (
    <>
      {/* Main Layout using wa-flank for sidebar + content */}
      <div className='wa-flank app-layout'>
        {/* Navigation Sidebar - Background Layer */}
        <Navigation />

        {/* Main Content Area - Raised Layer with optional footer navigation */}
        <main className='app-content'>
          <div className='app-content-wrapper wa-stack wa-gap-none'>
            <div className='app-content-inner'>
              <ErrorBoundary variant='content'>
                <Suspense fallback={<AppLoadingFallback />}>
                  <Routes>
                    {/* Modern React 19 routes with Suspense */}
                    <Route path='/' element={<DefaultRoute />} />
                    <Route path='/qr' element={<QRCodePage />} />
                    <Route path='/services' element={<ServicesPage />} />
                    <Route path='/maintenance' element={<MaintenanceServicesPage />} />
                    <Route path='/power' element={<PowerPage />} />
                    <Route path='/network' element={<NetworkStatusPage />} />
                    <Route path='/network/status' element={<NetworkStatusPage />} />
                    <Route path='/network/clients' element={<ConnectedClientsPage />} />
                    <Route path='/network/tailscale' element={<TailscaleStatusPage />} />
                    <Route path='/settings' element={<SettingsPage />} />
                    <Route path='/tailscale' element={<TailscaleSettingsPage />} />
                    <Route path='/wifi' element={<WifiSettingsPage />} />
                    <Route path='/hotspot' element={<HotspotSettingsPage />} />
                    <Route path='/internet' element={<InternetSettingsPage />} />
                    <Route path='/starlink' element={<StarlinkSettingsPage />} />
                    <Route path='/device' element={<DeviceSettingsPage />} />
                    {/* 404 catch-all route */}
                    <Route path='*' element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </div>
            {showFooterNav && <FooterNavigation items={footerItemsWithParams} />}
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

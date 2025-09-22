import React, { useMemo } from 'react';

import { QRCodeSection } from './components/QRCodeSection';
import { ServiceGrid } from './components/ServiceGrid';
import { useResponsive } from './hooks/useResponsive';

// Service configuration type
export interface Service {
  name: string;
  icon: string;
  url: string;
  description: string;
}

// Check if kiosk mode is enabled
const isKioskMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('kiosk') === 'true';
};

const App: React.FC = () => {
  const { isMobile } = useResponsive();
  const kioskMode = useMemo(() => isKioskMode(), []);

  // Service configuration
  const services: Service[] = useMemo(
    () => [
      {
        name: 'Jellyfin Media Server',
        icon: 'film',
        url: import.meta.env.VITE_JELLYFIN_URL || 'https://jellyfin.danger',
        description: 'Stream movies, TV shows, music, and more',
      },
      {
        name: 'Kiwix',
        icon: 'book',
        url: import.meta.env.VITE_KIWIX_URL || 'https://kiwix.danger',
        description: 'Offline Wikipedia and educational content',
      },
      {
        name: 'Romm',
        icon: 'gamepad-2',
        url: import.meta.env.VITE_ROMM_URL || 'https://romm.danger',
        description: 'Retro gaming library and emulation',
      },
    ],
    []
  );

  return (
    <div className='wa-stack app-container'>
      {/* Header */}
      <header className='app-header'>
        <h1 className='app-title'>DangerPrep Portal</h1>
        <p className='app-subtitle'>Your portable hotspot services</p>
      </header>

      {/* Main Content */}
      <main className='wa-stack wa-gap-2xl app-main'>
        {/* WiFi Connection Section */}
        <section className='wifi-section'>
          <QRCodeSection isKioskMode={kioskMode} />
        </section>

        {/* Services Section */}
        <section className='services-section'>
          <h2 className='services-title'>Available Services</h2>
          <ServiceGrid services={services} isMobile={isMobile} isKioskMode={kioskMode} />
        </section>
      </main>

      {/* Footer */}
      <footer className='app-footer'>
        <p>Powered by DangerPrep</p>
      </footer>
    </div>
  );
};

export default App;

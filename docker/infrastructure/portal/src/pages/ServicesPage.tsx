import React, { useMemo } from 'react';

import type { Service } from '../App';
import { ServiceGrid } from '../components/ServiceGrid';

export const ServicesPage: React.FC = () => {

  // Main services configuration
  const services: Service[] = useMemo(
    () => [
      {
        name: 'Entertainment at Sea',
        icon: 'film',
        url: import.meta.env.VITE_JELLYFIN_URL || 'https://jellyfin.danger',
        description: 'Stream movies, TV shows, and more',
      },
      {
        name: 'Games at Sea',
        icon: 'gamepad',
        url: import.meta.env.VITE_ROMM_URL || 'https://romm.danger',
        description: 'Retro gaming library and emulation',
      },
      {
        name: 'Wikipedia',
        icon: 'book',
        url: import.meta.env.VITE_KIWIX_URL || 'https://kiwix.danger',
        description: 'Offline Wikipedia and educational content',
      },
    ],
    []
  );

  return (
    <div className="wa-stack wa-gap-xl">
      <h2>Available Services</h2>
      <ServiceGrid services={services} />
    </div>
  );
};

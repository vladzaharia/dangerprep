import React, { useMemo } from 'react';

import type { Service } from '../App';
import { ServiceGrid } from '../components/ServiceGrid';
import { getServiceUrls } from '../utils/urlBuilder';

export const ServicesPage: React.FC = () => {

  // Main services configuration with dynamic URL construction
  const services: Service[] = useMemo(() => {
    const serviceUrls = getServiceUrls();

    return [
      {
        name: 'Entertainment at Sea',
        icon: 'film',
        url: serviceUrls.jellyfin,
        description: 'Stream movies, TV shows, and more',
      },
      {
        name: 'Games at Sea',
        icon: 'gamepad',
        url: serviceUrls.romm,
        description: 'Retro gaming library and emulation',
      },
      {
        name: 'Wikipedia',
        icon: 'book',
        url: serviceUrls.kiwix,
        description: 'Offline Wikipedia and educational content',
      },
    ];
  }, []);

  return (
    <div className="wa-stack wa-gap-xl">
      <h2>Available Services</h2>
      <ServiceGrid services={services} />
    </div>
  );
};

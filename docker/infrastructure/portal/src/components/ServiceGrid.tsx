import React from 'react';

import type { Service } from '../App';

import { ServiceCard } from './ServiceCard';

interface ServiceGridProps {
  services: Service[];
  isMobile: boolean;
  isKioskMode: boolean;
}

export const ServiceGrid: React.FC<ServiceGridProps> = ({ services, isMobile, isKioskMode }) => {
  // Use different minimum column sizes for mobile vs desktop
  const minColumnSize = isMobile ? '100%' : '300px';

  return (
    <div
      className='wa-grid wa-gap-m'
      style={{ '--min-column-size': minColumnSize } as React.CSSProperties}
    >
      {services.map(service => (
        <ServiceCard key={service.name} service={service} isKioskMode={isKioskMode} />
      ))}
    </div>
  );
};

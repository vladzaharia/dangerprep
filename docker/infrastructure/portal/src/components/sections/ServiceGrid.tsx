import React from 'react';

import type { Service } from '../../App';
import { ServiceCard } from '../cards/ServiceCard';

interface ServiceGridProps {
  services: Service[];
  pageType?: 'services' | 'maintenance';
}

export const ServiceGrid: React.FC<ServiceGridProps> = ({ services, pageType = 'services' }) => {
  return (
    <div className='wa-grid wa-gap-m service-grid'>
      {services.map(service => (
        <ServiceCard key={service.name} service={service} pageType={pageType} />
      ))}
    </div>
  );
};

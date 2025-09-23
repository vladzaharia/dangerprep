import React from 'react';

import type { Service } from '../App';

import { ServiceCard } from './ServiceCard';

interface ServiceGridProps {
  services: Service[];
}

export const ServiceGrid: React.FC<ServiceGridProps> = ({ services }) => {
  return (
    <div className='wa-grid wa-gap-m service-grid'>
      {services.map(service => (
        <ServiceCard key={service.name} service={service} />
      ))}
    </div>
  );
};

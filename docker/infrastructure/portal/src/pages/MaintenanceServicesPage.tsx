import React, { useMemo } from 'react';

import type { Service } from '../App';
import { ServiceGrid } from '../components/ServiceGrid';

export const MaintenanceServicesPage: React.FC = () => {

  // Maintenance services configuration
  const maintenanceServices: Service[] = useMemo(
    () => [
      {
        name: 'Docmost',
        icon: 'file-text',
        url: import.meta.env.VITE_DOCMOST_URL || 'https://docmost.danger',
        description: 'Documentation and knowledge management',
      },
      {
        name: 'OneDev',
        icon: 'git-branch',
        url: import.meta.env.VITE_ONEDEV_URL || 'https://onedev.danger',
        description: 'Git repository management and CI/CD',
      },
      {
        name: 'Traefik Dashboard',
        icon: 'activity',
        url: import.meta.env.VITE_TRAEFIK_URL || 'https://traefik.danger',
        description: 'Reverse proxy and load balancer dashboard',
      },
      {
        name: 'Portainer',
        icon: 'box',
        url: import.meta.env.VITE_PORTAINER_URL || 'https://portainer.danger',
        description: 'Docker container management',
      },
    ],
    []
  );

  return (
    <div className="wa-stack wa-gap-xl">
      <h2>Maintenance Services</h2>
      <ServiceGrid services={maintenanceServices} />
    </div>
  );
};

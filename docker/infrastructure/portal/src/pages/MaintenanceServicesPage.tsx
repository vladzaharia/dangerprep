import React, { useMemo } from 'react';

import type { Service } from '../App';
import { ServiceGrid } from '../components/ServiceGrid';
import { getMaintenanceServiceUrls } from '../utils/urlBuilder';

export const MaintenanceServicesPage: React.FC = () => {

  // Maintenance services configuration with dynamic URL construction
  const maintenanceServices: Service[] = useMemo(() => {
    const serviceUrls = getMaintenanceServiceUrls();

    return [
      {
        name: 'Docmost',
        icon: 'file-text',
        url: serviceUrls.docmost,
        description: 'Documentation and knowledge management',
      },
      {
        name: 'OneDev',
        icon: 'git-branch',
        url: serviceUrls.onedev,
        description: 'Git repository management and CI/CD',
      },
      {
        name: 'Traefik Dashboard',
        icon: 'activity',
        url: serviceUrls.traefik,
        description: 'Reverse proxy and load balancer dashboard',
      },
      {
        name: 'Portainer',
        icon: 'box',
        url: serviceUrls.portainer,
        description: 'Docker container management',
      },
    ];
  }, []);

  return (
    <div className="wa-stack wa-gap-xl">
      <h2>Maintenance Services</h2>
      <ServiceGrid services={maintenanceServices} />
    </div>
  );
};

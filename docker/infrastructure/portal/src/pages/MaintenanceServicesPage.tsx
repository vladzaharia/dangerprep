import React from 'react';

import { ServiceGrid } from '../components/ServiceGrid';
import { useServicesWithFallback } from '../hooks/useServiceDiscovery';

export const MaintenanceServicesPage: React.FC = () => {
  const { services, loading, error } = useServicesWithFallback('maintenance');

  if (loading) {
    return (
      <div className="wa-stack wa-gap-xl">
        <h2>Maintenance Services</h2>
        <p>Loading services...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wa-stack wa-gap-xl">
        <h2>Maintenance Services</h2>
        <wa-callout variant="danger">
          <wa-icon name="exclamation-triangle" slot="icon"></wa-icon>
          <strong>Error loading services:</strong> {error}
        </wa-callout>
        <ServiceGrid services={services} />
      </div>
    );
  }

  return (
    <div className="wa-stack wa-gap-xl">
      <h2>Maintenance Services</h2>
      <ServiceGrid services={services} />
    </div>
  );
};

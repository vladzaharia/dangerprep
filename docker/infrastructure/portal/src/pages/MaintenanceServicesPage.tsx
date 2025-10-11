import React, { Suspense } from 'react';

import { ServiceGrid } from '../components/ServiceGrid';
import { useServices } from '../hooks/useServices';

/**
 * Loading skeleton for maintenance services page
 */
function MaintenanceServicesPageSkeleton() {
  return (
    <div className="wa-stack wa-gap-xl">
      <h2>Maintenance Services</h2>
      <div className="wa-grid wa-gap-m service-grid">
        {/* Create 2 skeleton service cards for maintenance */}
        {Array.from({ length: 2 }, (_, index) => (
          <wa-card key={index} appearance="outlined">
            <div className="wa-stack service-card">
              <div className="service-card-header">
                <div className="service-icon">
                  <wa-skeleton style={{ width: '32px', height: '32px', borderRadius: '4px' }}></wa-skeleton>
                </div>
                <div className="wa-stack service-info">
                  <wa-skeleton style={{ width: '120px', height: '24px' }}></wa-skeleton>
                  <wa-skeleton style={{ width: '200px', height: '16px' }}></wa-skeleton>
                </div>
              </div>
              <div className="service-card-footer">
                <wa-skeleton style={{ width: '80px', height: '16px' }}></wa-skeleton>
                <wa-skeleton style={{ width: '60px', height: '20px', borderRadius: '10px' }}></wa-skeleton>
              </div>
            </div>
          </wa-card>
        ))}
      </div>
    </div>
  );
}

/**
 * Maintenance services content component
 */
function MaintenanceServicesContent() {
  const services = useServices('maintenance');

  return (
    <div className="wa-stack wa-gap-xl">
      <h2>Maintenance Services</h2>

      {services.length === 0 ? (
        <wa-callout variant="neutral">
          <wa-icon name="info-circle" slot="icon"></wa-icon>
          No maintenance services are currently available.
        </wa-callout>
      ) : (
        <ServiceGrid services={services} />
      )}
    </div>
  );
}

export const MaintenanceServicesPage: React.FC = () => {
  return (
    <Suspense fallback={<MaintenanceServicesPageSkeleton />}>
      <MaintenanceServicesContent />
    </Suspense>
  );
};

import React, { Suspense } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';

import { ServiceGrid } from '../components/ServiceGrid';
import { useServices } from '../hooks/useServices';

/**
 * Loading skeleton for services page using Web Awesome components
 */
function ServicesPageSkeleton() {
  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>Available Services</h2>
      <div className='wa-grid wa-gap-m service-grid'>
        {/* Create 3 skeleton service cards */}
        {Array.from({ length: 3 }, (_, index) => (
          <wa-card key={index} appearance='outlined'>
            <div className='wa-stack service-card'>
              <div className='service-card-header'>
                <div className='service-icon'>
                  {/* Icon skeleton - 48px to match actual FontAwesome icon size */}
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: '48px', height: '48px', borderRadius: '6px' }}
                  ></wa-skeleton>
                </div>
                <div className='wa-stack service-info'>
                  {/* Service name skeleton - varying widths for realism */}
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: `${100 + index * 20}px`, height: '24px' }}
                  ></wa-skeleton>
                  {/* Service description skeleton - paragraph-like with varying widths */}
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: `${180 + index * 30}px`, height: '16px' }}
                  ></wa-skeleton>
                </div>
              </div>
              <div className='service-card-footer'>
                {/* URL text skeleton */}
                <wa-skeleton
                  effect='sheen'
                  style={{ width: `${120 + index * 15}px`, height: '16px' }}
                ></wa-skeleton>
                {/* External link icon skeleton */}
                <wa-skeleton
                  effect='sheen'
                  style={{ width: '16px', height: '16px', borderRadius: '2px' }}
                ></wa-skeleton>
              </div>
            </div>
          </wa-card>
        ))}
      </div>
    </div>
  );
}

/**
 * Services content component (wrapped in Suspense)
 */
function ServicesContent() {
  // Use modern Suspense-compatible hook
  const services = useServices('public');

  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>Available Services</h2>

      {services.length === 0 ? (
        <wa-callout variant='neutral'>
          <span slot='icon'>
            <FontAwesomeIcon icon={faInfoCircle} />
          </span>
          No public services are currently available.
        </wa-callout>
      ) : (
        <ServiceGrid services={services} />
      )}
    </div>
  );
}

export const ServicesPage: React.FC = () => {
  return (
    <Suspense fallback={<ServicesPageSkeleton />}>
      <ServicesContent />
    </Suspense>
  );
};

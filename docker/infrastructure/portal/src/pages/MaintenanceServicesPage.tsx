import { faCircleInfo } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { Suspense } from 'react';

import { ServiceGrid } from '../components';
import { useServicesData } from '../hooks/useSWRData';
import { createIconStyle, ICON_STYLES } from '../utils/iconStyles';

/**
 * Loading skeleton for maintenance services page
 */
function MaintenanceServicesPageSkeleton() {
  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>Maintenance Services</h2>
      <div className='wa-grid wa-gap-m service-grid'>
        {/* Create 2 skeleton service cards for maintenance */}
        {Array.from({ length: 2 }, (_, index) => (
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
                    style={{ width: `${130 + index * 25}px`, height: '24px' }}
                  ></wa-skeleton>
                  {/* Service description skeleton - paragraph-like with varying widths */}
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: `${200 + index * 40}px`, height: '16px' }}
                  ></wa-skeleton>
                </div>
              </div>
              <div className='service-card-footer'>
                {/* URL text skeleton */}
                <wa-skeleton
                  effect='sheen'
                  style={{ width: `${140 + index * 20}px`, height: '16px' }}
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
 * Maintenance services content component (wrapped in Suspense)
 */
function MaintenanceServicesContent() {
  const { data } = useServicesData('maintenance');
  const services = data?.services || [];

  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>Maintenance Services</h2>

      {services.length === 0 ? (
        <wa-callout variant='neutral'>
          <div slot='icon' style={{ display: 'contents' }}>
            <FontAwesomeIcon
              icon={faCircleInfo}
              style={{ ...createIconStyle(ICON_STYLES.info), paddingRight: 'var(--wa-space-xs)' }}
            />
          </div>
          No maintenance services are currently available.
        </wa-callout>
      ) : (
        <ServiceGrid services={services} pageType='maintenance' />
      )}
    </div>
  );
}

/**
 * Maintenance services page component with React 19 Suspense
 */
export const MaintenanceServicesPage: React.FC = () => {
  return (
    <Suspense fallback={<MaintenanceServicesPageSkeleton />}>
      <MaintenanceServicesContent />
    </Suspense>
  );
};

import { faCircleInfo } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { Suspense } from 'react';

import { useServicesData } from '../../hooks/useSWRData';
import { createIconStyle, ICON_STYLES } from '../../utils/iconStyles';
import { ServiceGrid } from '../sections';

export interface ServicePageProps {
  /** Page title */
  title: string;

  /** Service type filter ('public' or 'maintenance') */
  serviceType: 'public' | 'maintenance';

  /** Number of skeleton cards to show while loading */
  skeletonCount?: number;
}

/**
 * Loading skeleton for service page
 */
function ServicePageSkeleton({
  title,
  skeletonCount = 3,
}: {
  title: string;
  skeletonCount: number;
}) {
  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>{title}</h2>
      <div className='wa-grid wa-gap-m service-grid'>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <wa-card key={index} appearance='outlined'>
            <div className='wa-stack card service-card'>
              <div className='card service-card-header'>
                <div className='service-icon'>
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: '48px', height: '48px', borderRadius: '6px' }}
                  ></wa-skeleton>
                </div>
                <div className='wa-stack service-info'>
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: `${120 + index * 20}px`, height: '20px' }}
                  ></wa-skeleton>
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: `${100 + index * 15}px`, height: '16px' }}
                  ></wa-skeleton>
                </div>
              </div>
              <div className='service-card-footer'>
                <wa-skeleton
                  effect='sheen'
                  style={{ width: '100%', height: '36px', borderRadius: '4px' }}
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
 * Service content component (wrapped in Suspense)
 */
function ServiceContent({
  title,
  serviceType,
}: {
  title: string;
  serviceType: 'public' | 'maintenance';
}) {
  const { data } = useServicesData(serviceType);
  const services = data?.services || [];

  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>{title}</h2>

      {services.length === 0 ? (
        <wa-callout variant='neutral'>
          <div slot='icon' style={{ display: 'contents' }}>
            <FontAwesomeIcon
              icon={faCircleInfo}
              style={{ ...createIconStyle(ICON_STYLES.info), paddingRight: 'var(--wa-space-xs)' }}
            />
          </div>
          No {serviceType} services are currently available.
        </wa-callout>
      ) : (
        <ServiceGrid
          services={services}
          {...(serviceType === 'maintenance' ? { pageType: 'maintenance' as const } : {})}
        />
      )}
    </div>
  );
}

/**
 * Generic service page component with React 19 Suspense
 * Used for both public services and maintenance services pages
 */
export const ServicePage: React.FC<ServicePageProps> = ({
  title,
  serviceType,
  skeletonCount = 3,
}) => {
  return (
    <Suspense fallback={<ServicePageSkeleton title={title} skeletonCount={skeletonCount} />}>
      <ServiceContent title={title} serviceType={serviceType} />
    </Suspense>
  );
};

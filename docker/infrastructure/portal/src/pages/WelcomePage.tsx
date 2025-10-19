import { faArrowUpRightFromSquare } from '@awesome.me/kit-a765fc5647/icons/classic/solid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { Suspense } from 'react';

import { useAppConfigData } from '../hooks/useSWRData';
import { createIconStyle, ICON_STYLES } from '../utils/iconStyles';

/**
 * Loading skeleton for welcome page
 */
function WelcomePageSkeleton() {
  return (
    <div className='welcome-page-container'>
      {/* Logo skeleton */}
      <div className='welcome-logo'>
        <wa-skeleton effect='sheen' style={{ width: '200px', height: '80px' }}></wa-skeleton>
      </div>

      {/* Body skeleton */}
      <div className='welcome-body'>
        <wa-skeleton effect='sheen' style={{ width: '300px', height: '48px' }}></wa-skeleton>
        <wa-skeleton effect='sheen' style={{ width: '400px', height: '24px' }}></wa-skeleton>
      </div>

      {/* URL skeleton */}
      <div className='welcome-footer'>
        <wa-skeleton effect='sheen' style={{ width: '250px', height: '32px' }}></wa-skeleton>
      </div>
    </div>
  );
}

/**
 * Welcome content component (wrapped in Suspense)
 */
function WelcomeContent() {
  const { data: config } = useAppConfigData();

  const baseDomain = config?.global.baseDomain || 'danger.diy';
  const portalUrl = `https://portal.${baseDomain}`;

  return (
    <div className='welcome-page-container'>
      {/* Logo at top */}
      <div className='welcome-logo'>
        <img src='/logos/logo-dark.svg' alt='DangerPrep Logo' />
      </div>

      {/* Body in middle - fills available space */}
      <div className='welcome-body'>
        <h1 className='wa-heading-2xl'>Welcome to DangerPrep!</h1>
        <p className='wa-body-l'>
          You're now connected to the hotspot. You can access all available services through the
          portal, which is linked below.
        </p>
      </div>

      {/* Portal URL at bottom - cluster with darker background */}
      <div className='wa-cluster wa-gap-s welcome-url-container'>
        <code className='wa-body-s'>{portalUrl}</code>
        <wa-copy-button value={portalUrl} class='welcome-copy-button'></wa-copy-button>
        <wa-button href={portalUrl} variant='brand' appearance='plain' size='small'>
          <FontAwesomeIcon
            icon={faArrowUpRightFromSquare}
            style={createIconStyle(ICON_STYLES.brand)}
          />
        </wa-button>
      </div>
    </div>
  );
}

/**
 * Welcome page component with React 19 Suspense
 * This is the landing page for users connecting via captive portal
 */
export const WelcomePage: React.FC = () => {
  return (
    <Suspense fallback={<WelcomePageSkeleton />}>
      <WelcomeContent />
    </Suspense>
  );
};

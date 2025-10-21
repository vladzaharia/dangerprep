import React from 'react';

import { TailscaleTab } from '../components';

/**
 * Tailscale Status Page Component
 */
export const TailscaleStatusPage: React.FC = () => {
  return (
    <div className='tailscale-status-page'>
      <TailscaleTab />
    </div>
  );
};

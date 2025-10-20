import { faChevronLeft } from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { TailscaleTab } from '../components';

/**
 * Tailscale Status Page Component
 */
export const TailscaleStatusPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  return (
    <div className='wa-stack wa-gap-m'>
      <div className='wa-cluster wa-gap-m wa-align-items-center'>
        <button
          onClick={() => navigate(getNavLinkTo('/network'))}
          className='network-status-back-button'
          aria-label='Back to Network'
        >
          <FontAwesomeIcon icon={faChevronLeft} size='lg' />
        </button>
        <h2>Tailscale</h2>
      </div>
      <TailscaleTab />
    </div>
  );
};

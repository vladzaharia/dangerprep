import { faShieldCheck } from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { SettingsCard } from '../components/cards';
import { ICON_STYLES } from '../utils/iconStyles';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>Settings</h2>

      {/* Settings cards grid */}
      <div
        className='wa-grid wa-gap-m'
        style={{ '--min-column-size': '250px' } as React.CSSProperties}
      >
        {/* Tailscale Settings Card */}
        <SettingsCard
          icon={faShieldCheck}
          iconStyle={ICON_STYLES.tailscale}
          title='Tailscale Settings'
          description='Configure Tailscale VPN settings, exit nodes, and network options'
          footerSlot={
            <div
              onClick={() => navigate(getNavLinkTo('/tailscale'))}
              style={{ cursor: 'pointer' }}
              role='button'
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(getNavLinkTo('/tailscale'));
                }
              }}
              aria-label='Tailscale Settings'
            >
              <wa-button
                appearance='filled'
                variant='brand'
                style={{ width: '100%', pointerEvents: 'none' }}
              >
                Configure Tailscale
              </wa-button>
            </div>
          }
        />
      </div>
    </div>
  );
};

import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldCheck } from '@awesome.me/kit-a765fc5647/icons/duotone/solid';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  const iconStyle = {
    '--fa-primary-color': '#a855f7', // Purple for Tailscale
    '--fa-primary-opacity': 0.9,
    '--fa-secondary-opacity': 0.8,
  } as React.CSSProperties;

  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>Settings</h2>

      {/* Settings cards grid */}
      <div
        className='wa-grid wa-gap-m'
        style={{ '--min-column-size': '250px' } as React.CSSProperties}
      >
        {/* Tailscale Settings Card */}
        <wa-card appearance='outlined'>
          <div className='wa-stack wa-gap-xl' style={{ padding: 'var(--wa-space-m)' }}>
            <div className='wa-stack wa-gap-s' style={{ alignItems: 'center' }}>
              <FontAwesomeIcon icon={faShieldCheck} size='4x' style={iconStyle} />
              <h3 className='wa-heading-s'>Tailscale Settings</h3>
            </div>
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
          </div>
        </wa-card>
      </div>
    </div>
  );
};

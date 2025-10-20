import {
  faShieldCheck,
  faRainbowHalf,
  faGlobe,
  faSatelliteDish,
  faServer,
  faSignal,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
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
        {/* WiFi Settings Card */}
        <SettingsCard
          icon={faRainbowHalf}
          iconFlip='horizontal'
          iconStyle={ICON_STYLES.wifi}
          title='WiFi Settings'
          description='Configure WiFi connectivity options'
          footerSlot={
            <div
              onClick={() => navigate(getNavLinkTo('/wifi'))}
              style={{ cursor: 'pointer' }}
              role='button'
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(getNavLinkTo('/wifi'));
                }
              }}
              aria-label='WiFi Settings'
            >
              <wa-button
                appearance='filled'
                variant='brand'
                style={{ width: '100%', pointerEvents: 'none' }}
              >
                Configure WiFi
              </wa-button>
            </div>
          }
        />

        {/* Hotspot Settings Card */}
        <SettingsCard
          icon={faSignal}
          iconStyle={ICON_STYLES.hotspot}
          title='Hotspot Settings'
          description='Configure hotspot and access point settings'
          footerSlot={
            <div
              onClick={() => navigate(getNavLinkTo('/hotspot'))}
              style={{ cursor: 'pointer' }}
              role='button'
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(getNavLinkTo('/hotspot'));
                }
              }}
              aria-label='Hotspot Settings'
            >
              <wa-button
                appearance='filled'
                variant='brand'
                style={{ width: '100%', pointerEvents: 'none' }}
              >
                Configure Hotspot
              </wa-button>
            </div>
          }
        />

        {/* Internet Settings Card */}
        <SettingsCard
          icon={faGlobe}
          iconStyle={ICON_STYLES.brand}
          title='Internet Settings'
          description='Configure internet connection and DNS settings'
          footerSlot={
            <div
              onClick={() => navigate(getNavLinkTo('/internet'))}
              style={{ cursor: 'pointer' }}
              role='button'
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(getNavLinkTo('/internet'));
                }
              }}
              aria-label='Internet Settings'
            >
              <wa-button
                appearance='filled'
                variant='brand'
                style={{ width: '100%', pointerEvents: 'none' }}
              >
                Configure Internet
              </wa-button>
            </div>
          }
        />

        {/* Starlink Settings Card */}
        <SettingsCard
          icon={faSatelliteDish}
          iconStyle={ICON_STYLES.brand}
          title='Starlink Settings'
          description='Configure Starlink satellite internet settings'
          footerSlot={
            <div
              onClick={() => navigate(getNavLinkTo('/starlink'))}
              style={{ cursor: 'pointer' }}
              role='button'
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(getNavLinkTo('/starlink'));
                }
              }}
              aria-label='Starlink Settings'
            >
              <wa-button
                appearance='filled'
                variant='brand'
                style={{ width: '100%', pointerEvents: 'none' }}
              >
                Configure Starlink
              </wa-button>
            </div>
          }
        />

        {/* Device Settings Card */}
        <SettingsCard
          icon={faServer}
          iconStyle={ICON_STYLES.device}
          title='Device Settings'
          description='Configure device-specific settings and options'
          footerSlot={
            <div
              onClick={() => navigate(getNavLinkTo('/device'))}
              style={{ cursor: 'pointer' }}
              role='button'
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(getNavLinkTo('/device'));
                }
              }}
              aria-label='Device Settings'
            >
              <wa-button
                appearance='filled'
                variant='brand'
                style={{ width: '100%', pointerEvents: 'none' }}
              >
                Configure Device
              </wa-button>
            </div>
          }
        />

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

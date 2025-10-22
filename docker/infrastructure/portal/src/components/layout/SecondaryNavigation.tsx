import {
  faNetworkWired,
  faUsers,
  faShieldCheck,
  faRainbowHalf,
  faSignal,
  faGlobe,
  faSatelliteDish,
  faServer,
  faPowerOff,
  faArrowsRotate,
  faDesktop,
  faWindowRestore,
  faGear,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo, useState } from 'react';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';

import { createIconStyle, ICON_STYLES } from '../../utils/iconStyles';

/**
 * Secondary navigation item configuration
 */
interface SecondaryNavItem {
  path: string;
  icon?: IconDefinition;
  stackedIcon?: { base: IconDefinition; overlay: IconDefinition };
  label: string;
  category: 'status' | 'settings' | 'power';
  flip?: 'horizontal' | 'vertical';
}

/**
 * Secondary navigation items configuration
 */
const SECONDARY_NAV_ITEMS: SecondaryNavItem[] = [
  // Status category
  {
    path: '/network',
    icon: faNetworkWired,
    label: 'Status',
    category: 'status',
  },
  {
    path: '/network/clients',
    icon: faUsers,
    label: 'Connected Clients',
    category: 'status',
  },
  {
    path: '/network/tailscale',
    icon: faShieldCheck,
    label: 'Tailscale',
    category: 'status',
  },
  // Settings category
  {
    path: '/settings/wifi',
    icon: faRainbowHalf,
    label: 'WiFi',
    category: 'settings',
    flip: 'horizontal',
  },
  {
    path: '/settings/hotspot',
    icon: faSignal,
    label: 'Hotspot',
    category: 'settings',
  },
  {
    path: '/settings/internet',
    icon: faGlobe,
    label: 'Internet',
    category: 'settings',
  },
  {
    path: '/settings/starlink',
    icon: faSatelliteDish,
    label: 'Starlink',
    category: 'settings',
  },
  {
    path: '/settings/device',
    icon: faServer,
    label: 'Device',
    category: 'settings',
  },
  {
    path: '/settings/tailscale',
    stackedIcon: { base: faShieldCheck, overlay: faGear },
    label: 'Tailscale',
    category: 'settings',
  },
  // Power category
  {
    path: '/power/restart-browser',
    icon: faWindowRestore,
    label: 'Restart Browser',
    category: 'power',
  },
  {
    path: '/power/reboot',
    icon: faArrowsRotate,
    label: 'Reboot',
    category: 'power',
  },
  {
    path: '/power/shutdown',
    icon: faPowerOff,
    label: 'Shutdown',
    category: 'power',
  },
  {
    path: '/power/desktop',
    icon: faDesktop,
    label: 'Desktop',
    category: 'power',
  },
];

/**
 * Determine the current category based on the current path
 */
function getCurrentCategory(pathname: string): 'status' | 'settings' | 'power' | null {
  if (pathname.startsWith('/network')) return 'status';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/power')) return 'power';
  return null;
}

/**
 * Get icon style based on the specific path for diverse colors
 */
function getIconStyle(path: string): React.CSSProperties | undefined {
  switch (path) {
    // Status category
    case '/network/status':
    case '/network':
      return createIconStyle(ICON_STYLES.network);
    case '/network/clients':
      return createIconStyle(ICON_STYLES.clients);
    case '/network/tailscale':
      return createIconStyle(ICON_STYLES.tailscale);
    // Settings category
    case '/settings/wifi':
      return createIconStyle(ICON_STYLES.wifi);
    case '/settings/hotspot':
      return createIconStyle(ICON_STYLES.hotspot);
    case '/settings/internet':
      return createIconStyle(ICON_STYLES.internet);
    case '/settings/starlink':
      return createIconStyle(ICON_STYLES.starlink);
    case '/settings/device':
      return createIconStyle(ICON_STYLES.deviceSettings);
    case '/settings/tailscale':
      return createIconStyle(ICON_STYLES.tailscale);
    // Power category
    case '/power/restart-browser':
    case '/power/reboot':
    case '/power/shutdown':
    case '/power/exit-to-desktop':
      return createIconStyle(ICON_STYLES.danger);
    default:
      return undefined;
  }
}

/**
 * Power action configuration
 */
interface PowerAction {
  path: string;
  endpoint: string;
  confirmMessage: string;
}

const POWER_ACTIONS: Record<string, PowerAction> = {
  '/power/restart-browser': {
    path: '/power/restart-browser',
    endpoint: '/api/power/kiosk/restart',
    confirmMessage: 'Are you sure you want to restart the kiosk browser?',
  },
  '/power/reboot': {
    path: '/power/reboot',
    endpoint: '/api/power/reboot',
    confirmMessage:
      'Are you sure you want to reboot the system? This will restart the entire device.',
  },
  '/power/shutdown': {
    path: '/power/shutdown',
    endpoint: '/api/power/shutdown',
    confirmMessage:
      'Are you sure you want to shutdown the system? You will need to manually power it back on.',
  },
  '/power/desktop': {
    path: '/power/desktop',
    endpoint: '/api/power/desktop',
    confirmMessage: 'Are you sure you want to exit kiosk mode and switch to desktop?',
  },
};

/**
 * Secondary Navigation Component
 * Displays horizontal navigation for grouped pages (Status, Settings, Power)
 */
export const SecondaryNavigation: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);

  const currentCategory = useMemo(() => getCurrentCategory(location.pathname), [location.pathname]);

  // Filter items for the current category
  const visibleItems = useMemo(() => {
    if (!currentCategory) return [];
    return SECONDARY_NAV_ITEMS.filter(item => item.category === currentCategory);
  }, [currentCategory]);

  // Don't render if no category or no items
  if (!currentCategory || visibleItems.length === 0) {
    return null;
  }

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  // Handle power actions
  const handlePowerAction = async (action: PowerAction, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    // Show confirmation dialog
    const confirmed = window.confirm(action.confirmMessage);
    if (!confirmed) {
      return;
    }

    setLoading(action.path);

    try {
      const response = await fetch(action.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.message || 'Action failed');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className='app-secondary-navigation'>
      <wa-card className='app-secondary-navigation-card' appearance='outlined'>
        <div className='wa-cluster wa-gap-m wa-align-items-center'>
          {visibleItems.map(item => {
            const powerAction = POWER_ACTIONS[item.path];
            const isPowerAction = !!powerAction;

            // Render icon (regular or stacked)
            const renderIcon = () => {
              const iconStyle = {
                ...getIconStyle(item.path),
                maxWidth: '1.5rem',
                paddingRight: 'var(--wa-space-xs)',
                '--fa-primary-opacity': 1,
                '--fa-secondary-opacity': 0.8,
              } as React.CSSProperties;

              if (item.stackedIcon) {
                return (
                  <span
                    className='fa-stack'
                    style={{ fontSize: '0.75em', verticalAlign: 'middle' }}
                  >
                    <FontAwesomeIcon
                      icon={item.stackedIcon.base}
                      className='fa-stack-2x'
                      style={iconStyle}
                    />
                    <FontAwesomeIcon
                      icon={item.stackedIcon.overlay}
                      className='fa-stack-1x'
                      transform='shrink-6'
                      style={{ color: 'var(--wa-color-neutral-0)' }}
                    />
                  </span>
                );
              }

              if (!item.icon) return null;

              return (
                <FontAwesomeIcon icon={item.icon} size='lg' flip={item.flip} style={iconStyle} />
              );
            };

            if (isPowerAction) {
              // Power actions are clickable buttons, not navigation links
              return (
                <div
                  key={item.path}
                  className='secondary-navigation-item'
                  onClick={e => handlePowerAction(powerAction, e)}
                  role='button'
                  tabIndex={loading === null ? 0 : -1}
                  onKeyDown={e => {
                    if (loading === null && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handlePowerAction(powerAction, e as unknown as React.MouseEvent);
                    }
                  }}
                  aria-label={item.label}
                  style={{ cursor: loading === null ? 'pointer' : 'not-allowed' }}
                >
                  <wa-button appearance='plain' size='small' disabled={loading !== null}>
                    {renderIcon()}
                    <span className='secondary-navigation-label'>{item.label}</span>
                  </wa-button>
                </div>
              );
            }

            // Regular navigation links
            return (
              <NavLink
                key={item.path}
                to={getNavLinkTo(item.path)}
                className={({ isActive }) =>
                  `secondary-navigation-item ${isActive ? 'secondary-navigation-item--active' : ''}`
                }
                aria-label={item.label}
              >
                <wa-button appearance='plain' size='small'>
                  {renderIcon()}
                  <span className='secondary-navigation-label'>{item.label}</span>
                </wa-button>
              </NavLink>
            );
          })}
        </div>
      </wa-card>
    </div>
  );
};

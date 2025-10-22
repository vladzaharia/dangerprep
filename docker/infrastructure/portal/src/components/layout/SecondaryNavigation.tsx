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
  faBrowser,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo } from 'react';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';

import { createIconStyle, ICON_STYLES } from '../../utils/iconStyles';

/**
 * Secondary navigation item configuration
 */
interface SecondaryNavItem {
  path: string;
  icon: IconDefinition;
  label: string;
  category: 'status' | 'settings' | 'power';
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
    icon: faShieldCheck,
    label: 'Tailscale',
    category: 'settings',
  },
  // Power category
  {
    path: '/power/restart-browser',
    icon: faBrowser,
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
 * Get icon style based on the category
 */
function getIconStyle(category: 'status' | 'settings' | 'power'): React.CSSProperties | undefined {
  switch (category) {
    case 'status':
      return createIconStyle(ICON_STYLES.brand);
    case 'settings':
      return createIconStyle(ICON_STYLES.settings);
    case 'power':
      return createIconStyle(ICON_STYLES.danger);
    default:
      return undefined;
  }
}

/**
 * Secondary Navigation Component
 * Displays horizontal navigation for grouped pages (Status, Settings, Power)
 */
export const SecondaryNavigation: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();

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

  const iconStyle = getIconStyle(currentCategory);

  return (
    <div className='app-secondary-navigation'>
      <wa-card className='app-secondary-navigation-card' appearance='outlined'>
        <div className='wa-cluster wa-gap-m wa-align-items-center'>
          {visibleItems.map(item => (
            <NavLink
              key={item.path}
              to={getNavLinkTo(item.path)}
              className={({ isActive }) =>
                `secondary-navigation-item ${isActive ? 'secondary-navigation-item--active' : ''}`
              }
              aria-label={item.label}
            >
              <wa-button appearance='plain' size='small'>
                <FontAwesomeIcon
                  icon={item.icon}
                  size='lg'
                  style={{ ...iconStyle, maxWidth: '1.5rem', paddingRight: 'var(--wa-space-xs)' }}
                />
                <span className='secondary-navigation-label'>{item.label}</span>
              </wa-button>
            </NavLink>
          ))}
        </div>
      </wa-card>
    </div>
  );
};

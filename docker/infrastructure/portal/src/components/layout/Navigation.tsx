import {
  faPowerOff,
  faBrowser,
  faQrcode,
  faNetworkWired,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import { faGear, faWrench } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo } from 'react';
import { NavLink, useSearchParams, useLocation } from 'react-router-dom';

import { createIconStyle, ICON_STYLES } from '../../utils/iconStyles';

/**
 * Navigation item configuration
 */
interface NavItem {
  path: string;
  icon: IconDefinition;
  label: string;
  /** Function to determine if this item should be visible */
  isVisible: (context: NavigationContext) => boolean;
  /** Position in navigation: 'top' or 'bottom' */
  position: 'top' | 'bottom';
}

/**
 * Context for determining navigation visibility
 */
interface NavigationContext {
  isKioskMode: boolean;
  isOnManagePage: boolean;
  currentPath: string;
}

/**
 * List of management pages
 */
const MANAGEMENT_PAGES = ['/network', '/maintenance', '/settings', '/tailscale', '/power'];

/**
 * Navigation items configuration
 * This is the single source of truth for all navigation items and their visibility rules
 */
const NAV_ITEMS: NavItem[] = [
  {
    path: '/services',
    icon: faBrowser,
    label: 'Services',
    position: 'top',
    // Always visible (public and kiosk)
    isVisible: () => true,
  },
  {
    path: '/maintenance',
    icon: faWrench,
    label: 'Maintenance',
    position: 'top',
    // Kiosk-only, visible only when on management pages
    isVisible: ({ isKioskMode, isOnManagePage }) => isKioskMode && isOnManagePage,
  },
  {
    path: '/qr',
    icon: faQrcode,
    label: 'QR Code',
    position: 'bottom',
    // Kiosk-only, always visible in kiosk mode
    isVisible: ({ isKioskMode }) => isKioskMode,
  },
  {
    path: '/network',
    icon: faNetworkWired,
    label: 'Network Status',
    position: 'bottom',
    // Kiosk-only, always visible in kiosk mode
    isVisible: ({ isKioskMode }) => isKioskMode,
  },
  {
    path: '/settings',
    icon: faGear,
    label: 'Settings',
    position: 'bottom',
    // Kiosk-only, visible only when on management pages
    isVisible: ({ isKioskMode, isOnManagePage }) => isKioskMode && isOnManagePage,
  },
  {
    path: '/power',
    icon: faPowerOff,
    label: 'Power',
    position: 'bottom',
    // Kiosk-only, visible only when on management pages
    isVisible: ({ isKioskMode, isOnManagePage }) => isKioskMode && isOnManagePage,
  },
];

export const Navigation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isKioskMode = searchParams.has('kiosk');

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  // Determine if we're on a management page
  const isOnManagePage =
    MANAGEMENT_PAGES.filter(path => location.pathname.startsWith(path)).length > 0;

  // Create navigation context
  const navContext: NavigationContext = useMemo(
    () => ({
      isKioskMode,
      isOnManagePage,
      currentPath: location.pathname,
    }),
    [isKioskMode, isOnManagePage, location.pathname]
  );

  // Filter visible items by position
  const topNavItems = useMemo(
    () => NAV_ITEMS.filter(item => item.position === 'top' && item.isVisible(navContext)),
    [navContext]
  );

  const bottomNavItems = useMemo(
    () => NAV_ITEMS.filter(item => item.position === 'bottom' && item.isVisible(navContext)),
    [navContext]
  );

  /**
   * Get icon style based on the navigation path
   */
  const getIconStyle = (path?: string) => {
    if (!path) return undefined;

    const pathKey = path.replace('/', '');
    switch (pathKey) {
      case 'services':
        return createIconStyle(ICON_STYLES.brand);
      case 'maintenance':
        return createIconStyle(ICON_STYLES.warning);
      case 'qr':
        return createIconStyle(ICON_STYLES.tailscale);
      case 'network':
        return createIconStyle(ICON_STYLES.device);
      case 'settings':
        return createIconStyle(ICON_STYLES.settings);
      case 'power':
        return createIconStyle(ICON_STYLES.danger);
      default:
        return undefined;
    }
  };

  /**
   * Render a navigation item as a NavLink
   */
  const renderNavItem = (item: NavItem) => {
    const iconStyle = getIconStyle(item.path);

    return (
      <NavLink
        key={item.path}
        to={getNavLinkTo(item.path)}
        className={({ isActive }) => `navigation-item ${isActive ? 'navigation-item--active' : ''}`}
        aria-label={item.label}
      >
        <wa-button appearance='plain' size='small'>
          <FontAwesomeIcon
            icon={item.icon}
            size='lg'
            style={{ ...iconStyle, maxWidth: '1.5rem' }}
          />
        </wa-button>
      </NavLink>
    );
  };

  return (
    <div className='app-navigation'>
      <wa-card className='app-navigation-card' appearance='outlined'>
        {/* Use stack with space-between to position items */}
        <div className='wa-stack wa-gap-m app-navigation-content'>
          {/* Top navigation section - services */}
          {topNavItems.length > 0 && (
            <div className='wa-stack wa-gap-m'>{topNavItems.map(item => renderNavItem(item))}</div>
          )}

          {/* Spacer to push bottom items down */}
          <div className='app-navigation-spacer' />

          {/* Bottom navigation section - status and management */}
          {bottomNavItems.length > 0 && (
            <div className='wa-stack wa-gap-m'>
              {bottomNavItems.map(item => renderNavItem(item))}
            </div>
          )}
        </div>
      </wa-card>
    </div>
  );
};

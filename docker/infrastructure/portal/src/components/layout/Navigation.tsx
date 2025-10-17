import React, { useMemo } from 'react';
import { NavLink, useSearchParams, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faWrench } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { faPowerOff, faBrowser, faQrcode } from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import { NetworkStatusButton } from './NetworkStatusButton';

/**
 * Navigation item configuration
 */
interface NavItem {
  path?: string;
  icon?: any;
  label: string;
  /** Function to determine if this item should be visible */
  isVisible: (context: NavigationContext) => boolean;
  /** Position in navigation: 'top' or 'bottom' */
  position: 'top' | 'bottom';
  /** Custom component to render (optional, for special items like NetworkStatusButton) */
  customComponent?: React.ComponentType;
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
const MANAGEMENT_PAGES = ['/network', '/maintenance', '/settings', '/power'];

/**
 * Icon color configurations for navigation items
 * Each icon colors only one layer (primary or secondary) for a selective duotone effect
 */
const ICON_COLORS = {
  services: {
    layer: 'primary', // Color the browser outline
    color: '#3b82f6', // Blue
  },
  maintenance: {
    layer: 'primary', // Color the wrench outline
    color: '#f59e0b', // Amber
  },
  qr: {
    layer: 'primary', // Color the QR pattern details
    color: '#a855f7', // Purple
  },
  settings: {
    layer: 'primary', // Color the gear outline
    color: '#10b981', // Green
  },
  power: {
    layer: 'primary', // Color the power symbol details
    color: '#ef4444', // Red
  },
};

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
    label: 'Network Status',
    position: 'bottom',
    customComponent: NetworkStatusButton,
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
  const isOnManagePage = MANAGEMENT_PAGES.includes(location.pathname);

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
   * Get icon colors based on the navigation path
   */
  const getIconColors = (path?: string) => {
    if (!path) return undefined;

    const colorKey = path.replace('/', '') as keyof typeof ICON_COLORS;
    return ICON_COLORS[colorKey];
  };

  /**
   * Render a navigation item - either a standard NavLink or a custom component
   */
  const renderNavItem = (item: NavItem, index: number) => {
    // If it's a custom component, render it directly
    if (item.customComponent) {
      const CustomComponent = item.customComponent;
      return <CustomComponent key={`custom-${item.label}-${index}`} />;
    }

    // Otherwise render a standard NavLink
    if (!item.path || !item.icon) {
      console.warn(`NavItem "${item.label}" is missing path or icon`);
      return null;
    }

    const colorConfig = getIconColors(item.path);

    // Build style object - only color the specified layer
    const iconStyle = colorConfig
      ? ({
          [`--fa-${colorConfig.layer}-color`]: colorConfig.color,
          '--fa-primary-opacity': 0.8,
          '--fa-secondary-opacity': 0.5,
        } as React.CSSProperties)
      : undefined;

    return (
      <NavLink
        key={item.path}
        to={getNavLinkTo(item.path)}
        className={({ isActive }) => `navigation-item ${isActive ? 'navigation-item--active' : ''}`}
        aria-label={item.label}
      >
        <wa-button appearance='plain'>
          <FontAwesomeIcon icon={item.icon} size='xl' style={iconStyle} />
        </wa-button>
      </NavLink>
    );
  };

  return (
    <div className='app-navigation wa-split:column'>
      {/* Top navigation section */}
      {topNavItems.length > 0 && (
        <div className='wa-stack app-navigation-list'>
          {topNavItems.map((item, index) => renderNavItem(item, index))}
        </div>
      )}

      {/* Bottom navigation section */}
      {bottomNavItems.length > 0 && (
        <div className='wa-stack app-navigation-list'>
          {bottomNavItems.map((item, index) => renderNavItem(item, index))}
        </div>
      )}
    </div>
  );
};

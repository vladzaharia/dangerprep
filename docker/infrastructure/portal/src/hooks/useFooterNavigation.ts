import { faNetworkWired, faPowerOff } from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import { faGear } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { useLocation } from 'react-router-dom';

import type { FooterNavItem } from '../components/layout/FooterNavigation';
import { createIconStyle, ICON_STYLES } from '../utils/iconStyles';

/**
 * Hook to determine if current page should show footer navigation
 * and what items to display
 */
export const useFooterNavigation = (): {
  shouldShow: boolean;
  items: FooterNavItem[];
  category: string | null;
} => {
  const location = useLocation();
  const pathname = location.pathname;

  // Network pages
  if (pathname.startsWith('/network')) {
    return {
      shouldShow: true,
      category: 'Network',
      items: [
        {
          path: '/network/status',
          icon: faNetworkWired,
          label: 'Status',
          iconStyle: createIconStyle(ICON_STYLES.network),
        },
        {
          path: '/network/clients',
          icon: faNetworkWired,
          label: 'Clients',
          iconStyle: createIconStyle(ICON_STYLES.network),
        },
        {
          path: '/network/tailscale',
          icon: faNetworkWired,
          label: 'Tailscale',
          iconStyle: createIconStyle(ICON_STYLES.tailscale),
        },
      ],
    };
  }

  // Settings pages
  if (
    pathname.startsWith('/settings') ||
    pathname.startsWith('/tailscale') ||
    pathname.startsWith('/wifi') ||
    pathname.startsWith('/hotspot') ||
    pathname.startsWith('/internet') ||
    pathname.startsWith('/starlink') ||
    pathname.startsWith('/device')
  ) {
    return {
      shouldShow: true,
      category: 'Settings',
      items: [
        {
          path: '/tailscale',
          icon: faGear,
          label: 'Tailscale',
          iconStyle: createIconStyle(ICON_STYLES.tailscale),
        },
        {
          path: '/wifi',
          icon: faGear,
          label: 'WiFi',
          iconStyle: createIconStyle(ICON_STYLES.network),
        },
        {
          path: '/hotspot',
          icon: faGear,
          label: 'Hotspot',
          iconStyle: createIconStyle(ICON_STYLES.network),
        },
        {
          path: '/internet',
          icon: faGear,
          label: 'Internet',
          iconStyle: createIconStyle(ICON_STYLES.network),
        },
        {
          path: '/starlink',
          icon: faGear,
          label: 'Starlink',
          iconStyle: createIconStyle(ICON_STYLES.network),
        },
        {
          path: '/device',
          icon: faGear,
          label: 'Device',
          iconStyle: createIconStyle(ICON_STYLES.settings),
        },
      ],
    };
  }

  // Power pages
  if (pathname.startsWith('/power')) {
    return {
      shouldShow: true,
      category: 'Power',
      items: [
        {
          path: '/power',
          icon: faPowerOff,
          label: 'Power',
          iconStyle: createIconStyle(ICON_STYLES.danger),
        },
      ],
    };
  }

  // No footer navigation for other pages
  return {
    shouldShow: false,
    category: null,
    items: [],
  };
};

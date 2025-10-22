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
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import { faGear } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';

import type { NavigationItem } from '../types/navigation';
import { ICON_STYLES } from '../utils/iconStyles';

/**
 * Settings page configuration
 * Shared between SettingsPage cards and SecondaryNavigation
 */
export const SETTINGS_ITEMS: NavigationItem[] = [
  {
    id: 'wifi',
    path: '/settings/wifi',
    icon: faRainbowHalf,
    iconFlip: 'horizontal',
    iconStyle: ICON_STYLES.wifi,
    label: 'WiFi Settings',
    description: 'Configure WiFi connectivity options',
    category: 'settings',
    variant: 'brand',
  },
  {
    id: 'hotspot',
    path: '/settings/hotspot',
    icon: faSignal,
    iconStyle: ICON_STYLES.hotspot,
    label: 'Hotspot Settings',
    description: 'Configure hotspot and access point settings',
    category: 'settings',
    variant: 'brand',
  },
  {
    id: 'internet',
    path: '/settings/internet',
    icon: faGlobe,
    iconStyle: ICON_STYLES.internet,
    label: 'Internet Settings',
    description: 'Configure internet connection and DNS settings',
    category: 'settings',
    variant: 'brand',
  },
  {
    id: 'starlink',
    path: '/settings/starlink',
    icon: faSatelliteDish,
    iconStyle: ICON_STYLES.starlink,
    label: 'Starlink Settings',
    description: 'Configure Starlink satellite internet settings',
    category: 'settings',
    variant: 'brand',
  },
  {
    id: 'device',
    path: '/settings/device',
    icon: faServer,
    iconStyle: ICON_STYLES.deviceSettings,
    label: 'Device Settings',
    description: 'Configure device-specific settings and options',
    category: 'settings',
    variant: 'brand',
  },
  {
    id: 'tailscale',
    path: '/settings/tailscale',
    stackedIcon: { base: faShieldCheck, overlay: faGear },
    iconStyle: ICON_STYLES.tailscale,
    label: 'Tailscale Settings',
    description: 'Configure Tailscale VPN settings, exit nodes, and network options',
    category: 'settings',
    variant: 'brand',
  },
];

/**
 * Power page configuration
 * Shared between PowerPage cards and SecondaryNavigation
 */
export const POWER_ITEMS: NavigationItem[] = [
  {
    id: 'restart-browser',
    path: '/power/restart-browser',
    icon: faWindowRestore,
    iconStyle: ICON_STYLES.brand,
    label: 'Restart Browser',
    description: 'Are you sure you want to restart the kiosk browser?',
    category: 'power',
    variant: 'brand',
    endpoint: '/api/power/kiosk/restart',
    confirmMessage: 'Are you sure you want to restart the kiosk browser?',
  },
  {
    id: 'reboot',
    path: '/power/reboot',
    icon: faArrowsRotate,
    iconStyle: ICON_STYLES.warning,
    label: 'Reboot System',
    description: 'Are you sure you want to reboot the system? This will restart the entire device.',
    category: 'power',
    variant: 'warning',
    endpoint: '/api/power/reboot',
    confirmMessage:
      'Are you sure you want to reboot the system? This will restart the entire device.',
  },
  {
    id: 'shutdown',
    path: '/power/shutdown',
    icon: faPowerOff,
    iconStyle: ICON_STYLES.danger,
    label: 'Shutdown System',
    description:
      'Are you sure you want to shutdown the system? You will need to manually power it back on.',
    category: 'power',
    variant: 'danger',
    endpoint: '/api/power/shutdown',
    confirmMessage:
      'Are you sure you want to shutdown the system? You will need to manually power it back on.',
  },
  {
    id: 'desktop',
    path: '/power/desktop',
    icon: faDesktop,
    iconStyle: ICON_STYLES.success,
    label: 'Exit to Desktop',
    description: 'Are you sure you want to exit kiosk mode and switch to desktop?',
    category: 'power',
    variant: 'success',
    endpoint: '/api/power/desktop',
    confirmMessage: 'Are you sure you want to exit kiosk mode and switch to desktop?',
  },
];

/**
 * Network status page configuration
 * Used in SecondaryNavigation
 */
export const NETWORK_STATUS_ITEMS: NavigationItem[] = [
  {
    id: 'network-status',
    path: '/network',
    icon: faNetworkWired,
    iconStyle: ICON_STYLES.network,
    label: 'Status',
    category: 'status',
  },
  {
    id: 'connected-clients',
    path: '/network/clients',
    icon: faUsers,
    iconStyle: ICON_STYLES.clients,
    label: 'Connected Clients',
    category: 'status',
  },
  {
    id: 'tailscale-status',
    path: '/network/tailscale',
    icon: faShieldCheck,
    iconStyle: ICON_STYLES.tailscale,
    label: 'Tailscale',
    category: 'status',
  },
];

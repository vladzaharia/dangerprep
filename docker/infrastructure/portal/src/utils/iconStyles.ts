import type { CSSProperties } from 'react';

/**
 * Configuration for FontAwesome duotone icon styling
 */
export interface IconStyleConfig {
  /** Color for the primary layer */
  primaryColor?: string;
  /** Color for the secondary layer */
  secondaryColor?: string;
  /** Opacity for the primary layer (0-1) */
  primaryOpacity?: number;
  /** Opacity for the secondary layer (0-1) */
  secondaryOpacity?: number;
}

/**
 * Centralized color palette for consistent theming across the application
 * Uses WebAwesome CSS color variables for consistent theming
 */
export const COLORS = {
  /** Primary semantic colors */
  semantic: {
    success: 'var(--wa-color-green-50)', // Green - success states, connected, active
    warning: 'var(--wa-color-orange-50)', // Orange - warnings, caution states
    danger: 'var(--wa-color-red-50)', // Red - errors, disconnected, critical
    info: 'var(--wa-color-blue-50)', // Blue - informational, brand
  },

  /** Feature-specific colors */
  feature: {
    wifi: 'var(--wa-color-cyan-50)', // Cyan - WiFi connectivity
    hotspot: 'var(--wa-color-pink-50)', // Pink - Hotspot/access point (distinct from WiFi)
    ethernet: 'var(--wa-color-green-50)', // Green - Ethernet connections
    tailscale: 'var(--wa-color-purple-40)', // Purple - Tailscale/VPN
    network: 'var(--wa-color-indigo-50)', // Indigo - Network status (distinct from services)
    gateway: 'var(--wa-color-cyan-60)', // Cyan (bright) - Gateway/routing infrastructure
    security: 'var(--wa-color-purple-50)', // Purple - Security/encryption
    exitNode: 'var(--wa-color-orange-60)', // Orange - Exit nodes (brighter)
    appConnector: 'var(--wa-color-purple-50)', // Purple - App connectors
    dns: 'var(--wa-color-cyan-50)', // Cyan - DNS lookup/discovery
    speed: 'var(--wa-color-cyan-60)', // Cyan (bright) - Speed/performance indicators
    routes: 'var(--wa-color-cyan-50)', // Cyan - Network routes/paths
    terminal: 'var(--wa-color-green-60)', // Green (bright) - Terminal/SSH (classic terminal green)
    version: 'var(--wa-color-gray-60)', // Gray (bright) - Version/metadata
    internet: 'var(--wa-color-blue-60)', // Blue (bright) - Internet/global connectivity
    starlink: 'var(--wa-color-green-50)', // Yellow - Starlink satellite (sun/space theme)
    device: 'var(--wa-color-pink-60)', // Pink (bright) - Device settings
    clients: 'var(--wa-color-pink-50)', // Pink - Connected clients/users
    qrcode: 'var(--wa-color-yellow-60)', // Indigo (bright) - QR code (distinct from Tailscale purple)
    settings: 'var(--wa-color-gray-50)', // Gray - Settings (neutral, distinct from blue brand)
  },

  /** UI element colors */
  ui: {
    device: 'var(--wa-color-indigo-50)', // Indigo - Device/client icons
    upload: 'var(--wa-color-blue-50)', // Blue - Upload indicators
    download: 'var(--wa-color-orange-50)', // Orange - Download indicators
    maintenance: 'var(--wa-color-orange-50)', // Orange - Maintenance mode
    ipv4: 'var(--wa-color-green-50)', // Green - IPv4 addresses
    ipv6: 'var(--wa-color-purple-60)', // Purple variant - IPv6 addresses (lighter)
    tag: 'var(--wa-color-indigo-50)', // Indigo - Generic tags
  },

  /** Neutral/state colors */
  neutral: {
    gray: 'var(--wa-color-gray-50)', // Gray - Inactive, unknown, default
    loopback: 'var(--wa-color-gray-50)', // Gray - Loopback interfaces
    bridge: 'var(--wa-color-gray-50)', // Gray - Bridge interfaces
    virtual: 'var(--wa-color-gray-50)', // Gray - Virtual interfaces
  },

  /** Operating system brand colors - kept as hex for brand accuracy */
  os: {
    linux: '#FCC624', // Yellow-orange - Linux (Tux yellow)
    android: '#3DDC84', // Green - Android (official brand color)
    windows: '#0078D4', // Blue - Windows (official brand color)
    apple: '#A855F7', // Purple - macOS/iOS/iPadOS
    default: 'var(--wa-color-gray-50)', // Gray - Unknown OS
  },
} as const;

/**
 * Standard opacity values for consistent transparency
 */
export const OPACITIES = {
  /** Full opacity */
  full: 1,
  /** High opacity - primary elements */
  high: 0.9,
  /** Medium opacity - secondary elements */
  medium: 0.8,
  /** Low opacity - subtle elements */
  low: 0.7,
  /** Very low opacity - background elements */
  veryLow: 0.6,
  /** Minimal opacity - hints and shadows */
  minimal: 0.5,
  /** Extra minimal - very subtle hints */
  extraMinimal: 0.4,
} as const;

/**
 * Creates a React CSSProperties object for FontAwesome duotone icon styling
 *
 * @param config - Icon style configuration
 * @returns React CSSProperties object with FontAwesome CSS custom properties
 *
 * @example
 * // Color only the primary layer
 * const style = createIconStyle({
 *   primaryColor: COLORS.semantic.info,
 *   primaryOpacity: OPACITIES.high,
 *   secondaryOpacity: OPACITIES.medium
 * });
 *
 * @example
 * // Color both layers
 * const style = createIconStyle({
 *   primaryColor: COLORS.semantic.info,
 *   secondaryColor: COLORS.semantic.success,
 *   primaryOpacity: OPACITIES.veryLow,
 *   secondaryOpacity: OPACITIES.medium
 * });
 */
export function createIconStyle(config: IconStyleConfig): CSSProperties {
  const style: Record<string, string | number> = {};

  if (config.primaryColor !== undefined) {
    style['--fa-primary-color'] = config.primaryColor;
  }

  if (config.secondaryColor !== undefined) {
    style['--fa-secondary-color'] = config.secondaryColor;
  }

  if (config.primaryOpacity !== undefined) {
    style['--fa-primary-opacity'] = config.primaryOpacity;
  }

  if (config.secondaryOpacity !== undefined) {
    style['--fa-secondary-opacity'] = config.secondaryOpacity;
  }

  return style as CSSProperties;
}

/**
 * Predefined icon style configurations for common use cases
 * All colors reference the centralized COLORS object for consistency
 */
export const ICON_STYLES = {
  /** WiFi - Cyan with lower primary opacity */
  wifi: {
    primaryColor: COLORS.feature.wifi,
    secondaryColor: COLORS.feature.wifi,
    primaryOpacity: OPACITIES.veryLow,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Hotspot - Pink (distinct from WiFi) */
  hotspot: {
    primaryColor: COLORS.feature.hotspot,
    secondaryColor: COLORS.feature.hotspot,
    primaryOpacity: OPACITIES.veryLow,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Ethernet interfaces - Green */
  ethernet: {
    primaryColor: COLORS.feature.ethernet,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Tailscale/VPN - Purple with inverted accent colors */
  tailscale: {
    primaryColor: COLORS.feature.tailscale,
    primaryOpacity: OPACITIES.full,
    secondaryOpacity: OPACITIES.low,
  },
  /** Settings - Gray (neutral, distinct from blue brand) */
  settings: {
    primaryColor: COLORS.feature.settings,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.extraMinimal,
  },
  /** Info callouts - Blue */
  info: {
    primaryColor: COLORS.semantic.info,
    primaryOpacity: OPACITIES.full,
    secondaryOpacity: OPACITIES.extraMinimal,
  },
  /** Loopback - Gray */
  loopback: {
    primaryColor: COLORS.neutral.loopback,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Bridge - Gray */
  bridge: {
    primaryColor: COLORS.neutral.bridge,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Virtual - Gray */
  virtual: {
    primaryColor: COLORS.neutral.virtual,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Unknown - Gray */
  unknown: {
    primaryColor: COLORS.neutral.gray,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Network - Indigo (distinct from services blue) with vibrant accent */
  network: {
    primaryColor: COLORS.feature.network,
    primaryOpacity: OPACITIES.full,
    secondaryOpacity: OPACITIES.high,
  },
  /** IPv4 addresses - Green */
  ipv4: {
    primaryColor: COLORS.ui.ipv4,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** IPv6 addresses - Purple variant */
  ipv6: {
    primaryColor: COLORS.ui.ipv6,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Gateway - Cyan for routing infrastructure */
  gateway: {
    primaryColor: COLORS.feature.gateway,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Security/Key - Purple secondary */
  security: {
    secondaryColor: COLORS.feature.security,
    primaryOpacity: OPACITIES.low,
    secondaryOpacity: OPACITIES.minimal,
  },
  /** Signal - Green secondary */
  signal: {
    secondaryColor: COLORS.semantic.success,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: 0.55,
  },
  /** Power/Danger - Red */
  danger: {
    primaryColor: COLORS.semantic.danger,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Warning - Amber */
  warning: {
    primaryColor: COLORS.semantic.warning,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Success - Green */
  success: {
    primaryColor: COLORS.semantic.success,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Brand/Info - Blue */
  brand: {
    primaryColor: COLORS.semantic.info,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Neutral/Gray */
  neutral: {
    primaryColor: COLORS.neutral.gray,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Device/Client - Indigo */
  device: {
    primaryColor: COLORS.ui.device,
    primaryOpacity: OPACITIES.full,
    secondaryOpacity: OPACITIES.low,
  },
  /** Upload - Blue */
  upload: {
    primaryColor: COLORS.ui.upload,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Download - Amber */
  download: {
    primaryColor: COLORS.ui.download,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Exit Node - Orange */
  exitNode: {
    primaryColor: COLORS.feature.exitNode,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** App Connector - Purple */
  appConnector: {
    primaryColor: COLORS.feature.appConnector,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** DNS - Cyan for lookup/discovery */
  dns: {
    primaryColor: COLORS.feature.dns,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Speed - Cyan (bright) for performance */
  speed: {
    primaryColor: COLORS.feature.speed,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Terminal/SSH - Green (classic terminal) */
  terminal: {
    primaryColor: COLORS.feature.terminal,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Version - Gray for metadata */
  version: {
    primaryColor: COLORS.feature.version,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Routes - Cyan for network paths */
  routes: {
    primaryColor: COLORS.feature.routes,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Tags - Indigo */
  tag: {
    primaryColor: COLORS.ui.tag,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Internet - Blue (bright) for global connectivity */
  internet: {
    secondaryColor: COLORS.feature.internet,
    primaryOpacity: OPACITIES.low,
    secondaryOpacity: OPACITIES.veryLow,
  },
  /** Starlink - Yellow for satellite/sun theme */
  starlink: {
    secondaryColor: COLORS.feature.starlink,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Device Settings - Pink (bright) */
  deviceSettings: {
    primaryColor: COLORS.feature.device,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Connected Clients - Pink for users/social */
  clients: {
    primaryColor: COLORS.feature.clients,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** QR Code - Indigo (bright, distinct from purple Tailscale) with vibrant accent */
  qrcode: {
    primaryColor: COLORS.feature.qrcode,
    primaryOpacity: OPACITIES.full,
    secondaryOpacity: OPACITIES.high,
  },
} as const;

/**
 * Helper function to get OS-specific color and icon
 * @param os - Operating system string
 * @returns Object with icon name, color, and family
 */
export function getOSInfo(os: string): { icon: string; color: string; family: 'brands' } {
  const osLower = os.toLowerCase();

  if (osLower.includes('linux')) {
    return { icon: 'linux', color: COLORS.os.linux, family: 'brands' };
  } else if (osLower.includes('android')) {
    return { icon: 'android', color: COLORS.os.android, family: 'brands' };
  } else if (osLower.includes('windows')) {
    return { icon: 'windows', color: COLORS.os.windows, family: 'brands' };
  } else if (osLower.includes('mac') || osLower.includes('ios') || osLower.includes('ipad')) {
    return { icon: 'apple', color: COLORS.os.apple, family: 'brands' };
  }

  return { icon: 'computer', color: COLORS.os.default, family: 'brands' };
}

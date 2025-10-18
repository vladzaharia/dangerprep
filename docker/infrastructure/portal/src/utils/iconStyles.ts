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
 */
export const COLORS = {
  /** Primary semantic colors */
  semantic: {
    success: '#10b981', // Green - success states, connected, active
    warning: '#f59e0b', // Amber - warnings, caution states
    danger: '#ef4444', // Red - errors, disconnected, critical
    info: '#3b82f6', // Blue - informational, brand
  },

  /** Feature-specific colors */
  feature: {
    wifi: '#3b82f6', // Blue - WiFi and hotspot
    ethernet: '#10b981', // Green - Ethernet connections
    tailscale: '#a855f7', // Purple - Tailscale/VPN
    network: '#10b981', // Green - Network/IP addresses
    gateway: '#ef4444', // Red - Gateway indicators
    security: '#a855f7', // Purple - Security/encryption
    exitNode: '#fb923c', // Orange - Exit nodes
    appConnector: '#8b5cf6', // Purple variant - App connectors
  },

  /** UI element colors */
  ui: {
    device: '#6366f1', // Indigo - Device/client icons
    upload: '#3b82f6', // Blue - Upload indicators
    download: '#f59e0b', // Amber - Download indicators
    maintenance: '#f59e0b', // Amber - Maintenance mode
    ipv6: '#8b5cf6', // Purple variant - IPv6 addresses
    tag: '#6366f1', // Indigo - Generic tags
  },

  /** Neutral/state colors */
  neutral: {
    gray: '#6b7280', // Gray - Inactive, unknown, default
    loopback: '#6b7280', // Gray - Loopback interfaces
    bridge: '#6b7280', // Gray - Bridge interfaces
    virtual: '#6b7280', // Gray - Virtual interfaces
  },

  /** Operating system brand colors */
  os: {
    linux: '#FCC624', // Yellow-orange - Linux
    android: '#3DDC84', // Green - Android
    windows: '#0078D4', // Blue - Windows
    apple: '#A855F7', // Purple - macOS/iOS/iPadOS
    default: '#6b7280', // Gray - Unknown OS
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
  /** WiFi/Hotspot interfaces - Blue with lower primary opacity */
  wifi: {
    primaryColor: COLORS.feature.wifi,
    secondaryColor: COLORS.feature.wifi,
    primaryOpacity: OPACITIES.veryLow,
    secondaryOpacity: OPACITIES.medium,
  },
  hotspot: {
    primaryColor: COLORS.feature.wifi,
    secondaryColor: COLORS.feature.wifi,
    primaryOpacity: OPACITIES.veryLow,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Ethernet interfaces - Green */
  ethernet: {
    primaryColor: COLORS.feature.ethernet,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Tailscale/VPN - Purple */
  tailscale: {
    primaryColor: COLORS.feature.tailscale,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Settings - Blue with subtle secondary */
  settings: {
    primaryColor: COLORS.semantic.info,
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
  /** Network/IP - Green */
  network: {
    primaryColor: COLORS.feature.network,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** IPv6 addresses - Purple variant */
  ipv6: {
    primaryColor: COLORS.ui.ipv6,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Gateway - Red secondary */
  gateway: {
    secondaryColor: COLORS.feature.gateway,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.low,
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
  /** App Connector - Purple variant */
  appConnector: {
    primaryColor: COLORS.feature.appConnector,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Routes - Green */
  routes: {
    primaryColor: COLORS.semantic.success,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
  },
  /** Tags - Indigo */
  tag: {
    primaryColor: COLORS.ui.tag,
    primaryOpacity: OPACITIES.high,
    secondaryOpacity: OPACITIES.medium,
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

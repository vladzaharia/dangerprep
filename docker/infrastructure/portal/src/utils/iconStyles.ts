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
 * Creates a React CSSProperties object for FontAwesome duotone icon styling
 *
 * @param config - Icon style configuration
 * @returns React CSSProperties object with FontAwesome CSS custom properties
 *
 * @example
 * // Color only the primary layer
 * const style = createIconStyle({
 *   primaryColor: '#3b82f6',
 *   primaryOpacity: 0.9,
 *   secondaryOpacity: 0.8
 * });
 *
 * @example
 * // Color both layers
 * const style = createIconStyle({
 *   primaryColor: '#3b82f6',
 *   secondaryColor: '#10b981',
 *   primaryOpacity: 0.6,
 *   secondaryOpacity: 0.8
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
 */
export const ICON_STYLES = {
  /** WiFi/Hotspot interfaces - Blue secondary with lower primary opacity */
  wifi: {
    primaryColor: '#3b82f6',
    secondaryColor: '#3b82f6',
    primaryOpacity: 0.6,
    secondaryOpacity: 0.8,
  },
  hotspot: {
    primaryColor: '#3b82f6',
    secondaryColor: '#3b82f6',
    primaryOpacity: 0.6,
    secondaryOpacity: 0.8,
  },
  /** Ethernet interfaces - Green */
  ethernet: {
    primaryColor: '#10b981',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Tailscale/VPN - Purple */
  tailscale: {
    primaryColor: '#a855f7',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Loopback - Gray */
  loopback: {
    primaryColor: '#6b7280',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Bridge - Gray */
  bridge: {
    primaryColor: '#6b7280',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Virtual - Gray */
  virtual: {
    primaryColor: '#6b7280',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Unknown - Gray */
  unknown: {
    primaryColor: '#6b7280',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Network/IP - Green */
  network: {
    primaryColor: '#10b981',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Gateway - Red secondary */
  gateway: {
    secondaryColor: '#ef4444',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.7,
  },
  /** Security/Key - Purple secondary */
  security: {
    secondaryColor: '#a855f7',
    primaryOpacity: 0.7,
    secondaryOpacity: 0.5,
  },
  /** Signal - Green secondary */
  signal: {
    secondaryColor: '#10b981',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.55,
  },
  /** Power/Danger - Red */
  danger: {
    primaryColor: '#ef4444',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Warning - Amber */
  warning: {
    primaryColor: '#f59e0b',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Success - Green */
  success: {
    primaryColor: '#10b981',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Brand/Info - Blue */
  brand: {
    primaryColor: '#3b82f6',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
  /** Neutral/Gray */
  neutral: {
    primaryColor: '#6b7280',
    primaryOpacity: 0.9,
    secondaryOpacity: 0.8,
  },
} as const;

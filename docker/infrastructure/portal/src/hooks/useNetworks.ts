import React, { useState, useEffect } from 'react';

// React 19 use hook with fallback for older versions
const useHook = (React as any).use || ((promise: Promise<any>) => {
  throw promise; // Fallback behavior for Suspense
});

/**
 * Base network interface information
 */
export interface BaseNetworkInterface {
  name: string;
  type: 'ethernet' | 'wifi' | 'tailscale' | 'hotspot' | 'loopback' | 'unknown';
  state: 'up' | 'down' | 'unknown';
  ipAddress?: string;
  gateway?: string;
  netmask?: string;
  dnsServers?: string[];
  macAddress?: string;
  mtu?: number;
}

/**
 * Ethernet interface information
 */
export interface EthernetInterface extends BaseNetworkInterface {
  type: 'ethernet';
  speed?: string;
  duplex?: 'full' | 'half' | 'unknown';
  driver?: string;
  linkDetected?: boolean;
}

/**
 * WiFi interface information
 */
export interface WiFiInterface extends BaseNetworkInterface {
  type: 'wifi';
  ssid?: string;
  signalStrength?: number;
  frequency?: string;
  channel?: number;
  security?: string;
  mode?: 'managed' | 'ap' | 'monitor' | 'unknown';
  connectedClients?: number;
}

/**
 * Tailscale interface information
 */
export interface TailscaleInterface extends BaseNetworkInterface {
  type: 'tailscale';
  status: 'connected' | 'disconnected' | 'starting' | 'stopped';
  tailnetName?: string;
  nodeKey?: string;
  peers?: TailscalePeer[];
  exitNode?: boolean;
  routeAdvertising?: string[];
}

/**
 * Tailscale peer information
 */
export interface TailscalePeer {
  hostname: string;
  ipAddress: string;
  online: boolean;
  lastSeen?: string;
  os?: string;
  exitNode?: boolean;
}

/**
 * Hotspot interface information
 */
export interface HotspotInterface extends BaseNetworkInterface {
  type: 'hotspot';
  ssid: string;
  password: string;
  wpaType?: 'WPA2' | 'WPA3' | 'WPA2/WPA3';
  channel?: number;
  frequency?: string;
  connectedClients?: number;
  maxClients?: number;
  hidden?: boolean;
}

/**
 * Network interface union type
 */
export type NetworkInterface = EthernetInterface | WiFiInterface | TailscaleInterface | HotspotInterface | BaseNetworkInterface;



/**
 * Network summary for listing interfaces
 */
export interface NetworkSummary {
  interfaces: NetworkInterface[];
  internetInterface?: string;
  hotspotInterface?: string;
  tailscaleInterface?: string;
  totalInterfaces: number;
}

/**
 * API response structure
 */
interface NetworkApiResponse<T> {
  success: boolean;
  data: T;
  metadata: {
    timestamp: string;
    [key: string]: any;
  };
  error?: string;
  message?: string;
}

/**
 * Cache for network data
 */
const networkCache = new Map<string, Promise<any>>();

/**
 * Fetch network summary from API
 */
async function fetchNetworkSummary(detailed: boolean = false): Promise<NetworkSummary> {
  const url = detailed ? '/api/networks?detailed=true' : '/api/networks';
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch network summary: ${response.status} ${response.statusText}`);
  }

  const networkResponse: NetworkApiResponse<NetworkSummary> = await response.json();

  if (!networkResponse.success) {
    throw new Error(networkResponse.error || 'Failed to retrieve network summary');
  }

  return networkResponse.data;
}

/**
 * Fetch specific network interface from API
 */
async function fetchNetworkInterface(interfaceName: string): Promise<NetworkInterface> {
  const response = await fetch(`/api/networks/${interfaceName}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Network interface '${interfaceName}' not found`);
    }
    throw new Error(`Failed to fetch network interface: ${response.status} ${response.statusText}`);
  }

  const networkResponse: NetworkApiResponse<{ interface: NetworkInterface }> = await response.json();

  if (!networkResponse.success) {
    throw new Error(networkResponse.error || 'Failed to retrieve network interface');
  }

  return networkResponse.data.interface;
}



/**
 * Refresh network cache
 */
async function refreshNetworkCache(): Promise<void> {
  const response = await fetch('/api/networks/refresh', { method: 'POST' });

  if (!response.ok) {
    throw new Error(`Failed to refresh network cache: ${response.status} ${response.statusText}`);
  }

  const refreshResponse: NetworkApiResponse<{ message: string }> = await response.json();

  if (!refreshResponse.success) {
    throw new Error(refreshResponse.error || 'Failed to refresh network cache');
  }
}

/**
 * Get cached network summary or create new fetch promise
 */
function getCachedNetworkSummary(detailed: boolean = false): Promise<NetworkSummary> {
  const cacheKey = detailed ? 'network-summary-detailed' : 'network-summary';

  if (!networkCache.has(cacheKey)) {
    const promise = fetchNetworkSummary(detailed).catch((error) => {
      // Remove failed promise from cache so it can be retried
      networkCache.delete(cacheKey);
      throw error;
    });

    networkCache.set(cacheKey, promise);
  }

  return networkCache.get(cacheKey)!;
}

/**
 * Get cached network interface or create new fetch promise
 */
function getCachedNetworkInterface(interfaceName: string): Promise<NetworkInterface> {
  const cacheKey = `network-interface-${interfaceName}`;

  if (!networkCache.has(cacheKey)) {
    const promise = fetchNetworkInterface(interfaceName).catch((error) => {
      // Remove failed promise from cache so it can be retried
      networkCache.delete(cacheKey);
      throw error;
    });

    networkCache.set(cacheKey, promise);
  }

  return networkCache.get(cacheKey)!;
}

/**
 * Hook for getting network summary with React 19 Suspense support
 */
export function useNetworkSummary(detailed: boolean = false): NetworkSummary {
  return useHook(getCachedNetworkSummary(detailed));
}

/**
 * Hook for getting specific network interface with React 19 Suspense support
 */
export function useNetworkInterface(interfaceName: string): NetworkInterface {
  return useHook(getCachedNetworkInterface(interfaceName));
}

/**
 * Hook for getting hotspot interface
 */
export function useHotspotInterface(): NetworkInterface | null {
  try {
    return useHook(getCachedNetworkInterface('hotspot'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return null;
    }
    throw error;
  }
}

/**
 * Hook for getting internet interface
 */
export function useInternetInterface(): NetworkInterface | null {
  try {
    return useHook(getCachedNetworkInterface('internet'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return null;
    }
    throw error;
  }
}

/**
 * Hook for getting Tailscale interface
 */
export function useTailscaleInterface(): NetworkInterface | null {
  try {
    return useHook(getCachedNetworkInterface('tailscale'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return null;
    }
    throw error;
  }
}

/**
 * Traditional hook for network summary with loading states (fallback for non-Suspense usage)
 */
export function useNetworkSummaryWithLoading(detailed: boolean = false) {
  const [summary, setSummary] = useState<NetworkSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Clear cache and fetch fresh data
      const cacheKey = detailed ? 'network-summary-detailed' : 'network-summary';
      networkCache.delete(cacheKey);
      
      const data = await fetchNetworkSummary(detailed);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [detailed]);

  return {
    summary,
    loading,
    error,
    refresh,
  };
}

/**
 * Traditional hook for specific network interface with loading states
 */
export function useNetworkInterfaceWithLoading(interfaceName: string) {
  const [networkInterface, setNetworkInterface] = useState<NetworkInterface | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Clear cache and fetch fresh data
      const cacheKey = `network-interface-${interfaceName}`;
      networkCache.delete(cacheKey);
      
      const data = await fetchNetworkInterface(interfaceName);
      setNetworkInterface(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setNetworkInterface(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (interfaceName) {
      refresh();
    }
  }, [interfaceName]);

  return {
    networkInterface,
    loading,
    error,
    refresh,
  };
}

// =============================================================================
// Simplified WiFi/Hotspot Access (for backward compatibility)
// =============================================================================

/**
 * Get hotspot interface data (replaces useWifi functionality)
 * Frontend should use this for WiFi/hotspot information
 */
export function useWifi(): HotspotInterface | null {
  return useHotspotInterface() as HotspotInterface | null;
}

/**
 * Get hotspot interface with loading states (replaces useWifiWithLoading)
 */
export function useWifiWithLoading() {
  return useNetworkInterfaceWithLoading('hotspot');
}

/**
 * Clear network cache (useful for testing or manual refresh)
 */
export function clearNetworkCache() {
  networkCache.clear();
}

/**
 * Clear specific network cache entry
 */
export function clearNetworkCacheEntry(key: string) {
  networkCache.delete(key);
}

/**
 * Refresh network cache and clear all cached data
 */
export async function refreshAndClearCache() {
  try {
    await refreshNetworkCache();
    clearNetworkCache();
  } catch (error) {
    console.error('Failed to refresh network cache:', error);
    throw error;
  }
}

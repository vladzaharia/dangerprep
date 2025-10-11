import React, { useState, useEffect } from 'react';

// React 19 use hook with fallback for older versions
const useHook = (React as any).use || ((promise: Promise<any>) => {
  throw promise; // Fallback behavior for Suspense
});

/**
 * Network information structure
 */
export interface NetworkInfo {
  ipAddress?: string;
  gateway?: string;
  dnsServers?: string[];
  subnetMask?: string;
  interface?: string;
}

/**
 * WiFi configuration data structure from the API
 */
export interface WifiData {
  ssid: string;
  password: string;
  network?: NetworkInfo;
}

/**
 * WiFi API response structure
 */
interface WifiApiResponse {
  success: boolean;
  data: WifiData;
  error?: string;
  metadata: {
    source: 'hostapd' | 'environment' | 'default';
    timestamp: string;
    includesNetwork?: boolean;
  };
}

/**
 * WiFi data with metadata
 */
export interface WifiWithMetadata {
  wifi: WifiData;
  source: 'hostapd' | 'environment' | 'default';
}

/**
 * Cache for WiFi configuration data
 */
const wifiCache = new Map<string, Promise<WifiWithMetadata>>();

/**
 * Fetch WiFi configuration from API
 */
async function fetchWifi(includeNetwork: boolean = false): Promise<WifiWithMetadata> {
  const url = includeNetwork ? '/api/wifi?includeNetwork=true' : '/api/wifi';
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch WiFi configuration: ${response.status} ${response.statusText}`);
  }

  const wifiResponse: WifiApiResponse = await response.json();

  if (!wifiResponse.success) {
    throw new Error(wifiResponse.error || 'Failed to retrieve WiFi configuration');
  }

  return {
    wifi: wifiResponse.data,
    source: wifiResponse.metadata.source,
  };
}

/**
 * Get cached WiFi configuration or create new fetch promise
 */
function getCachedWifi(includeNetwork: boolean = false): Promise<WifiWithMetadata> {
  const cacheKey = includeNetwork ? 'wifi-config-with-network' : 'wifi-config';

  if (!wifiCache.has(cacheKey)) {
    const promise = fetchWifi(includeNetwork).catch((error) => {
      // Remove failed promise from cache so it can be retried
      wifiCache.delete(cacheKey);

      // Return fallback configuration
      console.error('WiFi configuration fetch error, using fallback:', error);
      return {
        wifi: {
          ssid: import.meta.env.VITE_WIFI_SSID || 'DangerPrep',
          password: import.meta.env.VITE_WIFI_PASSWORD || 'change_me',
        },
        source: 'default' as const,
      };
    });

    wifiCache.set(cacheKey, promise);
  }

  return wifiCache.get(cacheKey)!;
}

/**
 * Modern React 19 hook for WiFi configuration using Suspense
 * This hook throws promises for Suspense boundaries to catch
 */
export function useWifi(): WifiWithMetadata {
  const wifiPromise = getCachedWifi();
  return useHook(wifiPromise);
}

/**
 * Modern React 19 hook for WiFi configuration with network information using Suspense
 * This hook throws promises for Suspense boundaries to catch
 */
export function useWifiWithNetwork(): WifiWithMetadata {
  const wifiPromise = getCachedWifi(true);
  return useHook(wifiPromise);
}

/**
 * Traditional hook for WiFi configuration (for components not using Suspense)
 */
export function useWifiTraditional() {
  const [wifi, setWifi] = useState<WifiData | null>(null);
  const [source, setSource] = useState<'hostapd' | 'environment' | 'default' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWifi = async () => {
      try {
        setLoading(true);
        setError(null);
        const wifiData = await getCachedWifi();
        setWifi(wifiData.wifi);
        setSource(wifiData.source);
      } catch (err) {
        console.error('WiFi configuration fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load WiFi configuration');

        // Set fallback configuration
        setWifi({
          ssid: import.meta.env.VITE_WIFI_SSID || 'DangerPrep',
          password: import.meta.env.VITE_WIFI_PASSWORD || 'change_me',
        });
        setSource('default');
      } finally {
        setLoading(false);
      }
    };

    loadWifi();
  }, []);

  const refresh = () => {
    wifiCache.clear();
    setWifi(null);
    setSource(null);
    setError(null);
    setLoading(true);
  };

  return {
    wifi: wifi || { ssid: 'DangerPrep', password: 'change_me' },
    source: source || 'default',
    loading,
    error,
    refresh,
  };
}

/**
 * Clear WiFi cache (useful for testing or manual refresh)
 */
export function clearWifiCache() {
  wifiCache.clear();
}

/**
 * Clear specific WiFi cache entry
 */
export function clearWifiCacheEntry(includeNetwork: boolean = false) {
  const cacheKey = includeNetwork ? 'wifi-config-with-network' : 'wifi-config';
  wifiCache.delete(cacheKey);
}

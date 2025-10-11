import { useState, useEffect } from 'react';

/**
 * WiFi configuration data structure from the API
 */
export interface WifiData {
  ssid: string;
  password: string;
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
  };
}

/**
 * Modern React 19 hook for fetching WiFi configuration
 * Uses proper error boundaries and suspense patterns
 */
export function useWifi() {
  const [wifi, setWifi] = useState<WifiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'hostapd' | 'environment' | 'default' | null>(null);

  useEffect(() => {
    const fetchWifi = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/wifi');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch WiFi configuration: ${response.status} ${response.statusText}`);
        }

        const wifiResponse: WifiApiResponse = await response.json();
        
        if (!wifiResponse.success) {
          throw new Error(wifiResponse.error || 'Failed to retrieve WiFi configuration');
        }

        setWifi(wifiResponse.data);
        setSource(wifiResponse.metadata.source);
      } catch (err) {
        console.error('WiFi configuration fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load WiFi configuration');
        
        // Fallback to default values
        const fallbackWifi: WifiData = {
          ssid: import.meta.env.VITE_WIFI_SSID || 'DangerPrep',
          password: import.meta.env.VITE_WIFI_PASSWORD || 'change_me',
        };
        
        setWifi(fallbackWifi);
        setSource('default');
      } finally {
        setLoading(false);
      }
    };

    fetchWifi();
  }, []);

  // Refresh function for manual updates
  const refresh = async () => {
    setWifi(null);
    setError(null);
    setSource(null);
    setLoading(true);
    
    // Re-trigger the fetch
    const fetchWifi = async () => {
      try {
        const response = await fetch('/api/wifi');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch WiFi configuration: ${response.status} ${response.statusText}`);
        }

        const wifiResponse: WifiApiResponse = await response.json();
        
        if (!wifiResponse.success) {
          throw new Error(wifiResponse.error || 'Failed to retrieve WiFi configuration');
        }

        setWifi(wifiResponse.data);
        setSource(wifiResponse.metadata.source);
      } catch (err) {
        console.error('WiFi configuration fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load WiFi configuration');
        
        // Fallback to default values
        const fallbackWifi: WifiData = {
          ssid: import.meta.env.VITE_WIFI_SSID || 'DangerPrep',
          password: import.meta.env.VITE_WIFI_PASSWORD || 'change_me',
        };
        
        setWifi(fallbackWifi);
        setSource('default');
      } finally {
        setLoading(false);
      }
    };

    await fetchWifi();
  };

  return {
    wifi: wifi || { ssid: 'DangerPrep', password: 'change_me' },
    loading,
    error,
    source,
    refresh,
  };
}

/**
 * Suspense-compatible WiFi hook for React 19
 * Throws promises during loading state for Suspense boundaries
 */
export function useWifiSuspense(): { wifi: WifiData; source: 'hostapd' | 'environment' | 'default' } {
  const [wifi, setWifi] = useState<WifiData | null>(null);
  const [source, setSource] = useState<'hostapd' | 'environment' | 'default' | null>(null);
  const [promise, setPromise] = useState<Promise<void> | null>(null);

  if (!wifi && !promise) {
    const fetchPromise = fetch('/api/wifi')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch WiFi configuration: ${response.status} ${response.statusText}`);
        }

        const wifiResponse: WifiApiResponse = await response.json();
        
        if (!wifiResponse.success) {
          throw new Error(wifiResponse.error || 'Failed to retrieve WiFi configuration');
        }

        setWifi(wifiResponse.data);
        setSource(wifiResponse.metadata.source);
        setPromise(null);
      })
      .catch((err) => {
        console.error('WiFi configuration fetch error:', err);
        
        // Fallback to default values
        const fallbackWifi: WifiData = {
          ssid: import.meta.env.VITE_WIFI_SSID || 'DangerPrep',
          password: import.meta.env.VITE_WIFI_PASSWORD || 'change_me',
        };
        
        setWifi(fallbackWifi);
        setSource('default');
        setPromise(null);
      });

    setPromise(fetchPromise);
  }

  if (promise) {
    throw promise;
  }

  return {
    wifi: wifi!,
    source: source!,
  };
}

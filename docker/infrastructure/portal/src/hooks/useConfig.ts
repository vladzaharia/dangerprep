import { useState, useEffect } from 'react';

/**
 * Configuration data structure from the API
 */
export interface ConfigData {
  wifi: {
    ssid: string;
    password: string;
  };
  services: {
    baseDomain: string;
    jellyfin: string;
    kiwix: string;
    romm: string;
    docmost: string;
    onedev: string;
    traefik: string;
    komodo: string;
  };
  app: {
    title: string;
    description: string;
  };
  metadata: {
    lastUpdated: string;
    nodeEnv: string;
  };
}

/**
 * Hook for fetching runtime configuration from the API
 * This replaces build-time environment variables with runtime configuration
 */
export function useConfig() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/config');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch configuration: ${response.status} ${response.statusText}`);
        }

        const configData: ConfigData = await response.json();
        setConfig(configData);
      } catch (err) {
        console.error('Configuration fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
        
        // Fallback to build-time environment variables if API fails
        const fallbackConfig: ConfigData = {
          wifi: {
            ssid: import.meta.env.VITE_WIFI_SSID || 'DangerPrep',
            password: import.meta.env.VITE_WIFI_PASSWORD || 'change_me',
          },
          services: {
            baseDomain: import.meta.env.VITE_BASE_DOMAIN || 'danger.diy',
            jellyfin: import.meta.env.VITE_JELLYFIN_SUBDOMAIN || 'media',
            kiwix: import.meta.env.VITE_KIWIX_SUBDOMAIN || 'kiwix',
            romm: import.meta.env.VITE_ROMM_SUBDOMAIN || 'retro',
            docmost: import.meta.env.VITE_DOCMOST_SUBDOMAIN || 'docmost',
            onedev: import.meta.env.VITE_ONEDEV_SUBDOMAIN || 'onedev',
            traefik: import.meta.env.VITE_TRAEFIK_SUBDOMAIN || 'traefik',
            komodo: import.meta.env.VITE_KOMODO_SUBDOMAIN || 'docker',
          },
          app: {
            title: import.meta.env.VITE_APP_TITLE || 'DangerPrep Portal',
            description: import.meta.env.VITE_APP_DESCRIPTION || 'Your portable hotspot services portal',
          },
          metadata: {
            lastUpdated: new Date().toISOString(),
            nodeEnv: 'fallback',
          },
        };
        
        setConfig(fallbackConfig);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // Refresh function for manual updates
  const refresh = () => {
    setConfig(null);
    setError(null);
    // Re-trigger the useEffect
    window.location.reload();
  };

  return {
    config,
    loading,
    error,
    refresh,
  };
}

/**
 * Hook for getting WiFi configuration specifically
 */
export function useWiFiConfig() {
  const { config, loading, error, refresh } = useConfig();
  
  return {
    wifi: config?.wifi || { ssid: 'DangerPrep', password: 'change_me' },
    loading,
    error,
    refresh,
  };
}

/**
 * Hook for getting service configuration specifically
 */
export function useServiceConfig() {
  const { config, loading, error, refresh } = useConfig();
  
  return {
    services: config?.services || {
      baseDomain: 'danger.diy',
      jellyfin: 'media',
      kiwix: 'kiwix',
      romm: 'retro',
      docmost: 'docmost',
      onedev: 'onedev',
      traefik: 'traefik',
      komodo: 'docker',
    },
    loading,
    error,
    refresh,
  };
}

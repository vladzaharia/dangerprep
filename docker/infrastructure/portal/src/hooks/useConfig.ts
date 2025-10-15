import React, { useState, useEffect } from 'react';

// React 19 use hook with fallback for older versions
const useHook =
  (React as any).use ||
  ((promise: Promise<any>) => {
    throw promise; // Fallback behavior for Suspense
  });

/**
 * App configuration data structure
 */
export interface AppConfig {
  app: {
    title: string;
    description: string;
  };
  global: {
    baseDomain: string;
    kioskMode: boolean;
  };
  metadata: {
    lastUpdated: string;
    nodeEnv: string;
  };
}

/**
 * Configuration data structure from the API (legacy)
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
 * API response structure
 */
interface ConfigApiResponse {
  success: boolean;
  data: AppConfig;
}

/**
 * Cache for configuration data
 */
const configCache = new Map<string, Promise<AppConfig>>();

/**
 * Fetch app configuration from API
 */
async function fetchConfig(): Promise<AppConfig> {
  const response = await fetch('/api/config/app');

  if (!response.ok) {
    throw new Error(`Failed to fetch configuration: ${response.status} ${response.statusText}`);
  }

  const configResponse: ConfigApiResponse = await response.json();

  if (!configResponse.success) {
    throw new Error('Failed to retrieve configuration');
  }

  return configResponse.data;
}
/**
 * Get cached configuration or create new fetch promise
 */
function getCachedConfig(): Promise<AppConfig> {
  const cacheKey = 'app-config';

  if (!configCache.has(cacheKey)) {
    const promise = fetchConfig().catch(error => {
      // Remove failed promise from cache so it can be retried
      configCache.delete(cacheKey);

      // Return fallback configuration
      console.error('Configuration fetch error, using fallback:', error);
      return {
        app: {
          title: import.meta.env.VITE_APP_TITLE || 'DangerPrep Portal',
          description:
            import.meta.env.VITE_APP_DESCRIPTION || 'Your portable hotspot services portal',
        },
        global: {
          baseDomain: import.meta.env.VITE_BASE_DOMAIN || 'danger.diy',
          kioskMode: false,
        },
        metadata: {
          lastUpdated: new Date().toISOString(),
          nodeEnv: 'fallback',
        },
      };
    });

    configCache.set(cacheKey, promise);
  }

  return configCache.get(cacheKey)!;
}

/**
 * Modern React 19 hook for app configuration using Suspense
 * This hook throws promises for Suspense boundaries to catch
 */
export function useAppConfig(): AppConfig {
  const configPromise = getCachedConfig();
  return useHook(configPromise);
}

/**
 * Traditional hook for app configuration (for components not using Suspense)
 */
export function useAppConfigTraditional() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        setError(null);
        const configData = await getCachedConfig();
        setConfig(configData);
      } catch (err) {
        console.error('Configuration fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load configuration');

        // Set fallback configuration
        setConfig({
          app: {
            title: import.meta.env.VITE_APP_TITLE || 'DangerPrep Portal',
            description:
              import.meta.env.VITE_APP_DESCRIPTION || 'Your portable hotspot services portal',
          },
          global: {
            baseDomain: import.meta.env.VITE_BASE_DOMAIN || 'danger.diy',
            kioskMode: false,
          },
          metadata: {
            lastUpdated: new Date().toISOString(),
            nodeEnv: 'fallback',
          },
        });
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  const refresh = () => {
    configCache.clear();
    setConfig(null);
    setError(null);
    setLoading(true);
  };

  return {
    config: config || {
      app: {
        title: 'DangerPrep Portal',
        description: 'Your portable hotspot services portal',
      },
      global: {
        baseDomain: 'danger.diy',
        kioskMode: false,
      },
      metadata: {
        lastUpdated: new Date().toISOString(),
        nodeEnv: 'fallback',
      },
    },
    loading,
    error,
    refresh,
  };
}

/**
 * Legacy hook for getting service configuration specifically
 * Kept for backward compatibility with useServiceDiscovery
 */
export function useServiceConfig() {
  const { config, loading, error, refresh } = useAppConfigTraditional();

  return {
    services: {
      baseDomain: config?.global?.baseDomain || 'danger.diy',
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

/**
 * Clear configuration cache (useful for testing or manual refresh)
 */
export function clearConfigCache() {
  configCache.clear();
}

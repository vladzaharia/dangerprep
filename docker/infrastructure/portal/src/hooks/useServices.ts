import { useState, useEffect } from 'react';

/**
 * Service configuration data structure
 */
export interface ServiceConfig {
  baseDomain: string;
  jellyfin: string;
  kiwix: string;
  romm: string;
  docmost: string;
  onedev: string;
  traefik: string;
  komodo: string;
}

/**
 * App configuration data structure
 */
export interface AppConfig {
  title: string;
  description: string;
}

/**
 * Combined configuration from /api/config/app
 */
interface AppConfigResponse {
  success: boolean;
  data: {
    app: AppConfig;
    services: ServiceConfig;
    metadata: {
      lastUpdated: string;
      nodeEnv: string;
    };
  };
}

/**
 * Modern React 19 hook for fetching service configuration
 */
export function useServices() {
  const [services, setServices] = useState<ServiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/config/app');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch service configuration: ${response.status} ${response.statusText}`);
        }

        const configResponse: AppConfigResponse = await response.json();
        
        if (!configResponse.success) {
          throw new Error('Failed to retrieve service configuration');
        }

        setServices(configResponse.data.services);
      } catch (err) {
        console.error('Service configuration fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load service configuration');
        
        // Fallback to build-time environment variables
        const fallbackServices: ServiceConfig = {
          baseDomain: import.meta.env.VITE_BASE_DOMAIN || 'danger.diy',
          jellyfin: import.meta.env.VITE_JELLYFIN_SUBDOMAIN || 'media',
          kiwix: import.meta.env.VITE_KIWIX_SUBDOMAIN || 'kiwix',
          romm: import.meta.env.VITE_ROMM_SUBDOMAIN || 'retro',
          docmost: import.meta.env.VITE_DOCMOST_SUBDOMAIN || 'docmost',
          onedev: import.meta.env.VITE_ONEDEV_SUBDOMAIN || 'onedev',
          traefik: import.meta.env.VITE_TRAEFIK_SUBDOMAIN || 'traefik',
          komodo: import.meta.env.VITE_KOMODO_SUBDOMAIN || 'docker',
        };
        
        setServices(fallbackServices);
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  // Refresh function for manual updates
  const refresh = async () => {
    setServices(null);
    setError(null);
    setLoading(true);
    
    // Re-trigger the fetch
    try {
      const response = await fetch('/api/config/app');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch service configuration: ${response.status} ${response.statusText}`);
      }

      const configResponse: AppConfigResponse = await response.json();
      
      if (!configResponse.success) {
        throw new Error('Failed to retrieve service configuration');
      }

      setServices(configResponse.data.services);
    } catch (err) {
      console.error('Service configuration fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load service configuration');
      
      // Fallback to build-time environment variables
      const fallbackServices: ServiceConfig = {
        baseDomain: import.meta.env.VITE_BASE_DOMAIN || 'danger.diy',
        jellyfin: import.meta.env.VITE_JELLYFIN_SUBDOMAIN || 'media',
        kiwix: import.meta.env.VITE_KIWIX_SUBDOMAIN || 'kiwix',
        romm: import.meta.env.VITE_ROMM_SUBDOMAIN || 'retro',
        docmost: import.meta.env.VITE_DOCMOST_SUBDOMAIN || 'docmost',
        onedev: import.meta.env.VITE_ONEDEV_SUBDOMAIN || 'onedev',
        traefik: import.meta.env.VITE_TRAEFIK_SUBDOMAIN || 'traefik',
        komodo: import.meta.env.VITE_KOMODO_SUBDOMAIN || 'docker',
      };
      
      setServices(fallbackServices);
    } finally {
      setLoading(false);
    }
  };

  return {
    services: services || {
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

/**
 * Hook for fetching app configuration
 */
export function useAppConfig() {
  const [app, setApp] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchApp = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/config/app');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch app configuration: ${response.status} ${response.statusText}`);
        }

        const configResponse: AppConfigResponse = await response.json();
        
        if (!configResponse.success) {
          throw new Error('Failed to retrieve app configuration');
        }

        setApp(configResponse.data.app);
      } catch (err) {
        console.error('App configuration fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load app configuration');
        
        // Fallback to build-time environment variables
        const fallbackApp: AppConfig = {
          title: import.meta.env.VITE_APP_TITLE || 'DangerPrep Portal',
          description: import.meta.env.VITE_APP_DESCRIPTION || 'Your portable hotspot services portal',
        };
        
        setApp(fallbackApp);
      } finally {
        setLoading(false);
      }
    };

    fetchApp();
  }, []);

  return {
    app: app || {
      title: 'DangerPrep Portal',
      description: 'Your portable hotspot services portal',
    },
    loading,
    error,
  };
}

/**
 * Suspense-compatible services hook for React 19
 */
export function useServicesSuspense(): { services: ServiceConfig } {
  const [services, setServices] = useState<ServiceConfig | null>(null);
  const [promise, setPromise] = useState<Promise<void> | null>(null);

  if (!services && !promise) {
    const fetchPromise = fetch('/api/config/app')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch service configuration: ${response.status} ${response.statusText}`);
        }

        const configResponse: AppConfigResponse = await response.json();
        
        if (!configResponse.success) {
          throw new Error('Failed to retrieve service configuration');
        }

        setServices(configResponse.data.services);
        setPromise(null);
      })
      .catch((err) => {
        console.error('Service configuration fetch error:', err);
        
        // Fallback to build-time environment variables
        const fallbackServices: ServiceConfig = {
          baseDomain: import.meta.env.VITE_BASE_DOMAIN || 'danger.diy',
          jellyfin: import.meta.env.VITE_JELLYFIN_SUBDOMAIN || 'media',
          kiwix: import.meta.env.VITE_KIWIX_SUBDOMAIN || 'kiwix',
          romm: import.meta.env.VITE_ROMM_SUBDOMAIN || 'retro',
          docmost: import.meta.env.VITE_DOCMOST_SUBDOMAIN || 'docmost',
          onedev: import.meta.env.VITE_ONEDEV_SUBDOMAIN || 'onedev',
          traefik: import.meta.env.VITE_TRAEFIK_SUBDOMAIN || 'traefik',
          komodo: import.meta.env.VITE_KOMODO_SUBDOMAIN || 'docker',
        };
        
        setServices(fallbackServices);
        setPromise(null);
      });

    setPromise(fetchPromise);
  }

  if (promise) {
    throw promise;
  }

  return {
    services: services!,
  };
}

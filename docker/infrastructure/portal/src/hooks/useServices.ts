import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// React 19 use hook with fallback for older versions
const useHook = (React as any).use || ((promise: Promise<any>) => {
  throw promise; // Fallback behavior for Suspense
});

/**
 * Service metadata from the API
 */
export interface ServiceMetadata {
  name: string;
  description: string;
  icon: string;
  url?: string;
  type: 'public' | 'private' | 'maintenance';
  status: 'healthy' | 'warning' | 'error';
  version?: string;
}

/**
 * API response structure
 */
interface ServiceDiscoveryResponse {
  success: boolean;
  services: ServiceMetadata[];
  metadata: {
    lastScan: string;
    totalServices: number;
    baseDomain: string;
    cached: boolean;
  };
}

/**
 * Cache for services data
 */
const servicesCache = new Map<string, Promise<ServiceMetadata[]>>();

/**
 * Get fallback services based on service type and domain
 */
function getFallbackServices(serviceType: string, baseDomain: string): ServiceMetadata[] {
  const allServices: ServiceMetadata[] = [
    {
      name: 'Jellyfin',
      description: 'Media streaming server',
      icon: 'jellyfin',
      url: `https://media.${baseDomain}`,
      type: 'public',
      status: 'healthy',
    },
    {
      name: 'Kiwix',
      description: 'Offline Wikipedia and educational content',
      icon: 'kiwix',
      url: `https://kiwix.${baseDomain}`,
      type: 'public',
      status: 'healthy',
    },
    {
      name: 'ROMM',
      description: 'Retro gaming collection manager',
      icon: 'romm',
      url: `https://retro.${baseDomain}`,
      type: 'public',
      status: 'healthy',
    },
    {
      name: 'Docmost',
      description: 'Documentation and knowledge base',
      icon: 'docmost',
      url: `https://docmost.${baseDomain}`,
      type: 'public',
      status: 'healthy',
    },
    {
      name: 'OneDev',
      description: 'Git repository and CI/CD platform',
      icon: 'onedev',
      url: `https://onedev.${baseDomain}`,
      type: 'private',
      status: 'healthy',
    },
    {
      name: 'Traefik',
      description: 'Reverse proxy and load balancer dashboard',
      icon: 'traefik',
      url: `https://traefik.${baseDomain}`,
      type: 'maintenance',
      status: 'healthy',
    },
    {
      name: 'Komodo',
      description: 'Docker container management',
      icon: 'komodo',
      url: `https://docker.${baseDomain}`,
      type: 'maintenance',
      status: 'healthy',
    },
  ];

  return allServices.filter(service => service.type === serviceType);
}

/**
 * Fetch services from API
 */
async function fetchServices(serviceType?: string, domain?: string): Promise<ServiceMetadata[]> {
  const params = new URLSearchParams();
  if (serviceType) params.append('type', serviceType);
  if (domain) params.append('domain', domain);

  const url = `/api/services/discovery${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch services: ${response.status} ${response.statusText}`);
  }

  const servicesResponse: ServiceDiscoveryResponse = await response.json();

  if (!servicesResponse.success) {
    throw new Error('Failed to retrieve services');
  }

  return servicesResponse.services;
}

/**
 * Get cached services or create new fetch promise
 */
function getCachedServices(serviceType?: string, domain?: string): Promise<ServiceMetadata[]> {
  const cacheKey = `services-${serviceType || 'all'}-${domain || 'default'}`;

  if (!servicesCache.has(cacheKey)) {
    const promise = fetchServices(serviceType, domain).catch((error) => {
      // Remove failed promise from cache so it can be retried
      servicesCache.delete(cacheKey);

      // Return fallback services
      console.error('Services fetch error, using fallback:', error);
      const baseDomain = domain || import.meta.env.VITE_BASE_DOMAIN || 'danger.diy';
      return getFallbackServices(serviceType || 'public', baseDomain);
    });

    servicesCache.set(cacheKey, promise);
  }

  return servicesCache.get(cacheKey)!;
}

/**
 * Modern React 19 hook for services using Suspense
 */
export function useServices(serviceType?: 'public' | 'private' | 'maintenance'): ServiceMetadata[] {
  const [searchParams] = useSearchParams();
  const domainOverride = searchParams.get('domain');

  const servicesPromise = getCachedServices(serviceType, domainOverride || undefined);
  return useHook(servicesPromise);
}

/**
 * Traditional hook for services (for components not using Suspense)
 */
export function useServicesTraditional(serviceType?: 'public' | 'private' | 'maintenance') {
  const [services, setServices] = useState<ServiceMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  const domainOverride = searchParams.get('domain');

  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoading(true);
        setError(null);
        const servicesData = await getCachedServices(serviceType, domainOverride || undefined);
        setServices(servicesData);
      } catch (err) {
        console.error('Services fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load services');

        // Set fallback services
        const baseDomain = domainOverride || import.meta.env.VITE_BASE_DOMAIN || 'danger.diy';
        setServices(getFallbackServices(serviceType || 'public', baseDomain));
      } finally {
        setLoading(false);
      }
    };

    loadServices();
  }, [serviceType, domainOverride]);

  const refresh = () => {
    servicesCache.clear();
    setServices([]);
    setError(null);
    setLoading(true);
  };

  return {
    services,
    loading,
    error,
    refresh,
  };
}

/**
 * Clear services cache (useful for testing or manual refresh)
 */
export function clearServicesCache() {
  servicesCache.clear();
}

/**
 * Clear specific services cache entry
 */
export function clearServicesCacheEntry(serviceType?: string, domain?: string) {
  const cacheKey = `services-${serviceType || 'all'}-${domain || 'default'}`;
  servicesCache.delete(cacheKey);
}

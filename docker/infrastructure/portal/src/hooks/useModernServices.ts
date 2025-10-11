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
 * Fetch services from API
 */
async function fetchServices(serviceType?: string, domain?: string): Promise<ServiceMetadata[]> {
  const params = new URLSearchParams();
  if (domain) params.set('domain', domain);
  if (serviceType) params.set('type', serviceType);

  const apiUrl = `/api/services${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(apiUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch services: ${response.status} ${response.statusText}`);
  }

  const data: ServiceDiscoveryResponse = await response.json();
  
  if (!data.success) {
    throw new Error('Failed to retrieve services');
  }

  return data.services;
}

/**
 * Get fallback services for when API fails
 */
function getFallbackServices(serviceType: string, baseDomain: string): ServiceMetadata[] {
  const fallbackServices: Record<string, ServiceMetadata[]> = {
    public: [
      {
        name: 'Entertainment at Sea',
        description: 'Stream movies, TV shows, and more',
        icon: 'film',
        url: `https://media.${baseDomain}`,
        type: 'public',
        status: 'healthy',
      },
      {
        name: 'Games at Sea',
        description: 'Retro gaming library and emulation',
        icon: 'gamepad',
        url: `https://retro.${baseDomain}`,
        type: 'public',
        status: 'healthy',
      },
      {
        name: 'Wikipedia',
        description: 'Offline Wikipedia and educational content',
        icon: 'book',
        url: `https://kiwix.${baseDomain}`,
        type: 'public',
        status: 'healthy',
      },
    ],
    private: [
      {
        name: 'Docmost',
        description: 'Documentation and knowledge management',
        icon: 'file-text',
        url: `https://docmost.${baseDomain}`,
        type: 'private',
        status: 'healthy',
      },
      {
        name: 'OneDev',
        description: 'Git repository management and CI/CD',
        icon: 'git-branch',
        url: `https://onedev.${baseDomain}`,
        type: 'private',
        status: 'healthy',
      },
    ],
    maintenance: [
      {
        name: 'Traefik Dashboard',
        description: 'Reverse proxy and load balancer dashboard',
        icon: 'activity',
        url: `https://traefik.${baseDomain}`,
        type: 'maintenance',
        status: 'healthy',
      },
      {
        name: 'Komodo',
        description: 'Docker container management',
        icon: 'box',
        url: `https://docker.${baseDomain}`,
        type: 'maintenance',
        status: 'healthy',
      },
    ],
  };

  return fallbackServices[serviceType] || [];
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

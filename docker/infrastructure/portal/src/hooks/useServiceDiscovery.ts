import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

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
  services: ServiceMetadata[];
  metadata: {
    lastScan: string;
    totalServices: number;
    baseDomain: string;
    cached: boolean;
  };
}

/**
 * Hook for dynamic service discovery
 */
export function useServiceDiscovery(serviceType?: 'public' | 'private' | 'maintenance') {
  const [services, setServices] = useState<ServiceMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  // Get domain override from query parameters
  const domainOverride = searchParams.get('domain');

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoading(true);
        setError(null);

        // Build API URL with query parameters
        const params = new URLSearchParams();
        if (domainOverride) {
          params.set('domain', domainOverride);
        }
        if (serviceType) {
          params.set('type', serviceType);
        }

        const apiUrl = `/api/services${params.toString() ? `?${params.toString()}` : ''}`;
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch services: ${response.status} ${response.statusText}`);
        }

        const data: ServiceDiscoveryResponse = await response.json();
        
        setServices(data.services);
        setLastScan(data.metadata.lastScan);
      } catch (err) {
        console.error('Service discovery error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load services');
        
        // Fallback to empty array on error
        setServices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, [serviceType, domainOverride]);

  // Refresh function for manual updates
  const refresh = () => {
    setServices([]);
    setLastScan(null);
    // Trigger useEffect by changing a dependency (we'll use a timestamp)
    window.location.reload();
  };

  return {
    services,
    loading,
    error,
    lastScan,
    refresh,
    domainOverride,
  };
}

/**
 * Hook for getting services by type with fallback to hardcoded services
 */
export function useServicesWithFallback(serviceType: 'public' | 'private' | 'maintenance') {
  const { services, loading, error, ...rest } = useServiceDiscovery(serviceType);

  // Fallback services if API fails
  const fallbackServices: Record<string, ServiceMetadata[]> = {
    public: [
      {
        name: 'Entertainment at Sea',
        description: 'Stream movies, TV shows, and more',
        icon: 'film',
        url: `https://media.${rest.domainOverride || 'danger'}`,
        type: 'public',
        status: 'healthy',
      },
      {
        name: 'Games at Sea',
        description: 'Retro gaming library and emulation',
        icon: 'gamepad',
        url: `https://retro.${rest.domainOverride || 'danger'}`,
        type: 'public',
        status: 'healthy',
      },
      {
        name: 'Wikipedia',
        description: 'Offline Wikipedia and educational content',
        icon: 'book',
        url: `https://kiwix.${rest.domainOverride || 'danger'}`,
        type: 'public',
        status: 'healthy',
      },
    ],
    private: [
      {
        name: 'Docmost',
        description: 'Documentation and knowledge management',
        icon: 'file-text',
        url: `https://docs.${rest.domainOverride || 'danger'}`,
        type: 'private',
        status: 'healthy',
      },
      {
        name: 'OneDev',
        description: 'Git repository management and CI/CD',
        icon: 'git-branch',
        url: `https://dev.${rest.domainOverride || 'danger'}`,
        type: 'private',
        status: 'healthy',
      },
    ],
    maintenance: [
      {
        name: 'Traefik Dashboard',
        description: 'Reverse proxy and load balancer dashboard',
        icon: 'activity',
        url: `https://traefik.${rest.domainOverride || 'danger'}`,
        type: 'maintenance',
        status: 'healthy',
      },
      {
        name: 'Komodo',
        description: 'Docker container management',
        icon: 'box',
        url: `https://docker.${rest.domainOverride || 'danger'}`,
        type: 'maintenance',
        status: 'healthy',
      },
    ],
  };

  // Use API services if available, otherwise fallback
  const finalServices = services.length > 0 || !error ? services : fallbackServices[serviceType] || [];

  return {
    services: finalServices,
    loading,
    error,
    ...rest,
  };
}

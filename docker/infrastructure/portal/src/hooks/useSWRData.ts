import { useSearchParams } from 'react-router-dom';
import useSWR, { type SWRConfiguration } from 'swr';

import type { AppConfig } from '../server/services/ConfigService';
import type {
  NetworkSummary,
  NetworkInterface,
  TailscaleSettings,
  TailscaleExitNode,
} from '../types/network';
import type { ServiceMetadata } from '../types/service';

/**
 * Hostapd status response type
 */
export interface HostapdStatus {
  isConfigured: boolean;
  isRunning: boolean;
  configuredInterface?: string;
  activeInterface?: string;
  ssid?: string;
  actualSSID?: string;
  channel?: number;
  connectedClients?: number;
  security?: string;
  countryCode?: string;
  maxClients?: number;
  hidden?: boolean;
}

/**
 * Generic fetcher for API endpoints
 * Handles both wrapped and unwrapped API responses
 */
async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  // Handle both wrapped and unwrapped responses
  if (result.success !== undefined) {
    if (!result.success) {
      throw new Error(result.error || 'API request failed');
    }
    return result.data;
  }

  return result;
}

/**
 * Default SWR configuration for all hooks
 * Optimized for WiFi hotspot environment with React 19 Suspense
 */
const defaultConfig: SWRConfiguration = {
  refreshInterval: 5000, // Poll every 5 seconds
  revalidateOnFocus: true, // Refetch when window gains focus (kiosk mode!)
  revalidateOnReconnect: true, // Refetch when network reconnects (WiFi!)
  dedupingInterval: 2000, // Dedupe requests within 2 seconds
  errorRetryCount: 3, // Retry failed requests 3 times
  errorRetryInterval: 1000, // Wait 1 second between retries
  shouldRetryOnError: true, // Retry on error
  suspense: true, // Enable suspense by default for React 19
};

// =============================================================================
// Network Hooks
// =============================================================================

/**
 * Hook for fetching network summary with polling
 * Replaces useNetworkWorker
 *
 * @example
 * const { data, error, isLoading, mutate } = useNetworkSummary();
 */
export function useNetworkSummary(config?: SWRConfiguration) {
  return useSWR<NetworkSummary>('/api/networks', fetcher, {
    ...defaultConfig,
    ...config,
  });
}

/**
 * Hook for fetching specific network interface
 *
 * @example
 * const { data, error, isLoading } = useNetworkInterface('wlan0');
 */
export function useNetworkInterface(interfaceName: string | null, config?: SWRConfiguration) {
  return useSWR<{ interface: NetworkInterface }>(
    interfaceName ? `/api/networks/${interfaceName}` : null,
    fetcher,
    {
      ...defaultConfig,
      ...config,
    }
  );
}

/**
 * Hook for fetching hostapd status with polling
 * Replaces useHostapdWorker
 *
 * @example
 * const { data, error, isLoading } = useHostapdStatus();
 */
export function useHostapdStatus(config?: SWRConfiguration) {
  return useSWR<{ hostapd: HostapdStatus }>('/api/networks/hostapd/status', fetcher, {
    ...defaultConfig,
    ...config,
  });
}

// =============================================================================
// Services Hooks
// =============================================================================

/**
 * Hook for fetching services with polling
 * Replaces useServices
 *
 * @example
 * const { data, error, isLoading } = useServicesData('public');
 */
export function useServicesData(
  serviceType?: 'public' | 'private' | 'maintenance',
  config?: SWRConfiguration
) {
  const [searchParams] = useSearchParams();
  const domainOverride = searchParams.get('domain');

  // Build URL with query params
  const params = new URLSearchParams();
  if (serviceType) params.append('type', serviceType);
  if (domainOverride) params.append('domain', domainOverride);

  const url = `/api/services${params.toString() ? `?${params.toString()}` : ''}`;

  return useSWR<{ services: ServiceMetadata[] }>(url, fetcher, {
    ...defaultConfig,
    ...config,
    // Fallback data for services
    fallbackData: {
      services: getFallbackServices(
        serviceType || 'public',
        domainOverride || import.meta.env.VITE_BASE_DOMAIN || 'danger.diy'
      ),
    },
  });
}

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

// =============================================================================
// Config Hooks
// =============================================================================

/**
 * Hook for fetching app configuration
 * Replaces useConfig
 *
 * @example
 * const { data, error, isLoading } = useAppConfigData();
 */
export function useAppConfigData(config?: SWRConfiguration) {
  return useSWR<AppConfig>('/api/config', fetcher, {
    ...defaultConfig,
    refreshInterval: 0, // Don't poll config (it rarely changes)
    revalidateOnFocus: false, // Don't refetch on focus
    revalidateOnReconnect: false, // Don't refetch on reconnect
    ...config,
  });
}

// =============================================================================
// Helper Hooks (for backward compatibility)
// =============================================================================

/**
 * Get hotspot interface from network summary
 */
export function useHotspotInterface(config?: SWRConfiguration) {
  const { data, ...rest } = useNetworkSummary(config);

  const hotspot = data?.interfaces.find(iface => iface.purpose === 'wlan') || null;

  return {
    data: hotspot,
    ...rest,
  };
}

/**
 * Get internet interface from network summary
 */
export function useInternetInterface(config?: SWRConfiguration) {
  const { data, ...rest } = useNetworkSummary(config);

  const internet = data?.interfaces.find(iface => iface.purpose === 'wan') || null;

  return {
    data: internet,
    ...rest,
  };
}

/**
 * Get Tailscale interface from network summary
 */
export function useTailscaleInterface(config?: SWRConfiguration) {
  const { data, ...rest } = useNetworkSummary(config);

  const tailscale = data?.interfaces.find(iface => iface.type === 'tailscale') || null;

  return {
    data: tailscale,
    ...rest,
  };
}

// =============================================================================
// Tailscale Hooks
// =============================================================================

/**
 * Hook for fetching Tailscale settings
 *
 * @example
 * const { data, error, isLoading, mutate } = useTailscaleSettings();
 */
export function useTailscaleSettings(config?: SWRConfiguration) {
  return useSWR<TailscaleSettings>('/api/tailscale/settings', fetcher, {
    ...defaultConfig,
    ...config,
  });
}

/**
 * Hook for fetching available Tailscale exit nodes
 *
 * @example
 * const { data, error, isLoading } = useTailscaleExitNodes();
 */
export function useTailscaleExitNodes(config?: SWRConfiguration) {
  return useSWR<TailscaleExitNode[]>('/api/tailscale/exit-nodes', fetcher, {
    ...defaultConfig,
    ...config,
  });
}

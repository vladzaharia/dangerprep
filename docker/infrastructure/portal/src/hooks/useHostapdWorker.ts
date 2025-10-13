import { useMemo } from 'react';
import { useApiWorker, type ApiWorkerOptions } from './useApiWorker';

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

export interface HostapdWorkerOptions {
  pollInterval?: number; // milliseconds, default: 5000
  autoStart?: boolean; // auto-start polling on mount, default: true
}

/**
 * Hook to manage hostapd status fetching via Web Worker
 * Provides real-time hostapd status updates in the background
 *
 * This is a specialized wrapper around useApiWorker for hostapd status
 *
 * @example
 * const hostapd = useHostapdWorker({ pollInterval: 5000 });
 * const connectedClients = hostapd.data?.connectedClients || 0;
 */
export function useHostapdWorker(options: HostapdWorkerOptions = {}) {
  const {
    pollInterval = 5000,
    autoStart = true,
  } = options;

  const apiOptions: ApiWorkerOptions = useMemo(() => ({
    endpoint: '/api/networks/hostapd/status',
    pollInterval,
    queryParams: {},
    autoStart,
  }), [pollInterval, autoStart]);

  const result = useApiWorker<{ hostapd: HostapdStatus }>(apiOptions);

  // Transform the result to extract hostapd data from the nested structure
  return useMemo(() => ({
    ...result,
    data: result.data?.hostapd || null,
  }), [result]);
}

